import type { Script, ScriptMeta, RuntimeState, ClientStateView, Clue, PhaseKind, ActionKind, SearchableClueStub } from '@mmg/schema';
import { evaluateFlowCondition } from './engine/flow.js';

/**
 * 可见性裁剪 — 防作弊核心。
 * 剔除 Truth、他人 privateScript/secrets/isMurderer、未获取线索内容。
 *
 * 性能:buildView 内部可复用一份预算好的「公共部分」(buildSharedParts),
 * 避免给 N 个玩家广播时重复计算与玩家无关的数据。单玩家调用走原路径(自算)。
 */
export function buildView(
  script: Script | null,
  state: RuntimeState,
  forPlayerId: string,
  availableScripts: ScriptMeta[] = [],
  extra?: { isTestMode?: boolean; dmEnabled?: boolean; pendingAdvance?: boolean; phaseHistory?: string[]; paused?: boolean },
  shared?: SharedParts,
): ClientStateView {
  const player = state.players.find((p) => p.playerId === forPlayerId);
  const charId = player?.charId;

  // 无剧本时的精简视图(lobby 选本阶段)
  if (!script) {
    return {
      roomCode: state.roomCode,
      status: state.status,
      selectedScript: undefined,
      availableScripts,
      players: state.players.map(mapPlayerPublic),
      publicCharacters: [],
      publicScenes: [],
      revealedClues: [],
      searchableClues: [],
      sceneSearchProgress: {},
      sceneImages: {},
      isTestMode: extra?.isTestMode,
      dmEnabled: extra?.dmEnabled,
      pendingAdvance: extra?.pendingAdvance,
      phaseHistory: extra?.phaseHistory,
      log: state.log,
    };
  }

  // 复用调用方预算的公共部分;未提供则现场计算(保持单玩家调用兼容)
  const pub = shared ?? buildSharedParts(script, state);

  // 可搜证线索(已解锁、未被任何人获取,只含 id+title) — 依赖玩家技能,逐玩家算
  const charMap = new Map(script.characters.map((ch) => [ch.id, ch]));
  const searchableClues: SearchableClueStub[] = script.clues
    .filter((c) => {
      // 必须已解锁
      if (!state.flags[`unlocked:${c.id}`]) return false;
      // 不能已被任何人获取
      if (pub.anyoneAcquired.has(c.id)) return false;
      // visibility 检查
      if (c.visibility === 'searchable') {
        // 普通可搜线索
      } else if (c.visibility === 'private') {
        // 秘密线索：需玩家有对应技能才能看到
        if (!c.requiredSkill || !charId) return false;
        const playerChar = charMap.get(charId);
        if (!playerChar?.skills?.includes(c.requiredSkill)) return false;
      } else {
        return false;
      }
      return true;
    })
    .map((c) => ({ id: c.id, title: c.title, sceneId: c.sceneId }));

  // 当前环节信息(全员可见) — mySearchCount 是逐玩家的,这里传入 charId
  const currentPhase = state.status === 'playing' ? buildPhaseView(script, state, charId) : undefined;
  const phaseProgress = state.status === 'playing' ? buildPhaseProgress(script, state) : undefined;

  // 自身私密数据
  const self = charId ? buildSelfView(script, state, charId) : undefined;

  return {
    roomCode: state.roomCode,
    status: state.status,
    selectedScript: script.meta,
    availableScripts,
    players: pub.players,
    self,
    isObserver: player?.isObserver || undefined,
    paused: extra?.paused,
    currentPhase,
    phaseProgress,
    publicCharacters: pub.publicCharacters,
    publicScenes: pub.publicScenes,
    revealedClues: pub.revealedClues,
    searchableClues,
    sceneSearchProgress: pub.sceneSearchProgress,
    sceneImages: pub.sceneImages,
    propImages: pub.propImages,
    votesPublic: buildVotesPublic(state, charId, currentPhase),
    teams: state.teams,
    myFaction: charId ? script.characters.find((c) => c.id === charId)?.faction : undefined,
    counters: state.counters,
    ending: (state.status === 'finished' || (state.status === 'playing' && script.phases.find(p => p.id === state.currentPhaseId)?.kind === 'reveal'))
      ? buildEnding(script, state, charId, state.status === 'finished') : undefined,
    isTestMode: extra?.isTestMode,
    dmEnabled: extra?.dmEnabled,
    pendingAdvance: extra?.pendingAdvance,
    phaseHistory: extra?.phaseHistory,
    log: state.log,
    privateMessages: charId
      ? (state.privateMessages ?? []).filter(
          (m) => m.fromCharId === charId || m.toCharId === charId,
        )
      : undefined,
  };
}

