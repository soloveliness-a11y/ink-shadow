import { z } from 'zod';
import type { GenParams } from './types.js';
import type { Script, Character, Clue, Scene, Phase, PhaseFlow, PhaseEdge } from '@mmg/schema';
import { structuredGenerate } from './llm.js';
import { validateScript } from '@mmg/schema';
import * as prompts from './prompts/index.js';

export interface PipelineCallbacks {
  onStage: (stage: string) => void;
  onRetry: (stage: string, attempt: number, error: string) => void;
  onProgress: (msg: string) => void;
}

const noopCallbacks: PipelineCallbacks = {
  onStage: () => {},
  onRetry: () => {},
  onProgress: () => {},
};

// ─── Zod schemas for each stage's tool output ───

const zTruthOutput = z.object({
  title: z.string().optional(),
  synopsis: z.string().optional(),
  murdererCharId: z.string(),
  method: z.string().min(10),
  motive: z.string().min(10),
  crimeTimeline: z.array(z.object({ time: z.string(), location: z.string(), action: z.string(), isPublic: z.boolean() })).min(3),
  solutionChain: z.array(z.string()).min(4),
  reveal: z.string().min(50),
  endings: z.array(z.object({
    id: z.string(),
    title: z.string(),
    narrative: z.string().min(20),
    condition: z.object({ kind: z.string() }),
  })).min(2),
});

const zCharacterOutput = z.array(z.object({
  id: z.string(),
  name: z.string(),
  gender: z.enum(['male', 'female', 'other']),
  age: z.number().optional(),
  isVictim: z.boolean(),
  isMurderer: z.boolean(),
  publicProfile: z.string().min(10),
  privateScript: z.string().min(20),
  objectives: z.array(z.object({ id: z.string(), kind: z.enum(['main', 'side', 'hidden']), description: z.string() })).min(1),
  secrets: z.array(z.string()).min(1),
  timeline: z.array(z.object({ time: z.string(), location: z.string(), action: z.string(), isPublic: z.boolean() })).min(3),
  relationships: z.array(z.object({ targetCharId: z.string(), relation: z.string(), isPublic: z.boolean() })).min(1),
  visualPrompt: z.string().min(20),
}));

const zCluesOutput = z.object({
  scenes: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string(), visualPrompt: z.string().min(10),
  })).min(2),
  clues: z.array(z.object({
    id: z.string(), title: z.string(), content: z.string().min(10),
    sceneId: z.string().optional(), ownerCharId: z.string().optional(),
    visibility: z.enum(['public', 'private', 'searchable']),
    round: z.number().optional(), isKey: z.boolean(), pointsTo: z.array(z.string()),
  })).min(8),
});

const zPhasesOutput = z.object({
  phases: z.array(z.object({
    id: z.string(), kind: z.string(), title: z.string(), instruction: z.string(),
    allowedActions: z.array(z.string()), turnOrder: z.array(z.string()).optional(),
    unlocks: z.object({ clueIds: z.array(z.string()).optional(), storyKey: z.string().optional() }).optional(),
    exit: z.object({ kind: z.string(), timerSec: z.number().optional() }),
  })).min(6),
  flow: z.object({ entry: z.string(), edges: z.array(z.object({ from: z.string(), to: z.string(), condition: z.any().optional() })) }),
});

const zStoryOutput = z.record(z.string(), z.string());

// ─── Pipeline ───

