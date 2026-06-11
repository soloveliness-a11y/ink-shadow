import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { zScript } from '@mmg/schema';
import { planVisualTasks } from '../src/planner.js';
import { VisualRunner } from '../src/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockScriptPath = resolve(__dirname, '../../../content/_mock/script.json');
const mockScript = zScript.parse(JSON.parse(readFileSync(mockScriptPath, 'utf-8')));

/** 动态计算 planner 应返回的任务数:所有未 done 的 visual spec + cover(mock 无 cover 时 planner 补 1)。测试不硬编码,避免耦合 _mock 磁盘状态。 */
function expectedTaskCount(script: typeof mockScript): number {
  const chars = script.characters.filter(c => c.visual.asset?.status !== 'done').length;
  const scenes = script.scenes.filter(s => s.visual.asset?.status !== 'done').length;
  const props = (script.props ?? []).filter(p => p.visual.asset?.status !== 'done').length;
  const clues = script.clues.filter(c => c.visual && c.visual.asset?.status !== 'done').length;
  const cover = script.meta.cover?.asset?.status === 'done' ? 0 : 1;
  return chars + scenes + props + clues + cover;
}

/** 全量任务数(不论 done 状态)。reconcile 以文件为真相,空目录 → 全量重出。 */
function totalEntryCount(script: typeof mockScript): number {
  return script.characters.length
    + script.scenes.length
    + (script.props?.length ?? 0)
    + script.clues.filter(c => c.visual).length
    + 1; // cover:meta.cover 存在则 1 entry,不存在则 planner 合成 1
}
/** 全 fresh 副本:清除所有 asset,让 planner 产出全部任务。用于验证命名/路径逻辑,不受 _mock done 状态影响。 */
function freshScript(): typeof mockScript {
  const s = structuredClone(mockScript);
  for (const c of s.characters) if (c.visual) c.visual.asset = undefined;
  for (const sc of s.scenes) if (sc.visual) sc.visual.asset = undefined;
  for (const p of s.props ?? []) if (p.visual) p.visual.asset = undefined;
  for (const cl of s.clues) if (cl.visual) cl.visual.asset = undefined;
  s.meta.cover = undefined;
  return s;
}

describe('planner', () => {
  it('extracts all visual tasks from mock script', () => {
    const tasks = planVisualTasks(mockScript);
    assert.equal(tasks.length, expectedTaskCount(mockScript));
  });

  it('names tasks with correct prefix by kind', () => {
    const fs = freshScript();
    const tasks = planVisualTasks(fs);
    const kinds = new Map(tasks.map(t => [t.id, t.spec.kind]));
    assert.equal(kinds.get('char_c_victim'), 'avatar');
    assert.equal(kinds.get('char_c_butler'), 'avatar');
    const sceneTasks = tasks.filter(t => t.id.startsWith('scene_'));
    assert.equal(sceneTasks.length, 3);
    assert.equal(sceneTasks[0]!.spec.kind, 'scene');
    const propTasks = tasks.filter(t => t.id.startsWith('prop_'));
    assert.equal(propTasks.length, 2);
    assert.equal(propTasks[0]!.spec.kind, 'prop');
    const clueTasks = tasks.filter(t => t.id.startsWith('clue_'));
    assert.equal(clueTasks.length, fs.clues.filter(c => c.visual).length);
    assert.ok(clueTasks.length >= 1);
    for (const ct of clueTasks) assert.ok(ct.spec.kind === 'prop' || ct.spec.kind === 'clue', `clue ${ct.id} kind=${ct.spec.kind}`);
  });

  it('skips tasks where asset.status=done', () => {
    const script = freshScript();
    const before = expectedTaskCount(script);
    script.characters[0]!.visual = {
      ...script.characters[0]!.visual,
      asset: { path: 'assets/avatar_c_victim.png', model: 'stub', generatedAt: '2026-01-01', status: 'done' },
    };
    const tasks = planVisualTasks(script);
    assert.equal(tasks.length, before - 1);
    assert.ok(!tasks.some(t => t.id === 'char_c_butler'));
  });

  it('generates correct output paths', () => {
    const tasks = planVisualTasks(freshScript());
    const paths = tasks.map(t => t.outputPath);
    assert.ok(paths.some(p => p === 'avatar_c_butler.png'));
    assert.ok(paths.some(p => p.startsWith('scene_') && p.endsWith('.png')));
    assert.ok(paths.some(p => p.startsWith('prop_') && p.endsWith('.png')));
  });
});

