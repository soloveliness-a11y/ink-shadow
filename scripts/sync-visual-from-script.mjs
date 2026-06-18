/**
 * sync-visual-from-script.mjs —— 把 script.json 里的 visual.asset 写回到分文件
 *
 * 适用场景:
 *   - 旧管线时代用单文件 script.json 跑生成,分文件没同步
 *   - 一次性的数据迁移,运行后建议删除
 *
 * 用法: node scripts/sync-visual-from-script.mjs content/mock
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2] ?? 'content/mock');
if (!existsSync(join(root, 'script.json'))) {
  console.error(`script.json not found at ${root}`);
  process.exit(1);
}

const script = JSON.parse(readFileSync(join(root, 'script.json'), 'utf-8'));

// 1. meta.json
if (script.meta.cover) {
  const metaPath = join(root, 'meta.json');
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
  meta.cover = script.meta.cover;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log('✓ meta.json (cover)');
}

// 2. scenes.json
{
  const path = join(root, 'scenes.json');
  const scenes = JSON.parse(readFileSync(path, 'utf-8'));
  let n = 0;
  for (const sc of script.scenes ?? []) {
    const f = scenes.find(s => s.id === sc.id);
    if (f && sc.visual) { f.visual = sc.visual; n++; }
  }
  writeFileSync(path, JSON.stringify(scenes, null, 2) + '\n');
  console.log(`✓ scenes.json (${n} updated)`);
}

// 3. props.json
if (existsSync(join(root, 'props.json'))) {
  const path = join(root, 'props.json');
  const props = JSON.parse(readFileSync(path, 'utf-8'));
  let n = 0;
  for (const pr of script.props ?? []) {
    const f = props.find(p => p.id === pr.id);
    if (f && pr.visual) { f.visual = pr.visual; n++; }
  }
  writeFileSync(path, JSON.stringify(props, null, 2) + '\n');
  console.log(`✓ props.json (${n} updated)`);
}

// 4. characters/*.json
{
  const charsDir = join(root, 'characters');
  const order = JSON.parse(readFileSync(join(charsDir, 'order.json'), 'utf-8'));
  let n = 0;
  for (const cid of order) {
    const sc = script.characters.find(c => c.id === cid);
    if (!sc) continue;
    const cp = join(charsDir, `${cid}.json`);
    const f = JSON.parse(readFileSync(cp, 'utf-8'));
    if (sc.visual) { f.visual = sc.visual; n++; }
    writeFileSync(cp, JSON.stringify(f, null, 2) + '\n');
  }
  console.log(`✓ characters/ (${n} updated)`);
}

// 5. clues.json
{
  const path = join(root, 'clues.json');
  const clues = JSON.parse(readFileSync(path, 'utf-8'));
  let n = 0;
  for (const cc of script.clues) {
    const f = clues.find(c => c.id === cc.id);
    if (f && cc.visual) { f.visual = cc.visual; n++; }
  }
  writeFileSync(path, JSON.stringify(clues, null, 2) + '\n');
  console.log(`✓ clues.json (${n} updated)`);
}

console.log('\n✅ All visuals synced from script.json → split files.');