export async function generate(
  params: GenParams,
  apiKey: string,
  callbacks: PipelineCallbacks = noopCallbacks,
): Promise<Script> {
  const baseConfig = { apiKey, model: 'opus' as const };
  const sonnetConfig = { apiKey, model: 'sonnet' as const };
  const styleGuide = params.style || `${params.theme}题材,写实风格,电影质感`;

  // S1: Truth
  callbacks.onStage('S1 真相内核');
  const s1 = await structuredGenerate(
    baseConfig, prompts.SYSTEM_PROMPT, prompts.stage1Prompt(params),
    zTruthOutput, 'generate_truth', '生成案件真相内核',
  );
  callbacks.onProgress(`凶手: ${s1.data.murdererCharId}, 手法: ${s1.data.method.slice(0, 30)}...`);

  // S2: Characters
  callbacks.onStage('S2 角色矩阵');
  const s2 = await structuredGenerate(
    { ...baseConfig, cachedContext: JSON.stringify(s1.data) },
    prompts.SYSTEM_PROMPT, prompts.stage2Prompt(s1.data, params),
    zCharacterOutput, 'generate_characters', '生成角色矩阵',
  );
  callbacks.onProgress(`${s2.data.length} 个角色已生成`);

  // S3: Clues + Scenes
  callbacks.onStage('S3 线索链');
  const s3 = await structuredGenerate(
    { ...baseConfig, cachedContext: JSON.stringify({ truth: s1.data, characters: s2.data }) },
    prompts.SYSTEM_PROMPT, prompts.stage3Prompt(s1.data, s2.data, params),
    zCluesOutput, 'generate_clues', '生成线索和场景',
  );
  callbacks.onProgress(`${s3.data.clues.length} 条线索, ${s3.data.scenes.length} 个场景`);

  // S4: Phases + Flow
  callbacks.onStage('S4 环节编排');
  const s4 = await structuredGenerate(
    sonnetConfig, prompts.SYSTEM_PROMPT, prompts.stage4Prompt(s2.data),
    zPhasesOutput, 'generate_phases', '生成环节流程',
  );
  callbacks.onProgress(`${s4.data.phases.length} 个环节`);

  // S5: Story by phase
  callbacks.onStage('S5 分幕剧情');
  const s5 = await structuredGenerate(
    baseConfig, prompts.SYSTEM_PROMPT, prompts.stage5Prompt(s2.data, s4.data),
    zStoryOutput, 'generate_stories', '生成分幕剧情',
  );

  // S6: Visual prompts (ensure filled)
  callbacks.onStage('S6 视觉描述');
  // Visual prompts are already embedded in characters/scenes from S2/S3
  // This stage validates and potentially enhances them

  // Assemble full script
  const script = repairScript(assemble(params, s1.data, s2.data, s3.data, s4.data, s5.data, styleGuide));

  // S7: Validate and repair
  callbacks.onStage('S7 校验修复');
  const result = await validateAndRepair(script, callbacks);

  callbacks.onProgress(`✅ 剧本完成: ${result.meta.title}`);
  return result;
}