describe('runner', () => {
  // 隔离临时目录:stub 测试会写 1x1 像素图,绝不能污染真实 _mock/assets/。
  const tmpDir = mkdtempSync(join(tmpdir(), 'mmg-test-'));
  const tmpScriptPath = join(tmpDir, 'script.json');

  it('dryRun returns same tasks as planner', () => {
    const runner = new VisualRunner({ baseUrl: 'http://localhost:0', apiKey: 'test', model: 'stub' });
    const tasks = runner.dryRun(mockScript);
    assert.equal(tasks.length, expectedTaskCount(mockScript));
  });

  it('executes all tasks in stub mode', async () => {
    const fs = freshScript();
    const runner = new VisualRunner({ baseUrl: 'http://localhost:0', apiKey: 'test', model: 'stub', minIntervalMs: 0 });
    const { script, result } = await runner.run(fs, tmpScriptPath);

    // reconcile 以空 tmpDir 为真相 → freshScript 全部当 pending → 全量出图
    const expected = totalEntryCount(fs);
    assert.equal(result.total, expected);
    assert.equal(result.done, expected);
    assert.equal(result.failed, 0);
    assert.equal(script.meta.status, 'ready');

    for (const ch of script.characters) {
      assert.ok(ch.visual.asset, `character ${ch.id} missing asset`);
      assert.equal(ch.visual.asset.status, 'done');
      assert.match(ch.visual.asset.path, /^assets\/avatar_.*\.(png|webp)$/);
    }

    for (const sc of script.scenes) {
      assert.ok(sc.visual.asset, `scene ${sc.id} missing asset`);
      assert.equal(sc.visual.asset.status, 'done');
    }
  });

  it('resumes and skips done tasks', async () => {
    const runner1 = new VisualRunner({ baseUrl: 'http://localhost:0', apiKey: 'test', model: 'stub', minIntervalMs: 0 });
    const { script: completed } = await runner1.run(mockScript, tmpScriptPath);

    const runner2 = new VisualRunner({ baseUrl: 'http://localhost:0', apiKey: 'test', model: 'stub', resume: true, minIntervalMs: 0 });
    const { result } = await runner2.run(completed, tmpScriptPath);
    assert.equal(result.total, 0);
    assert.equal(result.skipped, 0);
  });

  it('reconcile heals ghost done (progress=done but file missing) and regenerates', async () => {
    // 独立 tmpDir,避免被前序测试的残留文件干扰
    const dir = mkdtempSync(join(tmpdir(), 'mmg-reconcile-'));
    const scriptPath = join(dir, 'script.json');
    const runner = new VisualRunner({ baseUrl: 'http://localhost:0', apiKey: 'test', model: 'stub', minIntervalMs: 0 });

    // 1. 全量出图一次 → 产生文件 + done asset + progress done
    const { script: done } = await runner.run(freshScript(), scriptPath);
    // 2. 删文件制造 ghost:asset.status 仍 done,但文件没了
    const assetPath = done.characters.find(c => c.id === 'c_victim')!.visual.asset!.path;
    const victimFile = join(dir, assetPath);
    assert.ok(existsSync(victimFile), 'prereq: file exists after first run');
    unlinkSync(victimFile);

    // 3. 再跑:reconcile 以文件为真相 → 检测缺失 → reset pending → 重新出图
    const runner2 = new VisualRunner({ baseUrl: 'http://localhost:0', apiKey: 'test', model: 'stub', minIntervalMs: 0 });
    const { script: healed, result } = await runner2.run(done, scriptPath);
    assert.equal(result.total, 1, 'ghost should be detected and regenerated');
    assert.equal(result.done, 1);
    const healedAsset = healed.characters.find(c => c.id === 'c_victim')!.visual.asset!;
    const healedFile = join(dir, healedAsset.path);
    assert.ok(existsSync(healedFile), 'file restored by reconcile+regen');
    assert.equal(healedAsset.status, 'done');
    assert.ok(healedAsset.promptHash, 'promptHash backfilled');
  });

  it('reconcile regenerates when prompt changed (promptHash mismatch)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmg-hash-'));
    const scriptPath = join(dir, 'script.json');
    const runner = new VisualRunner({ baseUrl: 'http://localhost:0', apiKey: 'test', model: 'stub', minIntervalMs: 0 });

    const { script: done } = await runner.run(freshScript(), scriptPath);

    // 改一个 character 的 prompt → 指纹变化 → 即使文件在也要重出
    const modified = structuredClone(done);
    const victim = modified.characters.find(c => c.id === 'c_victim')!;
    victim.visual.prompt = victim.visual.prompt + ' [revised]';

    const runner2 = new VisualRunner({ baseUrl: 'http://localhost:0', apiKey: 'test', model: 'stub', minIntervalMs: 0 });
    const { result } = await runner2.run(modified, scriptPath);
    assert.equal(result.total, 1, 'changed prompt should trigger regen');
    assert.equal(result.done, 1);
  });
});