/** M1: player → 公开字段映射(lobby 与 buildSharedParts 共用,消除重复)。 */
function mapPlayerPublic(p: RuntimeState['players'][number]): ClientStateView['players'][number] {
  return {
    playerId: p.playerId,
    nickname: p.nickname,
    charId: p.charId,
    connected: p.connected,
    ready: p.ready,
    isHost: p.isHost,
    isObserver: p.isObserver || undefined,
    disconnectedAt: p.disconnectedAt,
  };
}

/** buildView 的公共部分(与玩家无关,广播时只算一次)。 */
export interface SharedParts {
  revealedClues: Clue[];
  sceneSearchProgress: Record<string, { total: number; acquired: number }>;
  sceneImages: Record<string, string>;
  propImages: Record<string, string>;
  publicCharacters: ClientStateView['publicCharacters'];
  publicScenes: ClientStateView['publicScenes'];
  players: ClientStateView['players'];
  /** 所有玩家已获取线索的并集(searchableClues 过滤 + sceneSearchProgress 统计共用)。 */
  anyoneAcquired: Set<string>;
}

/**
 * 计算 buildView 中与玩家无关的部分。
 * 广播 N 个玩家时调用方算一次,再喂给 buildView(_, _, _, _, _, shared),省 N-1 次重复扫描。
 */
export function buildSharedParts(script: Script, state: RuntimeState): SharedParts {
  // 已公开线索(含内容)
  const revealedClues = state.revealedClues
    .map((id) => script.clues.find((c) => c.id === id))
    .filter(Boolean) as Clue[];

  // 所有玩家已获取线索的并集
  const anyoneAcquired = new Set<string>();
  for (const ids of Object.values(state.acquiredClues)) {
    for (const id of ids) anyoneAcquired.add(id);
  }

  // 每场景搜证进度
  const sceneSearchProgress: Record<string, { total: number; acquired: number }> = {};
  for (const clue of script.clues) {
    if (clue.visibility !== 'searchable') continue;
    if (!state.flags[`unlocked:${clue.id}`]) continue;
    const sceneId = clue.sceneId ?? '__unscened';
    if (!sceneSearchProgress[sceneId]) sceneSearchProgress[sceneId] = { total: 0, acquired: 0 };
    sceneSearchProgress[sceneId].total++;
    if (anyoneAcquired.has(clue.id)) sceneSearchProgress[sceneId].acquired++;
  }

  return {
    revealedClues,
    sceneSearchProgress,
    sceneImages: Object.fromEntries(script.scenes.map((s) => [s.id, s.visual.asset?.path ?? ''])),
    propImages: Object.fromEntries((script.props ?? []).map((p) => [p.id, p.visual.asset?.path ?? ''])),
    publicCharacters: script.characters.map((c) => ({
      id: c.id,
      name: c.name,
      gender: c.gender,
      publicProfile: c.publicProfile,
      isVictim: c.isVictim,
      faction: c.faction,
      avatar: c.visual.asset?.path,
      publicTimeline: c.timeline?.filter((t) => t.isPublic).map((t) => ({
        time: t.time,
        location: t.location,
        action: t.action,
      })),
      publicRelations: c.relationships?.filter((r) => r.isPublic).map((r) => ({
        targetCharId: r.targetCharId,
        relation: r.relation,
      })),
    })),
    publicScenes: script.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      image: s.visual.asset?.path,
    })),
    players: state.players.map(mapPlayerPublic),
    anyoneAcquired,
  };
}

/**
 * 批量为多个玩家构建视图(广播专用)。
 * 公共部分(buildSharedParts)只算一次,每个玩家仅算其私有部分。
 * 输出与逐个调用 buildView 字节等价(view-parity.test.ts 守护)。
 */
/**
 * 脏标记缓存:上一次 buildViewBatch 的 state hash + 输出。
 * 当 state 未变且 playerIds 相同时直接返回缓存,避免重复构建。
 */
let lastBatchHash = '';
let lastBatchResult: Array<{ playerId: string; view: ClientStateView }> = [];

/** 显式清除 batch 缓存(状态变更后调用)。 */
export function clearViewBatchCache(): void {
  lastBatchHash = '';
  lastBatchResult = [];
}

