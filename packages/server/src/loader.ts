import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { zScript, validateScript } from '@mmg/schema';
import type { Script } from '@mmg/schema';

export interface LoadedScript {
  script: Script;
  path: string;
}

/**
 * 加载并校验剧本包。
 * 支持两种格式：
 *   1. 新格式（目录结构）：meta.json + characters/*.json + clues.json + ...
 *   2. 旧格式（单文件）：script.json
 */
export function loadScript(inputPath: string): LoadedScript {
  const resolved = resolve(inputPath);

  // 新格式：检查 meta.json
  const metaPath = resolved.endsWith('meta.json')
    ? resolved
    : join(resolved, 'meta.json');

  if (existsSync(metaPath)) {
    return loadSplitFormat(metaPath);
  }

  // 旧格式：script.json
  const jsonPath = resolved.endsWith('.json')
    ? resolved
    : join(resolved, 'script.json');

  if (!existsSync(jsonPath)) {
    throw new Error(`剧本文件不存在: ${jsonPath} (也检查了目录结构: ${join(resolved, 'meta.json')})`);
  }

  return loadLegacyFormat(jsonPath);
}

/** 新格式：从拆分后的目录加载 */
function loadSplitFormat(metaPath: string): LoadedScript {
  const dir = resolve(metaPath, '..');
  const charsDir = join(dir, 'characters');

  // 1. meta.json
  if (!existsSync(metaPath)) throw new Error(`meta.json 不存在: ${metaPath}`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

  // 2. characters
  const characters: unknown[] = [];
  const orderPath = join(charsDir, 'order.json');
  if (existsSync(orderPath)) {
    const order: string[] = JSON.parse(readFileSync(orderPath, 'utf8'));
    for (const id of order) {
      const charPath = join(charsDir, `${id}.json`);
      if (!existsSync(charPath)) throw new Error(`角色文件不存在: ${charPath}`);
      characters.push(JSON.parse(readFileSync(charPath, 'utf8')));
    }
  } else {
    // 无 order.json 时按文件名排序
    const files = readdirSync(charsDir)
      .filter((f) => f.endsWith('.json') && f !== 'order.json')
      .sort();
    for (const f of files) {
      characters.push(JSON.parse(readFileSync(join(charsDir, f), 'utf8')));
    }
  }

  // 3. 其他文件
  const clues = readArrayFile(dir, 'clues.json');
  const scenes = readArrayFile(dir, 'scenes.json');
  const props = readArrayFile(dir, 'props.json');
  const phases = readArrayFile(dir, 'phases.json');
  const flow = readObjectFile(dir, 'flow.json');
  const truth = readObjectFile(dir, 'truth.json');

  const raw = { meta, characters, clues, scenes, props, phases, flow, truth };
  return validateAndReturn(raw, dir);
}

/** 旧格式：从单一 script.json 加载 */
function loadLegacyFormat(jsonPath: string): LoadedScript {
  const raw: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
  return validateAndReturn(raw, jsonPath);
}

function validateAndReturn(raw: unknown, path: string): LoadedScript {
  const parsed = zScript.safeParse(raw);
  if (!parsed.success) {
    const msgs = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`剧本结构校验失败:\n${msgs}`);
  }

  const result = validateScript(parsed.data);
  if (!result.ok) {
    const msgs = result.issues
      .filter((i) => i.level === 'error')
      .map((i) => `  [${i.code}] ${i.path}: ${i.message}`)
      .join('\n');
    throw new Error(`剧本自洽校验失败:\n${msgs}`);
  }

  return { script: parsed.data, path };
}

function readArrayFile(dir: string, filename: string): unknown[] {
  const p = join(dir, filename);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, 'utf8'));
}

function readObjectFile(dir: string, filename: string): unknown {
  const p = join(dir, filename);
  if (!existsSync(p)) throw new Error(`缺少必需文件: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}
