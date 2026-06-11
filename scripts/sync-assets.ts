/**
 * 同步 assets/ 目录的实际图片到 script.json 的 visual.asset。
 * 按命名规则反向匹配:
 *   avatar_<charId>.png / scene_<sceneId>.png / prop_<propId>.png / clue_<clueId>.png / cover.png
 * 用途:修复历史回填不一致;阶段4补出图后统一落盘。
 *
 * Usage: pnpm exec tsx scripts/sync-assets.ts [scriptId=_mock]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const scriptId = process.argv[2] ?? '_mock';
const dir = resolve('content', scriptId);
const scriptPath = join(dir, 'script.json');
const assetsDir = join(dir, 'assets');

if (!existsSync(scriptPath)) {
  console.error(`Not found: ${scriptPath}`);
  process.exit(1);
}

const script = JSON.parse(readFileSync(scriptPath, 'utf-8'));
const files = new Set(existsSync(assetsDir) ? readdirSync(assetsDir) : []);
const now = new Date().toISOString();
const model = process.env.VISUAL_MODEL ?? 'gpt-5.5';

function mkAsset(file: string) {
  return { path: `assets/${file}`, model, generatedAt: now, status: 'done' as const };
}

let synced = 0;
const log: string[] = [];

for (const c of script.characters ?? []) {
  const f = `avatar_${c.id}.png`;
  if (files.has(f) && c.visual && !c.visual.asset) { c.visual.asset = mkAsset(f); synced++; log.push(f); }
}
for (const s of script.scenes ?? []) {
  const f = `scene_${s.id}.png`;
  if (files.has(f) && s.visual && !s.visual.asset) { s.visual.asset = mkAsset(f); synced++; log.push(f); }
}
for (const p of script.props ?? []) {
  const f = `prop_${p.id}.png`;
  if (files.has(f) && p.visual && !p.visual.asset) { p.visual.asset = mkAsset(f); synced++; log.push(f); }
}
for (const cl of script.clues ?? []) {
  const f = `clue_${cl.id}.png`;
  if (files.has(f)) {
    if (!cl.visual) cl.visual = { kind: 'clue', prompt: cl.title, aspect: '4:3' };
    if (!cl.visual.asset) { cl.visual.asset = mkAsset(f); synced++; log.push(f); }
  }
}
if (files.has('cover.png')) {
  if (!script.meta.cover) script.meta.cover = { kind: 'cover', prompt: script.meta.synopsis, aspect: '3:4' };
  if (!script.meta.cover.asset) { script.meta.cover.asset = mkAsset('cover.png'); synced++; log.push('cover.png'); }
}

writeFileSync(scriptPath, JSON.stringify(script, null, 2), 'utf-8');
console.log(`Synced ${synced} asset(s) into ${scriptId}/script.json`);
if (log.length) console.log('  ' + log.join('\n  '));