function computeBatchHash(state: RuntimeState, playerIds: string[], extra: unknown): string {
  // hash 所有影响 view 输出的状态字段,避免缓存脏读
  return [
    state.scriptId, state.status, state.currentPhaseId, state.log.length,
    state.phaseRuntime.actedCharIds.length, state.phaseRuntime.turnIndex,
    state.phaseRuntime.deadline, state.phaseRuntime.round,
    state.phaseRuntime.searchedThisRound?.length ?? 0,
    Object.keys(state.votes).length, Object.keys(state.theories).length,
    Object.keys(state.flags).length, state.revealedClues.length,
    Object.keys(state.acquiredClues).length, Object.keys(state.counters ?? {}).length,
    playerIds.join(','), JSON.stringify(extra),
  ].join(':');
}

export function buildViewBatch(
  script: Script | null,
  state: RuntimeState,
  playerIds: string[],
  availableScripts: ScriptMeta[] = [],
  extra?: { isTestMode?: boolean; dmEnabled?: boolean; pendingAdvance?: boolean; phaseHistory?: string[]; paused?: boolean },
): Array<{ playerId: string; view: ClientStateView }> {
  const hash = computeBatchHash(state, playerIds, extra);
  if (hash === lastBatchHash && lastBatchResult.length > 0) {
    // playerIds 内容相同(长度已入hash)且state未变,直接复用
    return lastBatchResult;
  }
  // 无剧本:每个玩家视图相同(无公共部分可共享的复杂计算),逐个构建即可
  let result: Array<{ playerId: string; view: ClientStateView }>;
  if (!script) {
    result = playerIds.map((playerId) => ({
      playerId,
      view: buildView(script, state, playerId, availableScripts, extra),
    }));
  } else {
    const shared = buildSharedParts(script, state);
    result = playerIds.map((playerId) => ({
      playerId,
      view: buildView(script, state, playerId, availableScripts, extra, shared),
    }));
  }
  lastBatchHash = hash;
  lastBatchResult = result;
  return result;
}

function buildVotesPublic(
  state: RuntimeState,
  selfCharId: string | undefined,
  currentPhase: ClientStateView['currentPhase'],
): Record<string, string> | undefined {
  // 游戏中投票阶段:仅自己看到自己投了谁
  if (state.status === 'playing' && currentPhase?.kind === 'vote') {
    return Object.fromEntries(
      Object.entries(state.votes).map(([voterCharId, targetCharId]) => [
        voterCharId,
        voterCharId === selfCharId ? targetCharId : '__voted__',
      ]),
    );
  }
  // 游戏结束:公开全部票型
  if (state.status === 'finished') {
    return Object.fromEntries(
      Object.entries(state.votes).map(([voterCharId, targetCharId]) => [
        voterCharId,
        targetCharId,
      ]),
    );
  }
  return undefined;
}

function buildPhaseView(script: Script, state: RuntimeState, charId: string | undefined): ClientStateView['currentPhase'] {
  const phase = script.phases.find((p) => p.id === state.currentPhaseId);
  if (!phase) return undefined;
  const rt = state.phaseRuntime;

  let turnCharId: string | undefined;
  if (phase.kind === 'sequential' && phase.turnOrder) {
    turnCharId = phase.turnOrder[rt.turnIndex ?? 0];
  }

  return {
    id: phase.id,
    kind: phase.kind as PhaseKind,
    title: phase.title,
    instruction: phase.instruction,
    allowedActions: phase.allowedActions as ActionKind[],
    turnCharId,
    deadline: rt.deadline,
    narrativeText: phase.narrativeText,
    unlockedStoryKey: phase.unlocks?.storyKey,
    maxSearches: phase.maxSearches,
    mySearchCount: charId ? (state.phaseRuntime.searchCount?.[charId] ?? 0) : undefined,
    restrictVoteTargets: state.phaseRuntime.resolvedVoteTargets ?? (Array.isArray(phase.restrictVoteTargets) ? phase.restrictVoteTargets : undefined),
    voteMode: phase.voteMode,
    choice: phase.choice ? { id: phase.choice.id, prompt: phase.choice.prompt, options: phase.choice.options.map((o) => ({ id: o.id, label: o.label })) } : undefined,
    currentTime: state.phaseRuntime.currentTime,
    clockEnd: phase.clock?.endTime,
    round: state.phaseRuntime.round,
    maxRounds: phase.maxRounds,
  };
}

function buildPhaseProgress(script: Script, state: RuntimeState): ClientStateView['phaseProgress'] {
  const phase = script.phases.find((p) => p.id === state.currentPhaseId);
  if (!phase) return undefined;

  const connectedCharIds = state.players
    .filter((p) => p.connected && p.charId)
    .map((p) => p.charId!);
  const participantIds = Array.isArray(phase.participants)
    ? connectedCharIds.filter((id) => phase.participants.includes(id))
    : connectedCharIds;
  const requiredCharIds = phase.kind === 'sequential' && phase.turnOrder
    ? phase.turnOrder.filter((id) => participantIds.includes(id))
    : participantIds;

  const actedSet = new Set(state.phaseRuntime.actedCharIds);
  return {
    actedCharIds: state.phaseRuntime.actedCharIds,
    requiredCharIds,
    totalRequired: requiredCharIds.length,
    actedCount: requiredCharIds.filter((id) => actedSet.has(id)).length,
    pendingCharIds: requiredCharIds.filter((id) => !actedSet.has(id)),
    exitKind: phase.exit.kind,
  };
}

