import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const contentDir = resolve(root, 'content');

const SCRIPTS = [
  'daiyuesisha', 'exishangling', 'jinghun', 'jinyuan', 'liejing',
  'niandao', 'shuiqiang', 'shuixiu', 'xiaoyi', 'youling',
  'yuelu', 'yueluowa', 'zhulian',
];

function readJson(p: string) { return JSON.parse(readFileSync(p, 'utf-8')); }
function writeJson(p: string, d: unknown) { writeFileSync(p, JSON.stringify(d, null, 2) + '\n'); }

for (const id of SCRIPTS) {
  const dir = resolve(contentDir, id);
  const charsDir = join(dir, 'characters');
  const truthPath = join(dir, 'truth.json');
  const phasesPath = join(dir, 'phases.json');
  const cluesPath = join(dir, 'clues.json');

  if (!existsSync(charsDir)) continue;

  // 1. 建 name→ID 映射
  const nameToId = new Map<string, string>();
  const charFiles = readdirSync(charsDir).filter(f => f.endsWith('.json') && f !== 'order.json');
  const chars: Record<string, any>[] = [];
  for (const f of charFiles) {
    const c = readJson(join(charsDir, f));
    if (!c.id) continue;
    chars.push(c);
    nameToId.set(c.name, c.id);
    // 也用去掉编号前缀的名字匹配
    const cleanName = c.name.replace(/^\d+/, '');
    if (cleanName !== c.name) nameToId.set(cleanName, c.id);
  }
  const charIds = chars.map(c => c.id);

  // 2. 修复 relationships: name → ID
  let relFixed = 0;
  for (const c of chars) {
    if (!c.relationships) continue;
    let changed = false;
    for (const r of c.relationships) {
      const target = r.targetCharId;
      if (target && !charIds.includes(target)) {
        // 尝试用名字匹配
        const mapped = nameToId.get(target);
        if (mapped) {
          r.targetCharId = mapped;
          changed = true;
          relFixed++;
        }
      }
    }
    if (changed) writeJson(join(charsDir, `${c.id}.json`), c);
  }

  // 3. 读 truth
  const truth = existsSync(truthPath) ? readJson(truthPath) : null;

  // 4. 从 truth 推断 isVictim / isMurderer
  const murdererIds = (truth?.murdererCharIds ?? []).filter((m: any) => typeof m === 'string' && charIds.includes(m));
  let victimIds: string[] = [];

  // 尝试从 truth 中找受害者
  if (truth?.victim && typeof truth.victim === 'string') {
    const mapped = nameToId.get(truth.victim) ?? (charIds.includes(truth.victim) ? truth.victim : null);
    if (mapped) victimIds.push(mapped);
  }

  // 如果没有 victim 字段，从角色数据推断
  if (victimIds.length === 0) {
    for (const c of chars) {
      const name = c.name ?? '';
      const profile = c.publicProfile ?? '';
      const secrets = (c.secrets ?? []).join(' ');
      const combined = name + profile + secrets;
      if (combined.includes('死者') || combined.includes('被害') || combined.includes('被杀') || combined.includes('尸体') || combined.includes('已死')) {
        victimIds.push(c.id);
      }
    }
  }

  // 标记
  let markFixed = 0;
  for (const c of chars) {
    let changed = false;
    if (murdererIds.includes(c.id) && !c.isMurderer) { c.isMurderer = true; changed = true; markFixed++; }
    if (victimIds.includes(c.id) && !c.isVictim) { c.isVictim = true; changed = true; markFixed++; }
    if (changed) writeJson(join(charsDir, `${c.id}.json`), c);
  }

  // 5. 修复 truth.murdererCharIds
  if (truth) {
    let truthChanged = false;
    const ids = truth.murdererCharIds ?? [];
    const needsFix = ids.some((m: any) => typeof m !== 'string' || !charIds.includes(m));
    if (needsFix) {
      // 如果有有效的 murdererIds 就用，否则保持原样
      if (murdererIds.length > 0) {
        truth.murdererCharIds = murdererIds;
        truthChanged = true;
      }
    }
    if (truthChanged) writeJson(truthPath, truth);
  }

  // 6. 修复搜证阶段解锁线索
  if (existsSync(phasesPath) && existsSync(cluesPath)) {
    const phases = readJson(phasesPath);
    const clues = readJson(cluesPath);
    if (Array.isArray(phases) && Array.isArray(clues)) {
      const searchableIds = clues.filter((c: any) => c.visibility === 'searchable').map((c: any) => c.id);
      let phaseFixed = 0;
      for (const p of phases) {
        if (p.kind === 'free' && (!p.unlocks?.clueIds?.length) && searchableIds.length > 0) {
          p.unlocks = { clueIds: searchableIds };
          phaseFixed++;
        }
      }
      if (phaseFixed > 0) writeJson(phasesPath, phases);
    }
  }

  console.log(`✓ ${id.padEnd(14)} 关系修复:${relFixed} 角色标记:${markFixed}`);
}
