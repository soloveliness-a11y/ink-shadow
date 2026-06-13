import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { zScript, type Script } from '@mmg/schema';
import { planVisualTasks } from './planner.js';
import { VisualRunner } from './runner.js';
import { isScriptDir, loadFromDir } from './script-dir.js';

const args = process.argv.slice(2);

function usage() {
  console.log(`
Usage: mmg-visualize <scriptPath|dir> [options]

<scriptPath>  接受两种形式:
                - 单文件: content/_mock/script.json(全量 Script 容器,兼容旧工作流)
                - 多文件目录: content/_mock/(含 meta.json + clues.json + characters/...)
                  → 自动从 clues.json 等读取,生图完成后回写到对应分文件,不再依赖全量合成

                冲突时:若路径下同时存在 script.json 和多文件分文件,加 --dir 强制走目录模式。

Options:
  --api-url <url>      Image API base URL (default: https://5yuantoken.org/v1)
  --api-key <key>      API key (or set MMG_API_KEY env)
  --model <name>       Image model: gpt-5.5 | stub (default: gpt-5.5)
  --resume             Skip already-done tasks
  --dir                强制以多文件目录模式入参(默认自动 detect)
  --dry-run            Print task list without generating
  --status             Print per-spec state table (file/asset/progress/hash) and exit
  --interval <sec>     Min seconds between images (default: 240, min: 120)
  --help               Show this help
`.trim());
}

interface CliOpts {
  scriptPath: string;
  targetMode: 'file' | 'dir';
  apiUrl: string;
  apiKey: string;
  model: string;
  resume: boolean;
  dryRun: boolean;
  status: boolean;
  intervalMs: number;
}

function parseArgs(): CliOpts | null {
  if (args.includes('--help') || args.length === 0) { usage(); return null; }

  const positional = args.filter(a => !a.startsWith('--'));
  if (positional.length === 0) {
    console.error('Error: <scriptPath> is required');
    usage();
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i]?.startsWith('--')) {
      const key = args[i]!.slice(2);
      const val = args[i + 1];
      if (val && !val.startsWith('--')) { params[key] = val; i++; }
      else params[key] = 'true';
    }
  }

  const apiKey = params['api-key'] || process.env.MMG_API_KEY || '';
  const model = params.model || process.env.MMG_MODEL || 'gpt-5.5';
  const isStatus = params.status === 'true';

  // 模型名校验
  const VALID_MODELS = ['gpt-5.5', 'gpt-image-2', 'stub'];
  if (!VALID_MODELS.includes(model)) {
    console.error(`Error: Invalid model "${model}". Must be one of: ${VALID_MODELS.join(', ')}`);
    console.error('  gpt-5.5    — 推荐，稳定出图');
    console.error('  gpt-image-2 — 间歇性 502，不推荐');
    console.error('  stub       — 占位图，测试用');
    process.exit(1);
  }
  if (model === 'gpt-image-2') {
    console.warn('⚠️  gpt-image-2 间歇性 502，推荐使用 gpt-5.5');
  }

  // --status / --dry-run 是只读,不强制要 key
  if (model !== 'stub' && !apiKey && !isStatus) {
    console.error('Error: --api-key or MMG_API_KEY env is required for real generation');
    process.exit(1);
  }

  return {
    scriptPath: resolve(positional[0]!),
    targetMode: detectMode(positional[0]!, params.dir === 'true'),
    apiUrl: params['api-url'] || process.env.MMG_API_URL || 'https://5yuantoken.org/v1',
    apiKey,
    model,
    resume: params.resume === 'true',
    dryRun: params['dry-run'] === 'true',
    status: params.status === 'true',
    intervalMs: Math.max(120, Number(params.interval) || 240) * 1000,
  };
}

/** 检测入参是单文件 script.json 还是多文件目录。forceDir 时优先 dir */
function detectMode(path: string, forceDir: boolean): 'file' | 'dir' {
  const abs = resolve(path);
  if (forceDir) {
    if (!isScriptDir(abs)) {
      throw new Error(`--dir requested but ${path} is not a valid multi-file script dir (need meta.json + clues.json + characters/order.json)`);
    }
    return 'dir';
  }
  if (existsSync(abs) && abs.endsWith('.json')) return 'file';
  if (isScriptDir(abs)) return 'dir';
  throw new Error(`Not a script.json or multi-file script dir: ${path}`);
}

function loadScript(path: string, mode: 'file' | 'dir'): Script {
  if (mode === 'dir') {
    return loadFromDir(path);
  }
  if (!existsSync(path)) {
    throw new Error(`Script not found: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const parsed = zScript.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid script: ${parsed.error.issues.map(i => i.message).join('; ')}`);
  }
  return parsed.data;
}

async function main() {
  const opts = parseArgs();
  if (!opts) return;

  const script = loadScript(opts.scriptPath, opts.targetMode);
  console.log(`Script: ${script.meta.title} (${script.meta.id}) [mode=${opts.targetMode}]`);
  console.log(`Characters: ${script.characters.length} | Scenes: ${script.scenes.length} | Props: ${script.props?.length ?? 0} | Clues w/ visual: ${script.clues.filter(c => c.visual).length}`);

  if (opts.status) {
    const runner = new VisualRunner({
      baseUrl: opts.apiUrl, apiKey: opts.apiKey, model: opts.model,
    });
    const rows = runner.status(script, opts.scriptPath, opts.targetMode);
    console.log(`\nStatus (file = source of truth):\n`);
    console.log('  id                      kind     file  asset       progress    hash      action');
    console.log('  ----------------------  -------  ----  ----------  ----------  --------  --------');
    for (const r of rows) {
      console.log([
        ' ', r.id.padEnd(22), r.kind.padEnd(8),
        (r.file ? '✓' : '✗').padEnd(5),
        (r.assetStatus ?? '-').padEnd(10),
        (r.progressStatus ?? '-').padEnd(10),
        r.hash.padEnd(8),
        r.action,
      ].join('  '));
    }
    const need = rows.filter(r => r.action !== 'skip').length;
    console.log(`\n${rows.length} specs total | ${rows.length - need} done | ${need} need work (generate/regen).`);
    console.log(`meta.status: ${script.meta.status}`);
    return;
  }

  if (opts.dryRun) {
    const tasks = planVisualTasks(script);
    console.log(`\nVisual tasks (${tasks.length}):`);
    for (const t of tasks) {
      console.log(`  ${t.id.padEnd(20)} ${t.outputPath.padEnd(25)} [${t.spec.kind}] ${t.spec.aspect ?? '1:1'}`);
      console.log(`    "${t.spec.prompt.slice(0, 80)}..."`);
    }
    console.log(`\nTotal: ${tasks.length} images to generate.`);
    if (opts.model !== 'stub') {
      const estMin = Math.ceil(tasks.length * 75 / 60);
      console.log(`Estimated time: ~${estMin} minutes (at 75s per image)`);
    }
    return;
  }

  const runner = new VisualRunner({
    baseUrl: opts.apiUrl,
    apiKey: opts.apiKey,
    model: opts.model,
    resume: opts.resume,
    minIntervalMs: opts.intervalMs,
  });

  const { script: updated, result } = await runner.run(script, { mode: opts.targetMode, path: opts.scriptPath });

  console.log(`\n[mode=${opts.targetMode}] Result: ${result.done} done, ${result.failed} failed, ${result.skipped} skipped / ${result.total} total`);

  if (result.failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
