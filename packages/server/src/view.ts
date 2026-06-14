import type { Script, ScriptMeta, RuntimeState, ClientStateView, Clue, Phase, PhaseKind, ActionKind, SearchableClueStub } from '@mmg/schema';
import { evaluateFlowCondition } from './engine/flow.js';

/**
 * 可见性裁剪 — 防作弊核心。
 * 剔除 Truth、他人 privateScript/secrets/isMurderer、未获取线索内容。
 */
export function buildView(
  script: Script | null,
  state: RuntimeState,
  forPlayerId: string,
  availableScripts: ScriptMeta[] = [],
  extra?: { isTestMode?: boolean; dmEnabled?: boolean; pendingAdvance?: boolean; phaseHistory?: string[] },
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
      players: state.players.map((p) => ({
        playerId: p.playerId,
        nickname: p.nickname,
        charId: p.charId,
        connected: p.connected,
        ready: p.ready,
        isHost: p.isHost,
      })),
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

  // 已公开线索(含内容)
  const revealedClues = state.revealedClues
    .map((id) => script.clues.find((c) => c.id === id))
    .filter(Boolean) as Clue[];

  // 可搜证线索(已解锁、未被任何人获取,只含 id+title)
  const myAcquired = charId ? new Set(state.acquiredClues[charId] ?? []) : new Set<string>();
  const anyoneAcquired = new Set<string>();
  for (const ids of Object.values(state.acquiredClues)) {
    for (const id of ids) anyoneAcquired.add(id);
  }
  const searchableClues: SearchableClueStub[] = script.clues
    .filter((c) => {
      // 必须已解锁
      if (!state.flags[`unlocked:${c.id}`]) return false;
      // 不能已被任何人获取
      if (anyoneAcquired.has(c.id)) return false;
      // visibility 检查
      if (c.visibility === 'searchable') {
        // 普通可搜线索
      } else if (c.visibility === 'private') {
        // 秘密线索：需玩家有对应技能才能看到
        if (!c.requiredSkill || !charId) return false;
        const playerChar = script.characters.find((ch) => ch.id === charId);
        if (!playerChar?.skills?.includes(c.requiredSkill)) return false;
      } else {
        return false;
      }
      return true;
    })
    .map((c) => ({ id: c.id, title: c.title, sceneId: c.sceneId }));

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

  // 当前环节信息(全员可见)
  const currentPhase = state.status === 'playing' ? buildPhaseView(script, state, charId) : undefined;
  const phaseProgress = state.status === 'playing' ? buildPhaseProgress(script, state) : undefined;

  // 自身私密数据
  const self = charId ? buildSelfView(script, state, charId) : undefined;

  return {
    roomCode: state.roomCode,
    status: state.status,
    selectedScript: script.meta,
    availableScripts,
    players: state.players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      charId: p.charId,
      connected: p.connected,
      ready: p.ready,
      isHost: p.isHost,
    })),
    self,
    currentPhase,
    phaseProgress,
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
    revealedClues,
    searchableClues,
    sceneSearchProgress,
    sceneImages: Object.fromEntries(script.scenes.map((s) => [s.id, s.visual.asset?.path ?? ''])),
    propImages: Object.fromEntries((script.props ?? []).map((p) => [p.id, p.visual.asset?.path ?? ''])),
    votesPublic: buildVotesPublic(state, charId, currentPhase),
    teams: state.teams,
    myFaction: charId ? script.characters.find((c) => c.id === charId)?.faction : undefined,
    ending: (state.status === 'finished' || (state.status === 'playing' && script.phases.find(p => p.id === state.currentPhaseId)?.kind === 'reveal'))
      ? buildEnding(script, state) : undefined,
    isTestMode: extra?.isTestMode,
    dmEnabled: extra?.dmEnabled,
    pendingAdvance: extra?.pendingAdvance,
    phaseHistory: extra?.phaseHistory,
    log: state.log,
  };
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
  if (!ch) return { charId, privateScript: '', storyUnlocked: [], unlockedNarratives: [], unlockedPhaseBlocks: [], objectives: [], myClues: [], skills: [], passiveClueGivers: [], mandatoryReveal: [] };

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
  };
}

function buildEnding(
  script: Script,
  state: RuntimeState,
): NonNullable<ClientStateView['ending']> {
  // 通用结局:顶层 endings 优先,回退 truth.endings(推理本)
  const endings = script.endings ?? script.truth?.endings ?? [];
  // 复用 flow 的单点判定,与 DAG 实际走向保持一致(P1-5)
  let ending = endings.find((en) => evaluateFlowCondition(en.condition, state));
  // 兜底
  if (!ending) ending = endings.at(-1);
  if (!ending) return { title: '结局', narrative: '', truthReveal: script.truth?.reveal ?? '' };

  return {
    title: ending.title,
    narrative: ending.narrative,
    truthReveal: script.truth?.reveal ?? '',
    theories: Object.keys(state.theories).length > 0 ? state.theories : undefined,
  };
}