function buildSelfView(script: Script, state: RuntimeState, charId: string): NonNullable<ClientStateView['self']> {
  const ch = script.characters.find((c) => c.id === charId);
  if (!ch) return { charId, privateScript: '', storyUnlocked: [], unlockedNarratives: [], unlockedPhaseBlocks: [], objectives: [], myClues: [], skills: [], passiveClueGivers: [], mandatoryReveal: [], unlockedKeywordMemories: [] };

  // 已获取的线索(含内容)
  const myClueIds = state.acquiredClues[charId] ?? [];
  const myClues = myClueIds
    .map((id) => script.clues.find((c) => c.id === id))
    .filter(Boolean) as Clue[];

  // 分幕剧情(按剧本 phase 顺序排列)，仅下发已解锁的
  const storyUnlocked: string[] = [];
  const unlockedNarratives: { phaseTitle: string; text: string }[] = [];
  const unlockedPhaseBlocks: { phaseTitle: string; narrative?: string; story?: string }[] = [];
  for (const phase of script.phases) {
    const key = phase.unlocks?.storyKey;
    if (key && state.flags[`story:${key}`]) {
      const story = ch.storyByPhase?.[key];
      const narrative = phase.narrativeText;
      if (story) storyUnlocked.push(story);
      if (narrative) unlockedNarratives.push({ phaseTitle: phase.title, text: narrative });
      // 按阶段把公共旁白与角色私人记忆配对,供「我的剧本」交错排列
      if (story || narrative) {
        unlockedPhaseBlocks.push({
          phaseTitle: phase.title,
          narrative: narrative || undefined,
          story: story || undefined,
        });
      }
    }
  }
  // 永远包含开篇
  if (ch.privateScript) storyUnlocked.unshift(ch.privateScript);

  return {
    charId,
    privateScript: ch.privateScript,
    storyUnlocked,
    unlockedNarratives,
    unlockedPhaseBlocks,
    objectives: ch.objectives,
    myClues,
    relationships: ch.relationships, // 包含玩家自己的完整关系（含私有关系和 sharedSecret）
    skills: ch.skills ?? [],
    passiveClueGivers: ch.passiveClueGivers ?? [],
    mandatoryReveal: ch.mandatoryReveal ?? [],
    theory: state.theories[charId] || undefined,
    unlockedKeywordMemories: (ch.keywordMemories ?? [])
      .filter((km) => state.flags[`kwmem:${charId}:${km.id}`])
      .map((km) => ({ id: km.id, keyword: km.keyword, text: km.text })),
    searchedThisRound: state.phaseRuntime.searchedThisRound?.includes(charId) ?? false,
    resources: state.resources?.[charId] ?? undefined,
  };
}

function buildEnding(
  script: Script,
  state: RuntimeState,
  forCharId?: string,
  fullyFinished = false,
): NonNullable<ClientStateView['ending']> {
  // 通用结局:顶层 endings 优先,回退 truth.endings(推理本)
  const endings = script.endings ?? script.truth?.endings ?? [];
  // 复用 flow 的单点判定,与 DAG 实际走向保持一致(P1-5);支持多条件组合结局(数组=AND)
  let ending = endings.find((en) => {
    const conds = Array.isArray(en.condition) ? en.condition : [en.condition];
    return conds.every((c) => evaluateFlowCondition(c, state));
  });
  // 兜底
  if (!ending) ending = endings.at(-1);
  if (!ending) return { title: '结局', narrative: '', truthReveal: script.truth?.reveal ?? '' };

  // B2: theories 在游戏彻底 finished 前只下发自己的推理,防止 reveal 早期(若有后续收尾环节)
  // 提前暴露他人推理。fullyFinished 后才全量下发。
  let theories: Record<string, string> | undefined;
  if (Object.keys(state.theories).length > 0) {
    if (fullyFinished) {
      theories = state.theories;
    } else if (forCharId && state.theories[forCharId]) {
      theories = { [forCharId]: state.theories[forCharId] };
    }
  }

  return {
    title: ending.title,
    narrative: ending.narrative,
    truthReveal: script.truth?.reveal ?? '',
    theories,
  };
}
