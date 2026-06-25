import { zScript } from './script.js';
import type { Script, Clue, Character } from './script.js';

export interface ValidationIssue {
  level: 'error' | 'warn';
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean; // 无 error 即 ok(warn 不阻断)
  issues: ValidationIssue[];
}

const err = (out: ValidationIssue[], code: string, path: string, message: string): void => {
  out.push({ level: 'error', code, path, message });
};
const warn = (out: ValidationIssue[], code: string, path: string, message: string): void => {
  out.push({ level: 'warn', code, path, message });
};

/**
 * 剧本结构 + 自洽校验。对应 PLAN/01 §8。
 * 第一层 zod 结构校验;通过后跑引用完整性、可解性、流程 DAG、视觉、角色平衡。
 * 时间线语义矛盾(规则 #7)需 LLM 辅助,不在此纯结构校验内。
 */
export function validateScript(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  const parsed = zScript.safeParse(input);
  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      issues.push({ level: 'error', code: 'schema', path: e.path.join('.') || '(root)', message: e.message });
    }
    return { ok: false, issues };
  }

  const s = parsed.data;
  const genre = s.meta.genre ?? 'murder';
  checkReferences(s, issues);
  if (genre === 'murder') {
    checkSolvability(s, issues); // 强制死者/凶手/推理链 — 仅推理本
  }
  checkFlowDag(s, issues);
  if (genre === 'murder') {
    checkGameplayStructure(s, issues); // 强制搜证结构 — 仅推理本
  }
  checkVisuals(s, issues);
  if (genre === 'murder') {
    checkBalance(s, issues); // 强制 main 目标/时间线 — 仅推理本
  }
  checkSkillBalance(s, issues);
  if (genre === 'faction') {
    checkFactionStructure(s, issues); // 阵营结构 — 仅阵营本
  }

  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

