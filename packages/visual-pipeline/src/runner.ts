import { writeFileSync, readFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { planVisualTasks, listAllVisualEntries, promptFingerprint, type VisualTask } from './planner.js';
import { ImageClient } from './image-client.js';
import type { Script, VisualSpec, VisualAsset } from '@mmg/schema';
import { saveToDir } from './script-dir.js';

/** 尝试用 sharp 将 PNG Buffer 转为 WebP。失败则返回原始 buffer。 */
async function toWebp(buf: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buf).webp({ quality: 82, effort: 4 }).toBuffer();
  } catch {
    return buf;
  }
}

/** 将 .png 扩展名替换为 .webp */
function webpPath(pngPath: string): string {
  return pngPath.replace(/\.png$/, '.webp');
}

export type ScriptTarget =
  | { mode: 'file'; path: string }
  | { mode: 'dir'; path: string };

export interface RunnerOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  concurrency?: number;
  resume?: boolean;
  /** 每张图之间的最小间隔(毫秒),默认 240-300s 随机(避免风控) */
  minIntervalMs?: number;
}

export interface TaskProgress {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  outputPath: string;
  attempts: number;
  error?: string;
}

export interface ProgressFile {
  tasks: Record<string, TaskProgress>;
  updatedAt: string;
}

export interface RunResult {
  total: number;
  done: number;
  failed: number;
  skipped: number;
}

export interface StatusRow {
  id: string;
  kind: string;
  file: boolean;
  assetStatus?: string;
  progressStatus?: string;
  /** ok=指纹匹配; mismatch=文件在但 prompt 变了(需重出); none=无指纹(旧数据) */
  hash: 'ok' | 'mismatch' | 'none';
  /** skip=已完成; generate=文件缺失; regen=prompt 变了需重出 */
  action: 'skip' | 'generate' | 'regen';
}

export class VisualRunner {
  private client: ImageClient;
  private resume: boolean;
  private model: string;
  private minIntervalMs: number;

  constructor(private opts: RunnerOptions) {
    this.model = opts.model ?? 'gpt-5.5';
    this.client = new ImageClient({
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      model: this.model,
      stub: this.model === 'stub',
    });
    this.resume = opts.resume ?? false;
    // 240-300 秒随机间隔(总周期 ~350s,匹配中转站节奏)
    this.minIntervalMs = opts.minIntervalMs ?? (240_000 + Math.floor(Math.random() * 60_000));
  }

  /** dry-run: 只输出任务清单,不出图 */
  dryRun(script: Script): VisualTask[] {
    return planVisualTasks(script);
  }

  /**
   * 状态报告(只读):一眼看清每个 spec 的 文件/asset/progress/指纹 是否一致。
   * 供 --status 用,杜绝新会话肉眼 jq 误判。
   */
  status(script: Script, scriptPath: string, mode: 'file' | 'dir' = 'file'): StatusRow[] {
    const scriptDir = mode === 'dir'
      ? resolve(scriptPath)
      : dirname(resolve(scriptPath));
    const assetsDir = join(scriptDir, 'assets');
    const progress = this.loadProgress(join(scriptDir, '.visual-progress.json'));
    const styleGuide = script.meta.styleGuide;

    return listAllVisualEntries(script).map(e => {
      const file = existsSync(join(assetsDir, e.outputPath));
      const expected = promptFingerprint(e.spec, styleGuide);
      const stored = e.spec.asset?.promptHash;
      const hash: StatusRow['hash'] = !stored ? 'none' : (stored === expected ? 'ok' : 'mismatch');
      const action: StatusRow['action'] = !file ? 'generate' : (hash === 'mismatch' ? 'regen' : 'skip');
      return {
        id: e.id,
        kind: e.spec.kind,
        file,
        assetStatus: e.spec.asset?.status,
        progressStatus: progress.tasks[e.id]?.status,
        hash,
        action,
      };
    });
  }

