/**
 * 将单文件 script.json 拆分为 _mock 风格的多 json 目录结构。
 * 内置等价验证:拆分前 parse 单文件 → 拆分 → loadScript(走 loadSplitFormat)→ 深对比 Script。
 * 用法:npx tsx scripts/split-script.ts content/<id>
 */
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadScript } from '../packages/server/src/loader.js';
import { writeScriptSplit } from './write-script.js';

const dir = resolve(process.argv[2] ?? './content/danshui');
const scriptPath = join(dir, 'script.json');
if (!existsSync(scriptPath)) {
  console.error(`✗ 无 script.json: ${scriptPath}`);
  process.exit(1);
}
if (existsSync(join(dir, 'meta.json'))) {
  console.error(`✗ 已存在 meta.json(可能已拆分): ${dir}`);
  process.exit(1);
}

// 1. 拆分前:loadScript 走 loadLegacyFormat(单文件,此时无 meta.json)
const before = loadScript(scriptPath).script;

// 2. 拆分写文件(复用 writeScriptSplit,与 produce 输出格式一致)
writeScriptSplit(before, dir);

// 3. 拆分后:loadScript(meta.json 存在 → 走 loadSplitFormat)
const after = loadScript(join(dir, 'meta.json')).script;

// 4. 深对比(内容等价,不依赖对象键顺序;props 容忍 undefined vs [])
const norm = (s: typeof before) => ({ ...s, props: s.props ?? [] }) as typeof before;
const findDiff = (x: unknown, y: unknown, path = ''): string | null => {
  if (typeof x !== typeof y) return `${path}: 类型 ${typeof x} vs ${typeof y}`;
  if (Array.isArray(x)) {
    if (x.length !== (y as unknown[]).length) return `${path}: 长度 ${x.length} vs ${(y as unknown[]).length}`;
    for (let i = 0; i < x.length; i++) { const d = findDiff(x[i], (y as unknown[])[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  if (x && typeof x === 'object') {
    const keys = new Set([...Object.keys(x as object), ...Object.keys(y as object)]);
    for (const k of keys) { const d = findDiff((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], path ? `${path}.${k}` : k); if (d) return d; }
    return null;
  }
  return x === y ? null : `${path}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`;
};
const diff = findDiff(norm(before), norm(after));
const equal = diff === null;

console.log(`拆分 ${dir}:`);
console.log(`  characters ${before.characters.length} → ${after.characters.length} · clues ${before.clues.length} → ${after.clues.length} · phases ${before.phases.length} → ${after.phases.length}`);
console.log(`  等价验证: ${equal ? '✅ 拆分前后 Script 内容完全等价' : '❌ 不一致'}`);
if (!equal) { console.error('  首个差异:', diff); process.exit(1); }