/** 引用完整性:所有 id 互引无悬空 */
function checkReferences(s: Script, out: ValidationIssue[]): void {
  const charIds = new Set(s.characters.map((c) => c.id));
  const sceneIds = new Set(s.scenes.map((x) => x.id));
  const clueIds = new Set(s.clues.map((c) => c.id));
  const phaseIds = new Set(s.phases.map((p) => p.id));
  const propIds = new Set((s.props ?? []).map((p) => p.id));
  const itemIds = new Set<string>([...clueIds, ...propIds]);

  for (const c of s.clues) {
    if (c.sceneId && !sceneIds.has(c.sceneId)) err(out, 'ref', `clues.${c.id}.sceneId`, `未知场景 ${c.sceneId}`);
    if (c.ownerCharId && !charIds.has(c.ownerCharId)) err(out, 'ref', `clues.${c.id}.ownerCharId`, `未知角色 ${c.ownerCharId}`);
    if (c.requiredItem && !itemIds.has(c.requiredItem)) err(out, 'ref', `clues.${c.id}.requiredItem`, `未知物品 ${c.requiredItem}`);
    for (const eff of c.onReveal ?? []) {
      if (eff.kind === 'giveClue' && !clueIds.has(eff.clueId)) err(out, 'ref', `clues.${c.id}.onReveal.giveClue`, `未知线索 ${eff.clueId}`);
      if (eff.kind === 'eliminate' && !charIds.has(eff.charId)) err(out, 'ref', `clues.${c.id}.onReveal.eliminate`, `未知角色 ${eff.charId}`);
    }
  }
  for (const ch of s.characters) {
    if (ch.sceneId && !sceneIds.has(ch.sceneId)) err(out, 'ref', `characters.${ch.id}.sceneId`, `未知场景 ${ch.sceneId}`);
    if (ch.disguiseOf && !charIds.has(ch.disguiseOf)) err(out, 'ref', `characters.${ch.id}.disguiseOf`, `未知角色 ${ch.disguiseOf}`);
    for (const r of ch.relationships) {
      if (!charIds.has(r.targetCharId)) err(out, 'ref', `characters.${ch.id}.relationships`, `未知角色 ${r.targetCharId}`);
    }
    if (ch.storyByPhase) {
      const storyKeys = new Set(s.phases.map((p) => p.unlocks?.storyKey).filter(Boolean));
      for (const key of Object.keys(ch.storyByPhase)) {
        if (!storyKeys.has(key)) warn(out, 'ref', `characters.${ch.id}.storyByPhase`, `storyByPhase key "${key}" 未被任何环节的 unlocks.storyKey 引用`);
      }
    }
  }
  for (const p of s.phases) {
    if (Array.isArray(p.participants)) {
      for (const id of p.participants) if (!charIds.has(id)) err(out, 'ref', `phases.${p.id}.participants`, `未知角色 ${id}`);
    }
    for (const id of p.turnOrder ?? []) if (!charIds.has(id)) err(out, 'ref', `phases.${p.id}.turnOrder`, `未知角色 ${id}`);
    for (const id of p.unlocks?.clueIds ?? []) if (!clueIds.has(id)) err(out, 'ref', `phases.${p.id}.unlocks.clueIds`, `未知线索 ${id}`);
    if (p.choice) {
      for (const opt of p.choice.options) {
        for (const eff of opt.effects) {
          if (eff.kind === 'jumpPhase' && !phaseIds.has(eff.phaseId)) err(out, 'ref', `phases.${p.id}.choice.${opt.id}.jumpPhase`, `未知环节 ${eff.phaseId}`);
          if (eff.kind === 'switchPersona') {
            if (!charIds.has(eff.charId)) err(out, 'ref', `phases.${p.id}.choice.${opt.id}.switchPersona.charId`, `未知角色 ${eff.charId}`);
            const ch = s.characters.find((c) => c.id === eff.charId);
            if (ch && !(ch.personas ?? []).some((ps) => ps.id === eff.personaId)) {
              err(out, 'ref', `phases.${p.id}.choice.${opt.id}.switchPersona.personaId`, `角色 ${eff.charId} 没有 persona ${eff.personaId}`);
            }
          }
          if (eff.kind === 'giveClue' && !clueIds.has(eff.clueId)) err(out, 'ref', `phases.${p.id}.choice.${opt.id}.giveClue`, `未知线索 ${eff.clueId}`);
        }
      }
    }
  }
  if (!phaseIds.has(s.flow.entry)) err(out, 'ref', 'flow.entry', `未知环节 ${s.flow.entry}`);
  for (const e of s.flow.edges) {
    if (!phaseIds.has(e.from)) err(out, 'ref', 'flow.edges.from', `未知环节 ${e.from}`);
    if (!phaseIds.has(e.to)) err(out, 'ref', 'flow.edges.to', `未知环节 ${e.to}`);
    if (e.condition?.kind === 'voteResult' && !charIds.has(e.condition.equalsCharId)) {
      err(out, 'ref', 'flow.edges.condition', `未知角色 ${e.condition.equalsCharId}`);
    }
  }
  if (s.truth) {
    for (const id of s.truth.murdererCharIds) if (!charIds.has(id)) err(out, 'ref', 'truth.murdererCharIds', `未知角色 ${id}`);
    for (const en of s.truth.endings) {
      const conds = Array.isArray(en.condition) ? en.condition : [en.condition];
      for (const c of conds) {
        if (c.kind === 'voteResult' && !charIds.has(c.equalsCharId)) {
          err(out, 'ref', `truth.endings.${en.id}`, `未知角色 ${c.equalsCharId}`);
        }
      }
    }
  }
  for (const en of s.endings ?? []) {
    const conds = Array.isArray(en.condition) ? en.condition : [en.condition];
    for (const c of conds) {
      if (c.kind === 'voteResult' && !charIds.has(c.equalsCharId)) {
        err(out, 'ref', `endings.${en.id}`, `未知角色 ${c.equalsCharId}`);
      }
    }
  }
}

/** 可解性:有死者/凶手;关键线索可达且指向真相;推理链不断裂 */
function checkSolvability(s: Script, out: ValidationIssue[]): void {
  if (!s.characters.some((c) => c.isVictim)) err(out, 'solve', 'characters', '没有死者(isVictim)');
  if (!s.characters.some((c) => c.isMurderer)) err(out, 'solve', 'characters', '没有凶手(isMurderer)');

  const unlocked = new Set<string>();
  for (const p of s.phases) for (const id of p.unlocks?.clueIds ?? []) unlocked.add(id);
  const victimIds = new Set(s.characters.filter((c) => c.isVictim).map((c) => c.id));
  const reachable = (c: Clue): boolean => c.visibility === 'public' || unlocked.has(c.id) || (Boolean(c.ownerCharId) && !victimIds.has(c.ownerCharId!));

  for (const c of s.clues) {
    if (!c.isKey) continue;
    if (c.pointsTo.length === 0) err(out, 'solve', `clues.${c.id}.pointsTo`, '关键线索 pointsTo 为空');
    if (!reachable(c)) err(out, 'solve', `clues.${c.id}`, '关键线索玩家不可达(非 public/未解锁/无归属)');
  }
  const clueById = new Map(s.clues.map((c) => [c.id, c] as const));
  for (const ref of s.truth?.solutionChain ?? []) {
    const c = clueById.get(ref);
    if (!c) {
      err(out, 'solve', 'truth.solutionChain', `推理链引用未知线索 ${ref}`);
    } else if (!reachable(c)) {
      err(out, 'solve', 'truth.solutionChain', `推理链引用的线索 ${ref} 不可达`);
    }
  }
}