  /** 执行出图 + 回填 */
  async run(script: Script, target: ScriptTarget | string): Promise<{ script: Script; result: RunResult }> {
    // 向后兼容:字符串入参按 file 模式处理
    const tgt: ScriptTarget = typeof target === 'string'
      ? { mode: 'file', path: target }
      : target;
    // dir 模式:path 已是目录,直接 resolve;file 模式:取 dirname 得到 scriptDir
    const scriptDir = tgt.mode === 'dir'
      ? resolve(tgt.path)
      : dirname(resolve(tgt.path));
    const assetsDir = join(scriptDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });

    const progressPath = join(scriptDir, '.visual-progress.json');
    const progress = this.loadProgress(progressPath);

    /** 写盘封装:file → writeFileSync(json),dir → saveToDir */
    const writeScript = (s: Script) => {
      if (tgt.mode === 'dir') saveToDir(tgt.path, s);
      else writeFileSync(tgt.path, JSON.stringify(s, null, 2), 'utf-8');
    };

    // ── 落盘自愈:以"文件存在"为唯一真相,校正 progress + asset + 清幽灵 ──
    // 必须在 planVisualTasks 之前,让 planner 看到的是自洽状态。
    script = await this.reconcile(script, scriptDir, progress);
    this.saveProgress(progressPath, progress);
    writeScript(script);

    const tasks = planVisualTasks(script);
    if (tasks.length === 0) {
      if (script.meta.status !== 'ready') {
        script.meta.status = 'ready';
        writeScript(script);
      }
      console.log('All visuals already done, nothing to generate.');
      return { script, result: { total: 0, done: 0, failed: 0, skipped: 0 } };
    }

    console.log(`Planned ${tasks.length} visual tasks (model=${this.model}).`);
    console.log(`Rate limit: ~${Math.round(this.minIntervalMs / 1000)}s between requests.`);

    const styleGuide = script.meta.styleGuide;