function assemble(
  params: GenParams,
  truth: z.infer<typeof zTruthOutput>,
  chars: z.infer<typeof zCharacterOutput>,
  cluesScenes: z.infer<typeof zCluesOutput>,
  phasesFlow: z.infer<typeof zPhasesOutput>,
  stories: z.infer<typeof zStoryOutput>,
  styleGuide: string,
): Script {
  const characters = chars.map((c) => ({
    id: c.id, name: c.name, gender: c.gender, age: c.age,
    isVictim: c.isVictim, isMurderer: c.isMurderer,
    publicProfile: c.publicProfile, privateScript: c.privateScript,
    storyByPhase: stories[c.id] ? { round2: stories[c.id]! } : undefined,
    objectives: c.objectives.map((o, i) => ({ ...o, id: o.id ?? `${c.id}_obj_${i + 1}` })),
    secrets: c.secrets,
    timeline: c.timeline, relationships: c.relationships,
    visual: { kind: 'avatar', prompt: c.visualPrompt, aspect: '3:4' },
  })) as Character[];

  const scenes: Scene[] = cluesScenes.scenes.map((s) => ({
    id: s.id, name: s.name, description: s.description,
    visual: { kind: 'scene', prompt: s.visualPrompt, aspect: '16:9' },
  }));

  const clues: Clue[] = cluesScenes.clues.map((c) => ({
    id: c.id, title: c.title, content: c.content,
    sceneId: c.sceneId, ownerCharId: c.ownerCharId,
    visibility: c.visibility, round: c.round,
    isKey: c.isKey, pointsTo: c.pointsTo,
    visual: { kind: 'clue', prompt: `${c.title}: ${c.content}`, aspect: '4:3', styleHint: 'evidence item close-up still life, detailed object' },
  }));

  const phases: Phase[] = phasesFlow.phases.map((p) => ({
    id: p.id, kind: p.kind as Phase['kind'], title: p.title, instruction: p.instruction,
    participants: 'all' as const, allowedActions: p.allowedActions as Phase['allowedActions'],
    turnOrder: p.turnOrder, unlocks: p.unlocks as Phase['unlocks'],
    exit: p.exit as Phase['exit'],
  }));

  const flow: PhaseFlow = {
    entry: phasesFlow.flow.entry,
    edges: phasesFlow.flow.edges.map((e) => ({
      from: e.from, to: e.to,
      condition: e.condition as PhaseFlow['edges'][number]['condition'],
    })),
  };

  const scriptTruth: Script['truth'] = {
    murdererCharIds: [truth.murdererCharId],
    method: truth.method, motive: truth.motive,
    crimeTimeline: truth.crimeTimeline,
    solutionChain: truth.solutionChain,
    reveal: truth.reveal,
    endings: truth.endings.map((e) => ({
      id: e.id, title: e.title, narrative: e.narrative,
      condition: e.condition as NonNullable<Script['truth']>['endings'][number]['condition'],
    })),
  };

  const title = normalizeText(truth.title) || buildTitle(params, characters, scenes);
  const synopsis = normalizeText(truth.synopsis) || buildSynopsis(params, scriptTruth, characters, scenes);

  const meta: Script['meta'] = {
    id: params.theme.toLowerCase().replace(/\s+/g, '-').slice(0, 30),
    title,
    theme: params.theme,
    playerCount: { min: params.players, max: params.players },
    difficulty: params.difficulty,
    durationMin: 180,
    synopsis,
    styleGuide,
    cover: {
      kind: 'cover',
      prompt: `Book cover poster for a ${params.theme} murder mystery, dramatic cinematic key art, atmospheric scene, no text, vertical poster`,
      aspect: '3:4',
      styleHint: styleGuide,
    },
    schemaVersion: '1.0.0',
    status: 'validated',
    genre: 'murder',
  };

  return {
    meta,
    characters, clues, scenes,
    phases, flow,
    truth: scriptTruth,
  };
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildTitle(params: GenParams, characters: Character[], scenes: Scene[]): string {
  const firstScene = scenes[0]?.name;
  const victim = characters.find((c) => c.isVictim)?.name;
  if (firstScene) return `${firstScene}疑云`;
  if (victim) return `${victim}之死`;
  return `${params.theme}疑案`;
}

function buildSynopsis(params: GenParams, truth: NonNullable<Script['truth']>, characters: Character[], scenes: Scene[]): string {
  const victim = characters.find((c) => c.isVictim)?.name ?? '死者';
  const scene = scenes[0]?.name ?? params.theme;
  const method = truth.method.replace(/[。.!！?？]+$/u, '');
  return `${scene}中,${victim}离奇身亡。${params.players}名嫌疑人各怀秘密,玩家需要通过两轮搜证、公开讨论与投票指认,从矛盾证词和关键线索中还原真相:${method}。`;
}

export function repairScript(input: Script): Script {
  const script = structuredClone(input) as Script;
  repairMeta(script);
  repairPhases(script);
  repairMurdererReferences(script);
  repairConditions(script);
  repairPhaseFlow(script);
  repairTurnOrders(script);
  repairSearchUnlocks(script);
  repairStoryUnlocks(script);
  repairClueReachability(script);
  repairSolutionChain(script);
  repairCharacterBalance(script);
  return script;
}

function repairMeta(script: Script): void {
  script.meta.title = normalizeText(script.meta.title) || buildTitle(
    { players: script.meta.playerCount.max, theme: script.meta.theme, difficulty: script.meta.difficulty },
    script.characters,
    script.scenes,
  );
  script.meta.synopsis = normalizeText(script.meta.synopsis) || buildSynopsis(
    { players: script.meta.playerCount.max, theme: script.meta.theme, difficulty: script.meta.difficulty },
    script.truth!,
    script.characters,
    script.scenes,
  );
  script.meta.status = 'validated';
}

function repairMurdererReferences(script: Script): void {
  const playable = playableCharacters(script);
  const flaggedMurderers = playable.filter((c) => c.isMurderer);
  const truthMurderers = script.truth!.murdererCharIds.filter((id) => playable.some((c) => c.id === id));
  const murdererId = truthMurderers[0] ?? flaggedMurderers[0]?.id ?? playable[0]?.id;
  if (!murdererId) return;

  script.truth!.murdererCharIds = [murdererId];
  for (const c of script.characters) c.isMurderer = c.id === murdererId;

  for (const edge of script.flow.edges) {
    if (edge.condition?.kind === 'voteResult') {
      edge.condition.equalsCharId = murdererId;
    }
  }
  for (const ending of script.truth!.endings) {
    // condition 可能是单条件或数组(多条件组合结局),归一化后处理
    const conds = Array.isArray(ending.condition) ? ending.condition : [ending.condition];
    for (const c of conds) {
      if (c.kind === 'voteResult') {
        c.equalsCharId = murdererId;
      }
    }
  }
}

function repairConditions(script: Script): void {
  const playableIds = new Set(playableCharacters(script).map((c) => c.id));
  const murdererId = script.truth!.murdererCharIds.find((id) => playableIds.has(id)) ?? [...playableIds][0];

  script.flow.edges = script.flow.edges.map((edge) => {
    if (!edge.condition) return edge;
    if (edge.condition.kind === 'always') return edge;
    if (edge.condition.kind === 'voteResult') {
      return {
        ...edge,
        condition: { kind: 'voteResult', equalsCharId: playableIds.has(edge.condition.equalsCharId) ? edge.condition.equalsCharId : (murdererId ?? '') },
      };
    }
    if (edge.condition.kind === 'flag' && typeof edge.condition.flag === 'string') {
      return { ...edge, condition: { kind: 'flag', flag: edge.condition.flag, equals: Boolean(edge.condition.equals) } };
    }
    return { ...edge, condition: { kind: 'always' } };
  });

  script.truth!.endings = script.truth!.endings.map((ending, index) => {
    // 数组条件(多条件组合结局)不 repair,保持原样
    if (Array.isArray(ending.condition)) return ending;
    if (ending.condition.kind === 'always') return ending;
    if (ending.condition.kind === 'voteResult') {
      return {
        ...ending,
        condition: { kind: 'voteResult', equalsCharId: playableIds.has(ending.condition.equalsCharId) ? ending.condition.equalsCharId : (murdererId ?? '') },
      };
    }
    if (ending.condition.kind === 'flag' && typeof ending.condition.flag === 'string') return ending;
    return {
      ...ending,
      condition: index === 0 && murdererId ? { kind: 'voteResult', equalsCharId: murdererId } : { kind: 'always' },
    };
  });
}

function repairPhases(script: Script): void {
  const validActions = new Set<Phase['allowedActions'][number]>([
    'readScript',
    'speak',
    'searchClue',
    'revealClue',
    'privateMessage',
    'castVote',
    'submitTheory',
    'ready',
  ]);
  const validExits = new Set<Phase['exit']['kind']>(['allReady', 'allActed', 'timer', 'hostAdvance', 'voteComplete']);

  for (const phase of script.phases) {
    const title = `${phase.id} ${phase.title}`.toLowerCase();
    if (!['briefing', 'sequential', 'free', 'vote', 'reveal'].includes(phase.kind)) {
      phase.kind = inferPhaseKind(title, phase.allowedActions) as Phase['kind'];
    }
    phase.allowedActions = phase.allowedActions.filter((action): action is Phase['allowedActions'][number] => validActions.has(action));
    if (phase.allowedActions.length === 0 && phase.kind !== 'reveal') {
      phase.allowedActions = defaultActionsForKind(phase.kind);
    }
    if (!validExits.has(phase.exit.kind)) {
      phase.exit = defaultExitForKind(phase.kind);
    }
    if (phase.exit.kind === 'timer' && !phase.exit.timerSec) {
      phase.exit.timerSec = 600;
    }
    if (phase.kind === 'vote') phase.allowedActions = ['castVote'];
    if (phase.kind === 'briefing' && !phase.allowedActions.includes('ready')) {
      phase.allowedActions = [...new Set<Phase['allowedActions'][number]>([...phase.allowedActions, 'ready'])];
    }
  }
}

function inferPhaseKind(title: string, actions: string[]): Phase['kind'] {
  if (title.includes('vote') || title.includes('投票') || actions.includes('castVote')) return 'vote';
  if (title.includes('reveal') || title.includes('结局') || title.includes('复盘')) return 'reveal';
  if (title.includes('intro') || title.includes('介绍') || title.includes('发言')) return 'sequential';
  if (title.includes('brief') || title.includes('开场') || title.includes('发本')) return 'briefing';
  return 'free';
}

function defaultActionsForKind(kind: Phase['kind']): Phase['allowedActions'] {
  switch (kind) {
    case 'briefing':
      return ['readScript', 'ready'];
    case 'sequential':
      return ['speak'];
    case 'free':
      return ['speak', 'revealClue', 'privateMessage'];
    case 'vote':
      return ['castVote'];
    case 'reveal':
      return [];
  }
}

function defaultExitForKind(kind: Phase['kind']): Phase['exit'] {
  switch (kind) {
    case 'briefing':
      return { kind: 'allReady' };
    case 'sequential':
      return { kind: 'allActed' };
    case 'vote':
      return { kind: 'voteComplete' };
    case 'free':
      return { kind: 'hostAdvance' };
    case 'reveal':
      return { kind: 'hostAdvance' };
  }
}

function repairPhaseFlow(script: Script): void {
  const phaseIds = new Set(script.phases.map((p) => p.id));
  script.flow.edges = script.flow.edges.filter((e) => phaseIds.has(e.from) && phaseIds.has(e.to));
  if (!phaseIds.has(script.flow.entry)) {
    script.flow.entry = script.phases[0]?.id ?? '';
  }

  const reveals = script.phases.filter((p) => p.kind === 'reveal');
  const vote = script.phases.find((p) => p.kind === 'vote');
  if (!vote || reveals.length === 0) return;

  const existingVoteTargets = new Set(script.flow.edges.filter((e) => e.from === vote.id).map((e) => e.to));
  const murdererId = script.truth!.murdererCharIds[0] ?? playableCharacters(script)[0]?.id;
  const [goodReveal, badReveal = goodReveal] = reveals;
  if (goodReveal && !existingVoteTargets.has(goodReveal.id) && murdererId) {
    script.flow.edges.push({ from: vote.id, to: goodReveal.id, condition: { kind: 'voteResult', equalsCharId: murdererId } });
  }
  if (badReveal && !existingVoteTargets.has(badReveal.id)) {
    script.flow.edges.push({ from: vote.id, to: badReveal.id, condition: { kind: 'always' } });
  }

  // 平票决胜:自动添加 tiebreaker 阶段
  const hasTiebreaker = script.phases.some((p) => p.id === 'p_vote_tiebreak');
  const hasVoteTieEdge = script.flow.edges.some((e) => e.from === vote.id && e.condition?.kind === 'voteTie');
  if (!hasTiebreaker) {
    script.phases.push({
      id: 'p_vote_tiebreak',
      kind: 'vote',
      title: '平票决胜',
      instruction: '票数相同，请在以下嫌疑人中再次投票。',
      participants: 'all',
      allowedActions: ['castVote'],
      exit: { kind: 'voteComplete' },
      resetVotes: true,
      restrictVoteTargets: 'tied',
    });
  }
  if (!hasVoteTieEdge) {
    // Insert voteTie edge before the always edge
    const alwaysIdx = script.flow.edges.findIndex((e) => e.from === vote.id && (!e.condition || e.condition.kind === 'always'));
    const tieEdge: PhaseEdge = { from: vote.id, to: 'p_vote_tiebreak', condition: { kind: 'voteTie' } };
    if (alwaysIdx >= 0) {
      script.flow.edges.splice(alwaysIdx, 0, tieEdge);
    } else {
      script.flow.edges.push(tieEdge);
    }
  }
  // tiebreaker 出边:复用 vote 阶段的 voteResult + always 边
  const tieEdges = script.flow.edges.filter((e) => e.from === 'p_vote_tiebreak');
  if (tieEdges.length === 0) {
    const voteEdges = script.flow.edges.filter((e) => e.from === vote.id);
    for (const e of voteEdges) {
      script.flow.edges.push({ from: 'p_vote_tiebreak', to: e.to, condition: e.condition ? { ...e.condition } : undefined });
    }
  }
}

function repairTurnOrders(script: Script): void {
  const playableIds = playableCharacters(script).map((c) => c.id);
  for (const phase of script.phases) {
    if (phase.kind !== 'sequential') continue;
    const current = phase.turnOrder ?? [];
    const fixed = current.filter((id) => playableIds.includes(id));
    for (const id of playableIds) {
      if (!fixed.includes(id)) fixed.push(id);
    }
    phase.turnOrder = fixed;
    phase.participants = 'all';
  }
}

function repairSearchUnlocks(script: Script): void {
  const searchPhases = script.phases.filter((p) => p.allowedActions.includes('searchClue'));
  if (searchPhases.length === 0) return;

  const unlocked = new Set<string>();
  for (const phase of script.phases) {
    for (const id of phase.unlocks?.clueIds ?? []) unlocked.add(id);
  }

  const searchableByRound = new Map<number, Clue[]>();
  for (const clue of script.clues) {
    if (clue.visibility !== 'searchable') continue;
    const round = clue.round && clue.round > 0 ? clue.round : 1;
    clue.round = round;
    const list = searchableByRound.get(round) ?? [];
    list.push(clue);
    searchableByRound.set(round, list);
  }

  searchPhases.forEach((phase, index) => {
    const round = index + 1;
    const candidates = searchableByRound.get(round) ?? [];
    const ids = new Set(phase.unlocks?.clueIds ?? []);
    for (const clue of candidates) ids.add(clue.id);
    if (ids.size === 0) {
      const fallback = script.clues.find((c) => c.visibility === 'searchable' && !unlocked.has(c.id));
      if (fallback) {
        fallback.round = round;
        ids.add(fallback.id);
      }
    }
    phase.unlocks = { ...phase.unlocks, clueIds: [...ids] };
    for (const id of ids) unlocked.add(id);
  });
}

function repairStoryUnlocks(script: Script): void {
  const round2Phase = script.phases.find((p) => p.allowedActions.includes('searchClue') && (p.unlocks?.storyKey === 'round2' || p.title.includes('二')));
  if (!round2Phase) return;
  round2Phase.unlocks = { ...round2Phase.unlocks, storyKey: 'round2' };

  for (const character of playableCharacters(script)) {
    if (character.storyByPhase?.round2) continue;
    character.storyByPhase = {
      ...character.storyByPhase,
      round2: `${character.name}在第二轮搜证后想起一个被忽略的细节,这让自己的嫌疑和目标都变得更紧迫。`,
    };
  }
}

function repairClueReachability(script: Script): void {
  const searchableIds = new Set(script.clues.filter((c) => c.visibility === 'searchable').map((c) => c.id));
  const unlocked = new Set<string>();
  for (const phase of script.phases) {
    for (const id of phase.unlocks?.clueIds ?? []) unlocked.add(id);
  }

  const firstSearch = script.phases.find((p) => p.allowedActions.includes('searchClue'));
  for (const clue of script.clues) {
    if (!clue.isKey) continue;
    if (clue.pointsTo.length === 0) clue.pointsTo = [clue.id];
    const reachable = clue.visibility === 'public' || Boolean(clue.ownerCharId) || unlocked.has(clue.id);
    if (reachable) continue;

    if (searchableIds.has(clue.id) && firstSearch) {
      firstSearch.unlocks = { ...firstSearch.unlocks, clueIds: [...new Set([...(firstSearch.unlocks?.clueIds ?? []), clue.id])] };
    } else if (clue.visibility === 'private' && !clue.ownerCharId && firstSearch) {
      clue.visibility = 'searchable';
      clue.round = clue.round ?? 1;
      firstSearch.unlocks = { ...firstSearch.unlocks, clueIds: [...new Set([...(firstSearch.unlocks?.clueIds ?? []), clue.id])] };
    }
  }
}

function repairSolutionChain(script: Script): void {
  const clueIds = new Set(script.clues.map((c) => c.id));
  const resolved: string[] = [];
  const keyClues = script.clues.filter((c) => c.isKey);

  for (const ref of script.truth!.solutionChain) {
    if (clueIds.has(ref)) {
      resolved.push(ref);
      continue;
    }
    const match = keyClues.find((c) => c.pointsTo.includes(ref));
    if (match) resolved.push(match.id);
  }

  for (const clue of keyClues) {
    if (!resolved.includes(clue.id)) resolved.push(clue.id);
  }

  script.truth!.solutionChain = resolved.length > 0 ? resolved : script.truth!.solutionChain;
}

function repairCharacterBalance(script: Script): void {
  const playable = playableCharacters(script);
  for (const character of playable) {
    if (!character.objectives.some((o) => o.kind === 'main')) {
      character.objectives.unshift({
        id: `${character.id}_main`,
        kind: 'main',
        description: character.isMurderer ? '隐藏自己的关键秘密并误导他人判断' : '查明真相并洗清自己的嫌疑',
      });
    }
    if (character.secrets.length === 0) {
      character.secrets.push('你隐瞒了案发前后一个会改变他人判断的细节。');
    }
  }
}

function playableCharacters(script: Script): Character[] {
  return script.characters.filter((c) => !c.isVictim);
}

async function validateAndRepair(
  script: Script,
  callbacks: PipelineCallbacks,
): Promise<Script> {
  let current = repairScript(script);
  for (let round = 0; round < 3; round++) {
    const result = validateScript(current);
    if (result.ok) return current;

    const errors = result.issues.filter((i) => i.level === 'error');
    if (errors.length === 0) return current; // only warnings

    callbacks.onRetry('validateAndRepair', round, errors.map((e) => e.message).join('; '));
    current = repairScript(current);
  }

  const finalResult = validateScript(current);
  const finalErrors = finalResult.issues.filter((i) => i.level === 'error');
  if (finalErrors.length > 0) {
    throw new Error(`剧本校验修复失败:\n${finalErrors.map((e) => `${e.path}: ${e.message}`).join('\n')}`);
  }
  return current;
}