/** 流程 DAG:可达性、无死胡同、终局可达 */
function checkFlowDag(s: Script, out: ValidationIssue[]): void {
  const phaseById = new Map(s.phases.map((p) => [p.id, p] as const));
  const outEdges = new Map<string, string[]>();
  for (const p of s.phases) outEdges.set(p.id, []);
  for (const e of s.flow.edges) outEdges.get(e.from)?.push(e.to);

  const seen = new Set<string>();
  const queue: string[] = [];
  if (phaseById.has(s.flow.entry)) {
    seen.add(s.flow.entry);
    queue.push(s.flow.entry);
  }
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const nxt of outEdges.get(cur) ?? []) {
      if (!seen.has(nxt)) {
        seen.add(nxt);
        queue.push(nxt);
      }
    }
  }

  for (const p of s.phases) {
    if (!seen.has(p.id)) warn(out, 'flow', `phases.${p.id}`, '环节从 entry 不可达(孤岛)');
    if (p.kind !== 'reveal' && (outEdges.get(p.id) ?? []).length === 0) {
      err(out, 'flow', `phases.${p.id}`, '非终局环节没有出边(死胡同)');
    }
  }
  const hasReveal = [...seen].some((id) => phaseById.get(id)?.kind === 'reveal');
  if (!hasReveal) err(out, 'flow', 'flow', '没有可达的 reveal 终局环节');

  for (const p of s.phases) {
    if (p.kind !== 'vote') continue;
    const edges = s.flow.edges.filter((e) => e.from === p.id);
    const hasVoteResult = edges.some((e) => e.condition?.kind === 'voteResult');
    const hasAlways = edges.some((e) => !e.condition || e.condition.kind === 'always');
    if (hasVoteResult && !hasAlways) {
      err(out, 'flow', `phases.${p.id}`, '投票环节含 voteResult 分支,但缺少 always 兜底结局');
    }
  }
}

/** 游戏性下限:搜证阶段、轮次线索和顺序发言必须可玩 */
function checkGameplayStructure(s: Script, out: ValidationIssue[]): void {
  const playableIds = new Set(s.characters.filter((c) => !c.isVictim).map((c) => c.id));
  const searchableIds = new Set(s.clues.filter((c) => c.visibility === 'searchable').map((c) => c.id));
  const searchPhases = s.phases.filter((p) => p.allowedActions.includes('searchClue'));

  if (searchableIds.size > 0 && searchPhases.length === 0) {
    err(out, 'gameplay', 'phases', '存在 searchable 线索,但没有搜证环节');
  }
  for (const p of searchPhases) {
    const ids = p.unlocks?.clueIds ?? [];
    if (ids.length === 0) {
      err(out, 'gameplay', `phases.${p.id}.unlocks.clueIds`, '搜证环节没有解锁任何线索');
    }
    if (!ids.some((id) => searchableIds.has(id))) {
      err(out, 'gameplay', `phases.${p.id}.unlocks.clueIds`, '搜证环节没有解锁 searchable 线索');
    }
  }

  const roundClueIds = new Map<number, Set<string>>();
  for (const c of s.clues) {
    if (c.visibility === 'searchable' && c.round != null) {
      let set = roundClueIds.get(c.round);
      if (!set) { set = new Set(); roundClueIds.set(c.round, set); }
      set.add(c.id);
    }
  }
  const unlockedIds = new Set<string>();
  for (const p of s.phases) for (const id of p.unlocks?.clueIds ?? []) unlockedIds.add(id);
  for (const [round, ids] of roundClueIds) {
    if (ids.size > 0 && ![...ids].some((id) => unlockedIds.has(id))) {
      err(out, 'gameplay', `clues.round${round}`, `第${round}轮 searchable 线索没有被任何环节解锁`);
    }
  }

  for (const p of s.phases.filter((phase) => phase.kind === 'sequential')) {
    const order = p.turnOrder ?? [];
    if (order.length === 0) err(out, 'gameplay', `phases.${p.id}.turnOrder`, '顺序发言环节缺少 turnOrder');
    for (const id of playableIds) {
      if (!order.includes(id)) err(out, 'gameplay', `phases.${p.id}.turnOrder`, `turnOrder 缺少可玩角色 ${id}`);
    }
    for (const id of order) {
      if (!playableIds.has(id)) err(out, 'gameplay', `phases.${p.id}.turnOrder`, `turnOrder 包含非可玩角色 ${id}`);
    }
  }
}

