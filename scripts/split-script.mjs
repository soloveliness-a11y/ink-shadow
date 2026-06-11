/**
 * 迁移工具：将单一 script.json 拆分为多文件目录结构。
 * 用法：node scripts/split-script.mjs content/_mock
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const targetDir = resolve(process.argv[2] ?? 'content/_mock');
const oldPath = join(targetDir, 'script.json');

if (!existsSync(oldPath)) {
  console.error(`script.json not found at ${oldPath}`);
  process.exit(1);
}

const script = JSON.parse(readFileSync(oldPath, 'utf8'));
const charsDir = join(targetDir, 'characters');
if (!existsSync(charsDir)) mkdirSync(charsDir, { recursive: true });

// 1. meta.json
writeFileSync(join(targetDir, 'meta.json'), JSON.stringify(script.meta, null, 2), 'utf8');
console.log(`✓ meta.json (${script.meta.title})`);

// 2. characters/*.json
const charOrder = script.characters.map(ch => ch.id);
writeFileSync(join(charsDir, 'order.json'), JSON.stringify(charOrder, null, 2), 'utf8');
console.log(`✓ characters/order.json (${charOrder.length} chars: ${charOrder.join(', ')})`);

for (const ch of script.characters) {
  // 移除 isVictim/isMurderer 上的多余字段，只保留核心数据
  const { name, gender, age, isVictim, isMurderer, publicProfile, privateScript, storyByPhase, objectives, secrets, timeline, relationships, visual } = ch;
  const charData = { id: ch.id, name, gender, age, isVictim, isMurderer, publicProfile, privateScript, storyByPhase, objectives, secrets, timeline, relationships, visual };
  const filename = join(charsDir, `${ch.id}.json`);
  writeFileSync(filename, JSON.stringify(charData, null, 2), 'utf8');
  console.log(`✓ characters/${ch.id}.json (${ch.name})`);
}

// 3. clues.json
writeFileSync(join(targetDir, 'clues.json'), JSON.stringify(script.clues, null, 2), 'utf8');
console.log(`✓ clues.json (${script.clues.length} clues)`);

// 4. scenes.json
writeFileSync(join(targetDir, 'scenes.json'), JSON.stringify(script.scenes, null, 2), 'utf8');
console.log(`✓ scenes.json (${script.scenes.length} scenes)`);

// 5. props.json
writeFileSync(join(targetDir, 'props.json'), JSON.stringify(script.props ?? [], null, 2), 'utf8');
console.log(`✓ props.json (${(script.props ?? []).length} props)`);

// 6. phases.json
writeFileSync(join(targetDir, 'phases.json'), JSON.stringify(script.phases, null, 2), 'utf8');
console.log(`✓ phases.json (${script.phases.length} phases)`);

// 7. flow.json
writeFileSync(join(targetDir, 'flow.json'), JSON.stringify(script.flow, null, 2), 'utf8');
console.log(`✓ flow.json`);

// 8. truth.json
writeFileSync(join(targetDir, 'truth.json'), JSON.stringify(script.truth, null, 2), 'utf8');
console.log(`✓ truth.json`);

// 9. 保留旧 script.json 作为备份，重命名
const backupPath = join(targetDir, 'script.json.bak');
writeFileSync(backupPath, JSON.stringify(script, null, 2), 'utf8');
console.log(`\n📦 Backup: script.json.bak`);
console.log(`✅ Split complete. ${script.characters.length} characters → ${charsDir}/`);
console.log(`   Original preserved as script.json.bak`);
