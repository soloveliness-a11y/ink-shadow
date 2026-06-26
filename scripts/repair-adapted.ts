/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const contentDir = resolve(root, 'content');

// 所有需要修复的剧本（排除已通过的 danshui/dieluo/kuiilei/mock/mock-faction）
const NEEDS_REPAIR = [
  'daiyuesisha', 'exishangling', 'jinghun', 'jinyuan', 'liejing',
  'niandao', 'shuiqiang', 'shuixiu', 'xiaoyi', 'youling',
  'yuelu', 'yueluowa', 'zhulian', 'ziteng',
];

function readJson(p: string) {
  return JSON.parse(readFileSync(p, 'utf-8'));
}
function writeJson(p: string, data: unknown) {
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function repairCharacter(char: Record<string, any>, _scriptDir: string): Record<string, any> {
  const out: Record<string, any> = {
    id: char.id,
    name: char.name,
  };

  // gender: "unknown" → "other"
  out.gender = char.gender === 'unknown' ? 'other' : (char.gender ?? 'other');

  if (char.age !== undefined) out.age = char.age;

  // isVictim / isMurderer: 从 role 或 truth.json 推断
  // 先设默认值，后面根据 truth 修正
  out.isVictim = char.isVictim ?? false;
  out.isMurderer = char.isMurderer ?? false;

  // publicProfile: description 或 background 的第一句
  out.publicProfile = char.publicProfile ?? char.description ?? char.background ?? `${char.name}，与案件有关。`;

  // privateScript: background 或 description
  out.privateScript = char.privateScript ?? char.background ?? char.description ?? '';

  // storyByPhase: 保留原样
  if (char.storyByPhase) out.storyByPhase = char.storyByPhase;

  // objectives: 从 endings 或 motivation 构造
  if (char.objectives) {
    out.objectives = char.objectives;
  } else if (char.endings && Array.isArray(char.endings)) {
    out.objectives = char.endings.map((e: any, i: number) => ({
      id: `obj_${char.id}_${i + 1}`,
      kind: i === 0 ? 'main' as const : 'side' as const,
      description: e.description || e.condition || '完成目标',
      scoring: undefined,
    }));
  } else {
    out.objectives = [{
      id: `obj_${char.id}_1`,
      kind: 'main' as const,
      description: char.motivation || '找出真相',
    }];
  }

  // secrets
  out.secrets = char.secrets ?? [];

  // timeline
  out.timeline = char.timeline ?? [];

  // relationships: "to" → "targetCharId"
  if (char.relationships) {
    out.relationships = char.relationships.map((r: any) => ({
      targetCharId: r.targetCharId ?? r.to ?? r.charId ?? '',
      relation: r.relation ?? r.detail ?? '',
      isPublic: r.isPublic ?? false,
      ...(r.sharedSecret ? { sharedSecret: r.sharedSecret } : {}),
    }));
  } else {
    out.relationships = [];
  }

  // skills
  if (char.skills) out.skills = char.skills;

  // sceneId
  if (char.sceneId) out.sceneId = char.sceneId;

  // faction / team
  if (char.faction) out.faction = char.faction;
  if (char.team) out.team = char.team;

  // keywordMemories
  if (char.keywordMemories) out.keywordMemories = char.keywordMemories;

  // passiveClueGivers
  if (char.passiveClueGivers) out.passiveClueGivers = char.passiveClueGivers;

  // investigationReport
  if (char.investigationReport) out.investigationReport = char.investigationReport;

  // mandatoryReveal
  if (char.mandatoryReveal) out.mandatoryReveal = char.mandatoryReveal;

  // realName
  if (char.realName) out.realName = char.realName;

  // disguiseOf
  if (char.disguiseOf) out.disguiseOf = char.disguiseOf;

  // personas
  if (char.personas) out.personas = char.personas;

  // voteWeight
  if (char.voteWeight) out.voteWeight = char.voteWeight;

  // visual (required) — "character" → "avatar"
  const rawVisual = char.visual ?? { kind: 'character', prompt: `${char.name}, oil painting style`, aspect: '3:4' };
  out.visual = {
    ...rawVisual,
    kind: rawVisual.kind === 'character' ? 'avatar' : rawVisual.kind,
  };

  return out;
}

function toString(val: any): string {
  if (typeof val === 'string') return val;
  if (val == null) return '待补充';
  if (typeof val === 'object') {
    // 取 main_truth 或第一个字符串值
    if (val.main_truth) return val.main_truth;
    const vals = Object.values(val).filter(v => typeof v === 'string');
    return typeof vals[0] === 'string' ? vals[0] : JSON.stringify(val);
  }
  return String(val);
}

function repairTruth(truth: Record<string, any>, charIds: string[]): Record<string, any> {
  // 确保 murdererCharIds 是 string[]
  let murdererIds = truth.murdererCharIds ?? [truth.killer ?? charIds[0]];
  // 如果 murdererCharIds 已存在但格式不对(包含对象),也要修复
  murdererIds = murdererIds.map((m: any) => {
    if (typeof m === 'string') return m;
    if (typeof m === 'object' && m !== null) return m.id ?? m.name ?? charIds[0];
    return String(m);
  });
  if (murdererIds.length === 0) murdererIds = [charIds[0]];

  // 确保 crimeTimeline 条目格式正确
  const timeline = (truth.crimeTimeline ?? truth.events ?? []).map((e: any) => ({
    time: e.time ?? '',
    location: e.location ?? '',
    action: e.action ?? '',
    isPublic: e.isPublic ?? false,
  }));

  return {
    murdererCharIds: murdererIds,
    method: toString(truth.method),
    motive: toString(truth.motive),
    crimeTimeline: timeline,
    solutionChain: Array.isArray(truth.solutionChain) ? truth.solutionChain : [],
    reveal: toString(truth.reveal),
    endings: truth.endings ?? [
      { id: 'end_good', condition: { kind: 'always' as const }, title: '真相揭晓', narrative: '凶手被找出。' },
      { id: 'end_bad', condition: { kind: 'always' as const }, title: '真相掩埋', narrative: '真相被掩埋。' },
    ],
  };
}

function repairClue(clue: Record<string, any>): Record<string, any> {
  if (clue.title && clue.content && clue.visibility) return clue; // 已是标准格式

  return {
    id: clue.id,
    title: clue.title ?? clue.name ?? clue.id,
    content: clue.content ?? clue.description ?? '',
    sceneId: clue.sceneId ?? clue.scene,
    visibility: clue.visibility ?? (clue.type === 'location' ? 'public' as const : 'searchable' as const),
    isKey: clue.isKey ?? false,
    pointsTo: clue.pointsTo ?? [],
    ...(clue.visual ? { visual: clue.visual } : {}),
    ...(clue.requiredSkill ? { requiredSkill: clue.requiredSkill } : {}),
    ...(clue.ownerCharId ? { ownerCharId: clue.ownerCharId } : {}),
    ...(clue.round !== undefined ? { round: clue.round } : {}),
    ...(clue.linkedSecretClueId ? { linkedSecretClueId: clue.linkedSecretClueId } : {}),
    ...(clue.onReveal ? { onReveal: clue.onReveal } : {}),
    ...(clue.requiredItem ? { requiredItem: clue.requiredItem } : {}),
  };
}

const DEFAULT_ACTIONS: Record<string, string[]> = {
  briefing: ['readScript', 'ready'],
  sequential: ['speak', 'ready'],
  free: ['speak', 'searchClue', 'revealClue', 'privateMessage'],
  vote: ['castVote'],
  reveal: ['submitTheory'],
};

function repairPhase(phase: Record<string, any>): Record<string, any> {
  if (phase.kind && phase.allowedActions && phase.exit) return phase; // 已是标准格式

  const kind = phase.type ?? phase.kind ?? 'free';
  const validKinds = ['briefing', 'sequential', 'free', 'vote', 'reveal'];
  const resolvedKind = validKinds.includes(kind) ? kind : 'free';

  return {
    id: phase.id,
    kind: resolvedKind,
    title: phase.title ?? phase.name ?? phase.id,
    instruction: phase.instruction ?? phase.description ?? '',
    participants: phase.participants ?? 'all',
    allowedActions: phase.allowedActions ?? DEFAULT_ACTIONS[resolvedKind] ?? ['speak'],
    exit: phase.exit ?? { kind: resolvedKind === 'vote' ? 'voteComplete' : 'hostAdvance' },
    ...(phase.unlocks ? { unlocks: phase.unlocks } : {}),
    ...(phase.turnOrder ? { turnOrder: phase.turnOrder } : {}),
    ...(phase.maxRounds !== undefined ? { maxRounds: phase.maxRounds } : {}),
    ...(phase.clock ? { clock: phase.clock } : {}),
    ...(phase.choice ? { choice: phase.choice } : {}),
    ...(phase.storyKey ? { storyKey: phase.storyKey } : {}),
    ...(phase.clueIds ? { clueIds: phase.clueIds } : {}),
    ...(phase.voteMode ? { voteMode: phase.voteMode } : {}),
    ...(phase.voteTarget ? { voteTarget: phase.voteTarget } : {}),
    ...(phase.maxSearches !== undefined ? { maxSearches: phase.maxSearches } : {}),
    ...(phase.resetVotes !== undefined ? { resetVotes: phase.resetVotes } : {}),
    ...(phase.restrictVoteTargets ? { restrictVoteTargets: phase.restrictVoteTargets } : {}),
    ...(phase.narrativeText ? { narrativeText: phase.narrativeText } : {}),
    ...(phase.inspectCost !== undefined ? { inspectCost: phase.inspectCost } : {}),
  };
}

function repairFlow(flow: Record<string, any>): Record<string, any> {
  if (flow.edges) return flow; // 已是标准格式 (edges)

  const phases = flow.phases ?? [];
  return {
    entry: phases[0]?.id ?? 'p_briefing',
    edges: phases
      .filter((p: any) => p.next != null)
      .map((p: any) => ({
        from: p.id,
        to: p.next,
        ...(p.condition ? { condition: p.condition } : {}),
      })),
  };
}

function repairScene(scene: Record<string, any>): Record<string, any> {
  if (!scene.visual) {
    scene.visual = { kind: 'scene' as const, prompt: `${scene.name ?? scene.id}, oil painting style`, aspect: '16:9' as const };
  }
  return scene;
}

function repairMeta(meta: Record<string, any>): Record<string, any> {
  if (!meta.styleGuide) {
    meta.styleGuide = `${meta.theme ?? 'Chinese'} setting, oil painting style, dramatic lighting`;
  }
  return meta;
}

let totalFixed = 0;
let totalErrors = 0;

for (const id of NEEDS_REPAIR) {
  const dir = resolve(contentDir, id);
  if (!existsSync(dir)) {
    console.log(`⊘ ${id.padEnd(14)} 目录不存在`);
    continue;
  }

  try {
    // 修复 meta.json
    const metaPath = join(dir, 'meta.json');
    if (existsSync(metaPath)) {
      const meta = readJson(metaPath);
      writeJson(metaPath, repairMeta(meta));
    }

    // 修复 characters
    const charsDir = join(dir, 'characters');
    const charIds: string[] = [];
    if (existsSync(charsDir)) {
      const files = readdirSync(charsDir).filter(f => f.endsWith('.json') && f !== 'order.json');
      for (const file of files) {
        const charPath = join(charsDir, file);
        const char = readJson(charPath);
        if (!char.id) continue; // 跳过非角色文件
        charIds.push(char.id);
        writeJson(charPath, repairCharacter(char, dir));
      }
    }

    // 修复 truth.json
    const truthPath = join(dir, 'truth.json');
    if (existsSync(truthPath)) {
      const truth = readJson(truthPath);
      writeJson(truthPath, repairTruth(truth, charIds));
    }

    // 修复 clues.json
    const cluesPath = join(dir, 'clues.json');
    if (existsSync(cluesPath)) {
      const clues = readJson(cluesPath);
      if (Array.isArray(clues)) {
        writeJson(cluesPath, clues.map(repairClue));
      }
    }

    // 修复 scenes.json
    const scenesPath = join(dir, 'scenes.json');
    if (existsSync(scenesPath)) {
      const scenes = readJson(scenesPath);
      if (Array.isArray(scenes)) {
        writeJson(scenesPath, scenes.map(repairScene));
      }
    }

    // 修复 phases.json
    const phasesPath = join(dir, 'phases.json');
    if (existsSync(phasesPath)) {
      const phases = readJson(phasesPath);
      if (Array.isArray(phases)) {
        writeJson(phasesPath, phases.map(repairPhase));
      }
    }

    // 修复 flow.json
    const flowPath = join(dir, 'flow.json');
    if (existsSync(flowPath)) {
      const flow = readJson(flowPath);
      writeJson(flowPath, repairFlow(flow));
    }

    console.log(`✓ ${id.padEnd(14)} 已修复 (${charIds.length} 角色)`);
    totalFixed++;
  } catch (e) {
    console.log(`✗ ${id.padEnd(14)} ${e instanceof Error ? e.message.slice(0, 200) : e}`);
    totalErrors++;
  }
}

// === 第二轮修复：自洽性问题 ===
console.log('\n--- 第二轮：自洽性修复 ---');

for (const id of NEEDS_REPAIR) {
  const dir = resolve(contentDir, id);
  if (!existsSync(dir)) continue;

  try {
    const truthPath = join(dir, 'truth.json');
    const charsDir = join(dir, 'characters');
    const phasesPath = join(dir, 'phases.json');
    const cluesPath = join(dir, 'clues.json');

    // 读取现有数据
    const truth = existsSync(truthPath) ? readJson(truthPath) : null;
    const charFiles = existsSync(charsDir)
      ? readdirSync(charsDir).filter(f => f.endsWith('.json') && f !== 'order.json')
      : [];
    const phases = existsSync(phasesPath) ? readJson(phasesPath) : [];
    const clues = existsSync(cluesPath) ? readJson(cluesPath) : [];

    // 1. 修复 isVictim / isMurderer 标记
    const murdererIds = truth?.murdererCharIds?.filter((m: any) => typeof m === 'string' && m !== '待确认') ?? [];
    const clueIds = clues.map((c: any) => c.id);

    for (const file of charFiles) {
      const charPath = join(charsDir, file);
      const char = readJson(charPath);
      let changed = false;

      // 标记凶手
      if (murdererIds.includes(char.id) && !char.isMurderer) {
        char.isMurderer = true;
        changed = true;
      }

      // 标记死者（从角色名/secrets 中推断）
      if (!char.isVictim && !char.isMurderer) {
        const name = char.name ?? '';
        const secrets = (char.secrets ?? []).join(' ');
        const profile = char.publicProfile ?? '';
        const combined = name + secrets + profile;
        if (combined.includes('死者') || combined.includes('被害') || combined.includes('被杀') || combined.includes('尸体')) {
          char.isVictim = true;
          changed = true;
        }
      }

      if (changed) writeJson(charPath, char);
    }

    // 2. 修复搜证阶段未解锁线索
    if (Array.isArray(phases) && clueIds.length > 0) {
      let phasesChanged = false;
      for (const phase of phases) {
        if (phase.kind === 'free' && (!phase.unlocks || !phase.unlocks.clueIds || phase.unlocks.clueIds.length === 0)) {
          // 给搜证阶段添加所有 searchable 线索
          const searchableIds = clues
            .filter((c: any) => c.visibility === 'searchable')
            .map((c: any) => c.id);
          if (searchableIds.length > 0) {
            phase.unlocks = { clueIds: searchableIds };
            phasesChanged = true;
          }
        }
      }
      if (phasesChanged) writeJson(phasesPath, phases);
    }

    console.log(`✓ ${id.padEnd(14)} 自洽修复完成`);
  } catch (e) {
    console.log(`✗ ${id.padEnd(14)} ${e instanceof Error ? e.message.slice(0, 200) : e}`);
  }
}

console.log(`\n全部修复完成: ${totalFixed}/${NEEDS_REPAIR.length} 成功, ${totalErrors} 失败`);