/** 视觉完整性:kind 与归属对应 */
function checkVisuals(s: Script, out: ValidationIssue[]): void {
  for (const c of s.characters) {
    if (c.visual.kind !== 'avatar') warn(out, 'visual', `characters.${c.id}.visual`, `角色头像 kind 应为 avatar(实为 ${c.visual.kind})`);
  }
  for (const sc of s.scenes) {
    if (sc.visual.kind !== 'scene') warn(out, 'visual', `scenes.${sc.id}.visual`, `场景 kind 应为 scene(实为 ${sc.visual.kind})`);
  }
  for (const p of s.props ?? []) {
    if (p.visual.kind !== 'prop') warn(out, 'visual', `props.${p.id}.visual`, `道具 kind 应为 prop(实为 ${p.visual.kind})`);
  }
}

/** 角色平衡:每个非死者角色有 main 目标、足够时间线/秘密、有事可做 */
function checkBalance(s: Script, out: ValidationIssue[]): void {
  const players = s.characters.filter((c) => !c.isVictim);
  const ownedBy = new Set<string>();
  for (const c of s.clues) if (c.ownerCharId) ownedBy.add(c.ownerCharId);

  for (const c of players) {
    if (!c.objectives.some((o) => o.kind === 'main')) err(out, 'balance', `characters.${c.id}.objectives`, '缺少 main 目标');
    if (c.timeline.length < 3) warn(out, 'balance', `characters.${c.id}.timeline`, '时间线少于 3 条');
    if (c.secrets.length < 1) warn(out, 'balance', `characters.${c.id}.secrets`, '缺少秘密');
    if (!ownedBy.has(c.id)) warn(out, 'balance', `characters.${c.id}`, '不持有任何线索(可能打酱油)');
  }
}

/** 技能平衡:线索需要的技能至少有一个角色拥有 */
function checkSkillBalance(s: Script, out: ValidationIssue[]): void {
  const allSkills = new Set(s.characters.flatMap((c) => c.skills ?? []));
  for (const c of s.clues) {
    if (c.requiredSkill && !allSkills.has(c.requiredSkill)) {
      err(out, 'skillBalance', `clues.${c.id}.requiredSkill`, `线索 "${c.title}" (${c.id}) 需要技能 "${c.requiredSkill}"，但没有任何角色拥有此技能`);
    }
  }
}

/** 阵营结构:非 neutral 角色有 faction、阵营非空、阵营平衡、至少一个 teamWin ending */
function checkFactionStructure(s: Script, out: ValidationIssue[]): void {
  const factions = new Map<string, number>();
  for (const c of s.characters) {
    if (!c.faction || c.faction === 'neutral') continue;
    factions.set(c.faction, (factions.get(c.faction) ?? 0) + 1);
  }
  if (factions.size === 0) {
    err(out, 'faction', 'characters', '阵营本(genre=faction)但没有任何角色带 faction 字段');
  }
  const counts = [...factions.values()];
  if (counts.length >= 2 && Math.max(...counts) - Math.min(...counts) > 1) {
    warn(out, 'faction', 'characters', `阵营人数不均:${[...factions.entries()].map(([f, n]) => `${f}=${n}`).join(', ')}`);
  }
  const endings = s.endings ?? s.truth?.endings ?? [];
  const hasTeamWin = endings.some((e) => {
    const conds = Array.isArray(e.condition) ? e.condition : [e.condition];
    return conds.some((c) => c.kind === 'teamWin');
  });
  if (!hasTeamWin) {
    err(out, 'faction', 'endings', '阵营本至少需要一个 teamWin 结局(放在顶层 endings 或 truth.endings)');
  }
}