    // 顺序执行(并发会触发风控),每张之间等待
    const results: { task: VisualTask; status: 'done' | 'failed' | 'skipped' }[] = [];
    let lastGenTime = 0;
    let consecutiveFails = 0;
    const MAX_CONSECUTIVE_FAILS = 3; // 连续失败超限则停止，等用户决策

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]!;

      // resume: 跳过 文件存在 & 指纹匹配 的(reconcile 已校正,这里做保险)
      if (this.resume) {
        const fileExists = existsSync(join(assetsDir, task.outputPath));
        const hashOK = !task.spec.asset?.promptHash
          || task.spec.asset.promptHash === promptFingerprint(task.spec, styleGuide);
        if (fileExists && hashOK) {
          console.log(`[${i + 1}/${tasks.length}] [skip] ${task.id} (already done)`);
          results.push({ task, status: 'skipped' });
          continue;
        }
      }

      // 连续失败超限 → 停止，等用户决策
      if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        console.error(`\n⛔ 连续 ${consecutiveFails} 张图失败，停止出图。`);
        console.error(`   已完成 ${results.filter(r => r.status === 'done').length} 张，剩余 ${tasks.length - i} 张待处理。`);
        console.error(`   API 可能不稳定，请稍后用 --resume 重试。`);
        // 标记剩余为跳过（不继续浪费重试次数）
        for (let j = i; j < tasks.length; j++) {
          results.push({ task: tasks[j]!, status: 'skipped' });
        }
        break;
      }

      // 速率限制: 确保距离上一次生图 >= minIntervalMs
      const elapsed = Date.now() - lastGenTime;
      if (lastGenTime > 0 && elapsed < this.minIntervalMs) {
        const waitSec = Math.ceil((this.minIntervalMs - elapsed) / 1000);
        console.log(`\n⏳ Rate limit: waiting ${waitSec}s before next request...`);
        await sleep(this.minIntervalMs - elapsed);
      }

      const result = await this.executeTask(task, styleGuide, assetsDir, progress, progressPath);
      results.push({ task, status: result });
      if (result === 'done') {
        lastGenTime = Date.now();
        consecutiveFails = 0; // 成功则重置计数
      } else {
        consecutiveFails++;
      }

      console.log(`[${i + 1}/${tasks.length}] ${task.id}: ${result}`);
    }

    // Backfill
    const updated = this.backfill(script, tasks, results, styleGuide);

    const done = results.filter(r => r.status === 'done').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    if (failed === 0 && (done + skipped) === tasks.length) {
      updated.meta.status = 'ready';
      console.log(`\n✅ All visuals done! Script status → ready.`);
    } else if (failed > 0) {
      console.error(`\n${done} done, ${failed} failed, ${skipped} skipped. Script status remains validated.`);
    }

    this.saveProgress(progressPath, progress);
    return { script: updated, result: { total: tasks.length, done, failed, skipped } };
  }

  /**
   * 落盘自愈:以 assets/ 中的文件(.webp 优先,.png 兜底)为唯一真相。
   * 自动将已有 .png 迁移为 .webp,校正 progress + script.asset。
   * 同时检测 promptHash 变化:prompt 改了即使文件在也标 pending 重出。
   */
  private async reconcile(script: Script, scriptDir: string, progress: ProgressFile): Promise<Script> {
    const assetsDir = join(scriptDir, 'assets');
    const styleGuide = script.meta.styleGuide;
    const entries = listAllVisualEntries(script);
    const validIds = new Set(entries.map(e => e.id));

    let ghostsRemoved = 0;
    for (const id of Object.keys(progress.tasks)) {
      if (!validIds.has(id)) { delete progress.tasks[id]; ghostsRemoved++; }
    }

    const updated = structuredClone(script);
    let promotedDone = 0;
    let resetPending = 0;
    let migrated = 0;

    for (const e of entries) {
      // 检测文件:优先 .webp,其次 .png
      const webpFile = webpPath(e.outputPath);
      const pngFile = e.outputPath;
      const hasWebp = existsSync(join(assetsDir, webpFile));
      const hasPng = existsSync(join(assetsDir, pngFile));
      const actualPath = hasWebp ? webpFile : (hasPng ? pngFile : null);

      const expectedHash = promptFingerprint(e.spec, styleGuide);
      const storedHash = e.spec.asset?.promptHash;
      const hashOK = !storedHash || storedHash === expectedHash;
      const wasDone = e.spec.asset?.status === 'done';

      if (actualPath && hashOK) {
        // 自动迁移:有 .png 但没有 .webp → 转换并替换
        if (hasPng && !hasWebp) {
          try {
            const pngBuf = readFileSync(join(assetsDir, pngFile));
            const webpBuf = await toWebp(pngBuf);
            if (webpBuf !== pngBuf) {
              writeFileSync(join(assetsDir, webpFile), webpBuf);
              unlinkSync(join(assetsDir, pngFile));
              migrated++;
            }
          } catch { /* 迁移失败,保留 .png */ }
        }

        const finalPath = hasWebp || migrated > 0 ? webpFile : actualPath;
        // 重新检查:迁移后可能有 .webp 了
        const usePath = existsSync(join(assetsDir, webpFile)) ? webpFile : actualPath;
        const desired: VisualAsset = {
          path: `assets/${usePath}`,
          model: e.spec.asset?.model ?? this.model,
          generatedAt: e.spec.asset?.generatedAt ?? new Date().toISOString(),
          status: 'done',
          promptHash: expectedHash,
        };
        if (!wasDone) promotedDone++;
        setNestedProp(updated as unknown as Record<string, unknown>, e.path, { ...e.spec, asset: desired });
        progress.tasks[e.id] = {
          id: e.id, status: 'done', outputPath: usePath,
          attempts: progress.tasks[e.id]?.attempts ?? 1,
        };
      } else {
        if (wasDone || !hashOK) resetPending++;
        setNestedProp(updated as unknown as Record<string, unknown>, e.path, { ...e.spec, asset: undefined });
        progress.tasks[e.id] = { id: e.id, status: 'pending', outputPath: e.outputPath, attempts: 0 };
      }
    }

    const parts: string[] = [];
    if (ghostsRemoved) parts.push(`${ghostsRemoved} ghost(s) removed`);
    if (promotedDone) parts.push(`${promotedDone} promoted→done`);
    if (resetPending) parts.push(`${resetPending} reset→pending`);
    if (migrated) parts.push(`${migrated} png→webp`);
    if (parts.length) console.log(`🔧 reconcile: ${parts.join(', ')}.`);
    return updated;
  }

  private async executeTask(
    task: VisualTask,
    styleGuide: string,
    assetsDir: string,
    progress: ProgressFile,
    progressPath: string,
  ): Promise<'done' | 'failed'> {
    const maxRetries = 3;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        progress.tasks[task.id] = { id: task.id, status: 'running', outputPath: task.outputPath, attempts: attempt };
        this.saveProgress(progressPath, progress);

        console.log(`\n🎨 ${task.id} (attempt ${attempt}/${maxRetries + 1})`);
        console.log(`  ${task.spec.prompt.slice(0, 80)}...`);

        const buf = await this.client.generateAndWait(task.spec, styleGuide);

        // 尝试 WebP 转换:减小体积,失败则保留 PNG
        const webpBuf = await toWebp(buf);
        const isWebp = webpBuf !== buf;
        const finalOutputPath = isWebp ? webpPath(task.outputPath) : task.outputPath;

        // 原子写:.tmp → rename,防写一半崩溃留半文件
        const finalPath = join(assetsDir, finalOutputPath);
        const tmpPath = join(assetsDir, `${finalOutputPath}.tmp`);
        writeFileSync(tmpPath, webpBuf);
        renameSync(tmpPath, finalPath);

        // WebP 转换成功后,更新 task.outputPath 供 backfill 使用
        if (isWebp) task.outputPath = finalOutputPath;

        progress.tasks[task.id] = { id: task.id, status: 'done', outputPath: finalOutputPath, attempts: attempt };
        this.saveProgress(progressPath, progress);

        console.log(`  ✅ saved ${finalOutputPath} (${(webpBuf.length / 1024).toFixed(0)} KB)${isWebp ? ' [webp]' : ''}`);
        return 'done';
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`  ❌ attempt ${attempt}: ${lastError}`);
        // 失败后等一下再重试(中转站间歇性 502,等久一点)
        if (attempt <= maxRetries) {
          const waitSec = 90 + Math.floor(Math.random() * 30);
          console.log(`  waiting ${waitSec}s before retry...`);
          await sleep(waitSec * 1000);
        }
      }
    }

    progress.tasks[task.id] = {
      id: task.id, status: 'failed', outputPath: task.outputPath,
      attempts: maxRetries + 1, error: lastError,
    };
    this.saveProgress(progressPath, progress);
    return 'failed';
  }

  private backfill(
    script: Script,
    tasks: VisualTask[],
    results: { task: VisualTask; status: string }[],
    styleGuide: string,
  ): Script {
    const updated = structuredClone(script);

    for (const result of results) {
      if (result.status === 'skipped') continue;

      const task = result.task;
      const now = new Date().toISOString();
      const failed = result.status !== 'done';
      const asset: VisualAsset = {
        path: `assets/${task.outputPath}`,
        model: this.model,
        generatedAt: now,
        status: failed ? 'failed' : 'done',
        promptHash: promptFingerprint(task.spec, styleGuide),
        ...(failed ? { error: 'Generation failed after retries' } : {}),
      };

      setNestedProp(updated as unknown as Record<string, unknown>, task.path, { ...task.spec, asset });
    }

    return updated;
  }

  private loadProgress(path: string): ProgressFile {
    if (existsSync(path)) {
      try { return JSON.parse(readFileSync(path, 'utf-8')); }
      catch { /* corrupt file, start fresh */ }
    }
    return { tasks: {}, updatedAt: new Date().toISOString() };
  }

  private saveProgress(path: string, progress: ProgressFile) {
    progress.updatedAt = new Date().toISOString();
    writeFileSync(path, JSON.stringify(progress, null, 2));
  }
}

function setNestedProp(obj: Record<string, unknown>, dotPath: string, value: unknown) {
  const parts = dotPath.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
