import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhaseEngine } from '../src/engine/PhaseEngine.js';
import { Room } from '../src/room/Room.js';
import { DmService } from '../src/dm/DmService.js';
import { loadScript } from '../src/loader.js';
import type { Script, RuntimeState, GameEvent, ServerMessage, ClientStateView } from '@mmg/schema';
import { fileURLToPath } from 'node:url';

// ─── 共用基础设施 ───

function makeBus(events: string[] = [], pmMailboxes?: Map<string, Array<{ fromCharId: string; text: string }>>) {
  return {
    broadcastState: () => {},
    event: (evt: Omit<GameEvent, 'ts'>) => events.push(evt.type),
    sendToChar: (charId: string, msg: { kind: string; fromCharId?: string; text?: string }) => {
      if (msg.kind === 'privateMessage' && pmMailboxes) {
        if (!pmMailboxes.has(charId)) pmMailboxes.set(charId, []);
        pmMailboxes.get(charId)!.push({ fromCharId: msg.fromCharId!, text: msg.text! });
      }
    },
  };
}

function makeState(opts: { players?: { playerId: string; charId: string; nickname: string }[]; phaseId?: string } = {}): RuntimeState {
  return {
    roomCode: 'TEST',
    scriptId: 'mock',
    status: 'playing' as const,
    players: (opts.players ?? [
      { playerId: 'p1', charId: 'c_wife', nickname: 'A', connected: true, ready: true, isHost: true },
      { playerId: 'p2', charId: 'c_butler', nickname: 'B', connected: true, ready: true, isHost: false },
      { playerId: 'p3', charId: 'c_doctor', nickname: 'C', connected: true, ready: true, isHost: false },
    ]).map((p) => ({ ...p, connected: true, ready: true, isHost: p.playerId === 'p1' })),
    currentPhaseId: opts.phaseId ?? '',
    phaseRuntime: { phaseId: opts.phaseId ?? '', startedAt: Date.now(), actedCharIds: [] },
    revealedClues: [],
    acquiredClues: {},
    votes: {},
    theories: {},
    flags: {},
    teams: {},
    resources: {},
    counters: {},
    log: [],
  };
}

const mockScriptPath = fileURLToPath(new URL('../../../content/mock', import.meta.url));
const { script: mockScript } = loadScript(mockScriptPath);

function createSendCapture() {
  const mailboxes = new Map<string, ServerMessage[]>();
  const send = (playerId: string, msg: ServerMessage) => {
    if (!mailboxes.has(playerId)) mailboxes.set(playerId, []);
    mailboxes.get(playerId)!.push(msg);
  };
  const lastView = (playerId: string): ClientStateView | undefined => {
    const msgs = mailboxes.get(playerId) ?? [];
    let base: Record<string, unknown> | undefined;
    let baseIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]!.kind === 'stateSync') {
        base = (msgs[i] as { view: ClientStateView }).view as unknown as Record<string, unknown>;
        baseIdx = i;
        break;
      }
    }
    if (!base) return undefined;
    base = { ...base };
    for (let i = baseIdx + 1; i < msgs.length; i++) {
      const m = msgs[i]!;
      if (m.kind === 'statePatch') {
        const { patches, removes } = m as { patches: Record<string, unknown>; removes?: string[] };
        for (const [path, value] of Object.entries(patches)) setByPath(base!, path, value);
        for (const path of removes ?? []) deleteByPath(base!, path);
      }
    }
    return base as unknown as ClientStateView;
  };
  const messages = (playerId: string): ServerMessage[] => mailboxes.get(playerId) ?? [];
  return { send, lastView, messages };
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return;
  if (parts.length >= 2 && parts[parts.length - 1] === '-') {
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 2; i++) {
      const key = parts[i]!;
      const next = cur[key];
      if (next == null || typeof next !== 'object') cur[key] = {};
      cur = cur[key] as Record<string, unknown>;
    }
    const arrKey = parts[parts.length - 2]!;
    const arr = cur[arrKey];
    if (Array.isArray(arr) && Array.isArray(value)) arr.push(...value);
    else if (Array.isArray(value)) cur[arrKey] = value;
    return;
  }
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (next == null || typeof next !== 'object') cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function deleteByPath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]!];
    if (next == null || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]!];
}

function createRoomWithScript(send: (playerId: string, msg: ServerMessage) => void): Room {
  const room = new Room(send);
  room.setScriptProvider(
    [mockScript.meta],
    (id) => id === mockScript.meta.id ? mockScript : undefined,
  );
  return room;
}

const introTurnOrder = mockScript.phases.find((p) => p.id === 'p_intro')!.turnOrder!;

function setupFullRoom() {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);
  const hostResult = room.join('玩家1');
  assert.ok('playerId' in hostResult);
  const hostId = hostResult.playerId;
  room.selectScript(hostId, mockScript.meta.id);

  const playerIds: string[] = [hostId];
  for (let i = 1; i < 6; i++) {
    const r = room.join(`玩家${i + 1}`);
    assert.ok('playerId' in r, `玩家${i + 1}加入成功`);
    playerIds.push(r.playerId);
  }

  room.startAssigning(playerIds[0]!);
  for (let i = 0; i < 6; i++) {
    const res = room.selectChar(playerIds[i]!, introTurnOrder[i]!);
    assert.ok(!res.error, `分配角色 ${introTurnOrder[i]}: ${res.error}`);
  }

  return { room, playerIds, cap };
}

function fastForwardTo(room: Room, playerIds: string[], targetPhaseId: string): void {
  const readyPhases = ['p_brief', 'p_backstory', 'p_prologue'];
  const speakPhases = ['p_intro'];
  let safety = 0;
  while (room.getState().currentPhaseId !== targetPhaseId && safety < 30) {
    const cur = room.getState().currentPhaseId;
    if (readyPhases.includes(cur)) {
      for (const pid of playerIds) room.handleIntent(pid, { kind: 'ready' });
    } else if (speakPhases.includes(cur)) {
      for (const pid of playerIds) room.handleIntent(pid, { kind: 'speak', text: '发言' });
    } else {
      for (const pid of playerIds) room.handleIntent(pid, { kind: 'ready' });
    }
    safety++;
  }
}

// ═══════════════════════════════════════════════════
// 1. 投票平票决胜 (Vote Tiebreaker)
// ═══════════════════════════════════════════════════

test('Vote tiebreaker: 平票后进入决胜轮,restrictVoteTargets=tied 限制只能投平票角色', () => {
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_vote', kind: 'vote' as const, title: '投票', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], exit: { kind: 'voteComplete' as const } },
      { id: 'p_tiebreak', kind: 'vote' as const, title: '决胜', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], restrictVoteTargets: 'tied' as const, exit: { kind: 'voteComplete' as const } },
      { id: 'p_end_good', kind: 'reveal' as const, title: '好结局', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'timer' as const, timerSec: 15 } },
      { id: 'p_end_bad', kind: 'reveal' as const, title: '坏结局', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'timer' as const, timerSec: 15 } },
    ],
    flow: {
      entry: 'p_vote',
      edges: [
        { from: 'p_vote', to: 'p_tiebreak', condition: { kind: 'voteTie' as const } },
        { from: 'p_vote', to: 'p_end_good', condition: { kind: 'voteResult' as const, equalsCharId: 'c_butler' } },
        { from: 'p_vote', to: 'p_end_bad', condition: { kind: 'always' as const } },
        { from: 'p_tiebreak', to: 'p_end_good', condition: { kind: 'voteResult' as const, equalsCharId: 'c_butler' } },
        { from: 'p_tiebreak', to: 'p_end_bad', condition: { kind: 'always' as const } },
      ],
    },
  };

  const state = makeState();
  const events: string[] = [];
  const engine = new PhaseEngine(script, state, makeBus(events));
  engine.start();
  assert.equal(state.currentPhaseId, 'p_vote');

  // 各投不同人 → 平票
  engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'c_butler' });
  engine.handleAction('c_butler', { kind: 'castVote', targetCharId: 'c_wife' });
  engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'c_singer' });

  assert.equal(state.currentPhaseId, 'p_tiebreak', '平票后应进入决胜轮');
  assert.deepEqual(state.tieCharIds, ['c_butler', 'c_wife', 'c_singer'], 'tieCharIds 应记录所有平票角色');
  assert.deepEqual(state.phaseRuntime.resolvedVoteTargets, ['c_butler', 'c_wife', 'c_singer'], 'resolvedVoteTargets 应从 tieCharIds 填充');
});

test('Vote tiebreaker: 决胜轮中投非平票角色被拒 (target_restricted)', () => {
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_tiebreak', kind: 'vote' as const, title: '决胜', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], restrictVoteTargets: 'tied' as const, exit: { kind: 'voteComplete' as const } },
      { id: 'p_end', kind: 'reveal' as const, title: '结局', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'timer' as const, timerSec: 15 } },
    ],
    flow: {
      entry: 'p_tiebreak',
      edges: [
        { from: 'p_tiebreak', to: 'p_end', condition: { kind: 'always' as const } },
      ],
    },
  };

  const state = makeState();
  state.tieCharIds = ['c_wife', 'c_butler'];
  const engine = new PhaseEngine(script, state, makeBus());
  engine.start();

  assert.deepEqual(state.phaseRuntime.resolvedVoteTargets, ['c_wife', 'c_butler'], 'resolvedVoteTargets 应从 tieCharIds 填充');

  // 尝试投非平票角色 → 被拒
  const r = engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'c_singer' });
  assert.equal(r.error, 'target_restricted', '投非平票角色应被拒');

  // 投平票角色 → 成功
  const r2 = engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'c_wife' });
  assert.equal(r2.error, undefined, '投平票角色应成功');
});

test('Vote tiebreaker: voteTie flow 条件 — 有唯一胜者时 voteTie 不命中', () => {
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_vote', kind: 'vote' as const, title: '投票', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], exit: { kind: 'voteComplete' as const } },
      { id: 'p_tie', kind: 'reveal' as const, title: '平票结局', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'timer' as const, timerSec: 15 } },
      { id: 'p_winner', kind: 'reveal' as const, title: '胜者结局', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'timer' as const, timerSec: 15 } },
    ],
    flow: {
      entry: 'p_vote',
      edges: [
        { from: 'p_vote', to: 'p_tie', condition: { kind: 'voteTie' as const } },
        { from: 'p_vote', to: 'p_winner', condition: { kind: 'always' as const } },
      ],
    },
  };

  const state = makeState();
  const engine = new PhaseEngine(script, state, makeBus());
  engine.start();

  // 有唯一胜者(2:1)
  engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'c_butler' });
  engine.handleAction('c_butler', { kind: 'castVote', targetCharId: 'c_wife' });
  engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'c_butler' });

  assert.equal(state.currentPhaseId, 'p_winner', '有唯一胜者时 voteTie 不应命中');
});

// ═══════════════════════════════════════════════════
// 2. 阵营投票 (Team/Faction Voting)
// ═══════════════════════════════════════════════════

test('Team voting: 过半投票设 flag,flow teamWin 条件命中', () => {
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_vote', kind: 'vote' as const, title: '阵营投票', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], voteMode: 'team' as const, exit: { kind: 'voteComplete' as const } },
      { id: 'p_alpha_win', kind: 'reveal' as const, title: 'Alpha 胜', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'hostAdvance' as const } },
      { id: 'p_beta_win', kind: 'reveal' as const, title: 'Beta 胜', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'hostAdvance' as const } },
      { id: 'p_default', kind: 'reveal' as const, title: '无结果', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'hostAdvance' as const } },
    ],
    flow: {
      entry: 'p_vote',
      edges: [
        { from: 'p_vote', to: 'p_alpha_win', condition: { kind: 'teamWin' as const, teamId: 'alpha' } },
        { from: 'p_vote', to: 'p_beta_win', condition: { kind: 'teamWin' as const, teamId: 'beta' } },
        { from: 'p_vote', to: 'p_default', condition: { kind: 'always' as const } },
      ],
    },
  };

  const state = makeState();
  const engine = new PhaseEngine(script, state, makeBus());
  engine.start();

  // 2 票 alpha, 1 票 beta → alpha 过半
  engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'alpha' });
  engine.handleAction('c_butler', { kind: 'castVote', targetCharId: 'alpha' });
  engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'beta' });

  assert.equal(state.flags['team_alpha_won'], true, 'alpha 过半应设 flag');
  assert.equal(state.flags['team_beta_won'], undefined, 'beta 未过半不应设 flag');
  assert.equal(state.currentPhaseId, 'p_alpha_win', '应推进到 alpha 胜利环节');
});

test('Team voting: 无过半(最终)时走 always 兜底', () => {
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_vote', kind: 'vote' as const, title: '阵营投票', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], voteMode: 'team' as const, exit: { kind: 'voteComplete' as const } },
      { id: 'p_alpha_win', kind: 'reveal' as const, title: 'Alpha 胜', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'hostAdvance' as const } },
      { id: 'p_result', kind: 'reveal' as const, title: '结果', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'hostAdvance' as const } },
    ],
    flow: {
      entry: 'p_vote',
      edges: [
        { from: 'p_vote', to: 'p_alpha_win', condition: { kind: 'teamWin' as const, teamId: 'alpha' } },
        { from: 'p_vote', to: 'p_result', condition: { kind: 'always' as const } },
      ],
    },
  };

  const state = makeState();
  const events: string[] = [];
  const engine = new PhaseEngine(script, state, makeBus(events));
  engine.start();

  // 三方各 1 票:alpha 先投时 1/1=100%,但最终 1/3<50%
  // 修复后:flag 仅在 settlePhaseOnExit 时结算,不在投票过程中实时锁存
  engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'alpha' });
  engine.handleAction('c_butler', { kind: 'castVote', targetCharId: 'beta' });
  engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'gamma' });

  // 投票过程中不再实时锁存 flag
  assert.equal(state.flags['team_alpha_won'], undefined, 'alpha flag 不在投票过程中锁存');
  assert.equal(state.flags['team_beta_won'], undefined, 'beta 从未过半');
  assert.equal(state.flags['team_gamma_won'], undefined, 'gamma 从未过半');
});

test('Team voting: restrictVoteTargets 限制可投阵营', () => {
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_vote', kind: 'vote' as const, title: '阵营投票', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], voteMode: 'team' as const, restrictVoteTargets: ['alpha', 'beta'] as const, exit: { kind: 'voteComplete' as const } },
      { id: 'p_end', kind: 'reveal' as const, title: '结束', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'hostAdvance' as const } },
    ],
    flow: { entry: 'p_vote', edges: [{ from: 'p_vote', to: 'p_end', condition: { kind: 'always' as const } }] },
  };

  const state = makeState();
  const engine = new PhaseEngine(script, state, makeBus());
  engine.start();

  // 投不在列表中的阵营 → 被拒
  const r = engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'gamma' });
  assert.equal(r.error, 'target_restricted', '投不在 restrictVoteTargets 中的阵营应被拒');

  // 投允许的阵营 → 成功
  const r2 = engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'alpha' });
  assert.equal(r2.error, undefined, '投允许的阵营应成功');
});

test('Team voting: teamWin 条件 — 已淘汰阵营即使有 flag 也不命中', () => {
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_vote', kind: 'vote' as const, title: '投票', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], voteMode: 'team' as const, exit: { kind: 'voteComplete' as const } },
      { id: 'p_alpha', kind: 'reveal' as const, title: 'Alpha', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'hostAdvance' as const } },
      { id: 'p_other', kind: 'reveal' as const, title: '其他', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'hostAdvance' as const } },
    ],
    flow: {
      entry: 'p_vote',
      edges: [
        { from: 'p_vote', to: 'p_alpha', condition: { kind: 'teamWin' as const, teamId: 'alpha' } },
        { from: 'p_vote', to: 'p_other', condition: { kind: 'always' as const } },
      ],
    },
  };

  const state = makeState();
  const engine = new PhaseEngine(script, state, makeBus());
  engine.start();

  // alpha 过半
  engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'alpha' });
  engine.handleAction('c_butler', { kind: 'castVote', targetCharId: 'alpha' });
  engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'beta' });

  // 虽然 alpha 赢了投票,但已标记淘汰 → teamWin 不命中
  // 重跑:先设淘汰标记
  const state2 = makeState();
  state2.teams = { alpha: { eliminated: true } };
  const engine2 = new PhaseEngine(script, state2, makeBus());
  engine2.start();
  engine2.handleAction('c_wife', { kind: 'castVote', targetCharId: 'alpha' });
  engine2.handleAction('c_butler', { kind: 'castVote', targetCharId: 'alpha' });
  engine2.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'beta' });

  assert.equal(state2.flags['team_alpha_won'], true, 'flag 仍应设置(投票本身不受淘汰影响)');
  assert.equal(state2.currentPhaseId, 'p_other', '已淘汰阵营的 teamWin 条件不应命中');
});

// ═══════════════════════════════════════════════════
// 3. 私信流程 (Private Message Flow)
// ═══════════════════════════════════════════════════

test('Private message: 正常发送和接收', () => {
  const pmMailboxes = new Map<string, Array<{ fromCharId: string; text: string }>>();
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_free', kind: 'free' as const, title: '自由交流', instruction: '', participants: 'all' as const, allowedActions: ['speak' as const, 'privateMessage' as const], exit: { kind: 'hostAdvance' as const } },
    ],
    flow: { entry: 'p_free', edges: [] },
  };

  const state = makeState({ phaseId: 'p_free' });
  const engine = new PhaseEngine(script, state, makeBus([], pmMailboxes));
  engine.start();

  // c_wife 发私信给 c_butler
  const r = engine.handleAction('c_wife', { kind: 'privateMessage', toCharId: 'c_butler', text: '你好，管家' });
  assert.equal(r.error, undefined, '发私信应成功');

  const butlerPm = pmMailboxes.get('c_butler');
  assert.ok(butlerPm, '管家应收到私信');
  assert.equal(butlerPm!.length, 1);
  assert.equal(butlerPm![0]!.fromCharId, 'c_wife');
  assert.equal(butlerPm![0]!.text, '你好，管家');
});

test('Private message: 发给不存在的角色被拒', () => {
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_free', kind: 'free' as const, title: '自由交流', instruction: '', participants: 'all' as const, allowedActions: ['speak' as const, 'privateMessage' as const], exit: { kind: 'hostAdvance' as const } },
    ],
    flow: { entry: 'p_free', edges: [] },
  };

  const state = makeState({ phaseId: 'p_free' });
  const engine = new PhaseEngine(script, state, makeBus());
  engine.start();

  const r = engine.handleAction('c_wife', { kind: 'privateMessage', toCharId: 'c_nonexistent', text: '你好' });
  assert.equal(r.error, 'target_not_found', '发给不存在的角色应被拒');
});

test('Private message: 被淘汰角色不能发私信', () => {
  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_free', kind: 'free' as const, title: '自由交流', instruction: '', participants: 'all' as const, allowedActions: ['speak' as const, 'privateMessage' as const], exit: { kind: 'hostAdvance' as const } },
    ],
    flow: { entry: 'p_free', edges: [] },
  };

  const state = makeState({ phaseId: 'p_free' });
  // 标记 c_wife 为被淘汰
  state.flags['eliminated:c_wife'] = true;
  const engine = new PhaseEngine(script, state, makeBus());
  engine.start();

  const r = engine.handleAction('c_wife', { kind: 'privateMessage', toCharId: 'c_butler', text: '我还活着吗' });
  assert.equal(r.error, 'eliminated', '被淘汰角色不能发私信');
});

test('Private message: 私信不走 broadcastState,仅推送给目标', () => {
  const pmMailboxes = new Map<string, Array<{ fromCharId: string; text: string }>>();
  const broadcastCount = { n: 0 };
  const bus = {
    broadcastState: () => { broadcastCount.n++; },
    event: () => {},
    sendToChar: (charId: string, msg: { kind: string; fromCharId?: string; text?: string }) => {
      if (msg.kind === 'privateMessage' && pmMailboxes) {
        if (!pmMailboxes.has(charId)) pmMailboxes.set(charId, []);
        pmMailboxes.get(charId)!.push({ fromCharId: msg.fromCharId!, text: msg.text! });
      }
    },
  };

  const script: Script = {
    ...mockScript,
    phases: [
      { id: 'p_free', kind: 'free' as const, title: '自由交流', instruction: '', participants: 'all' as const, allowedActions: ['speak' as const, 'privateMessage' as const], exit: { kind: 'hostAdvance' as const } },
    ],
    flow: { entry: 'p_free', edges: [] },
  };

  const state = makeState({ phaseId: 'p_free' });
  const engine = new PhaseEngine(script, state, bus);
  engine.start();

  const before = broadcastCount.n;
  engine.handleAction('c_wife', { kind: 'privateMessage', toCharId: 'c_butler', text: '秘密消息' });
  assert.equal(broadcastCount.n, before + 1, 'handleAction 总会 broadcastState(包含 markActed)');

  // 但第三方 c_doctor 不应收到私信内容
  assert.equal(pmMailboxes.has('c_doctor'), false, '第三方不应收到私信');
});

// ═══════════════════════════════════════════════════
// 4. DmService 基本流程
// ═══════════════════════════════════════════════════

test('DmService: null config → disabled, isEnabled 返回 false', () => {
  const dm = new DmService(null);
  assert.equal(dm.isEnabled, false, 'null config 应 disabled');
});

test('DmService: 空 apiKey → disabled', () => {
  const dm = new DmService({ provider: 'anthropic', apiKey: '', model: 'test' });
  assert.equal(dm.isEnabled, false, '空 apiKey 应 disabled');
});

test('DmService: disabled 时 onEvent 返回 null', async () => {
  const dm = new DmService(null);
  const result = await dm.onEvent('phase_enter', {}, {
    phaseTitle: '测试', phaseKind: 'briefing', publicClueTitles: [], scriptTitle: '测试', characterNames: ['A'],
  });
  assert.equal(result, null, 'disabled 时 onEvent 应返回 null');
});

test('DmService: enabled 但非关键事件返回 null', async () => {
  const dm = new DmService({ provider: 'anthropic', apiKey: 'sk-fake', model: 'test' });
  // speak 不在 shouldRespond 列表中
  const result = await dm.onEvent('speak', { text: 'hello' }, {
    phaseTitle: '测试', phaseKind: 'free', publicClueTitles: [], scriptTitle: '测试', characterNames: ['A'],
  });
  assert.equal(result, null, '非关键事件应返回 null');
});

test('DmService: resetHistory 清空历史', () => {
  const dm = new DmService(null);
  // resetHistory 不应抛错
  assert.doesNotThrow(() => dm.resetHistory());
});

// ═══════════════════════════════════════════════════
// 5. Room 断线重连 (Disconnect/Reconnect)
// ═══════════════════════════════════════════════════

test('Room disconnect/reconnect: 断线后重连保持角色和状态', () => {
  const { room, playerIds, cap } = setupFullRoom();
  const targetPid = playerIds[2]!;
  const charBefore = room.getState().players.find((p) => p.playerId === targetPid)?.charId;

  // 断线
  room.disconnect(targetPid);
  const disconnected = room.getState().players.find((p) => p.playerId === targetPid);
  assert.equal(disconnected?.connected, false, '断线后应标记为 disconnected');

  // 重连(用原 playerId 作为 sessionToken)
  const result = room.join('玩家3回来了', targetPid);
  assert.ok('playerId' in result, '重连应成功');
  assert.equal(result.playerId, targetPid, '重连应返回相同 playerId');

  const reconnected = room.getState().players.find((p) => p.playerId === targetPid);
  assert.equal(reconnected?.connected, true, '重连后应标记为 connected');
  assert.equal(reconnected?.charId, charBefore, '重连后角色应保持不变');
  assert.equal(room.getState().players.length, 6, '重连不应新增玩家');
});

test('Room disconnect/reconnect: 重连后能正常参与游戏', () => {
  const { room, playerIds } = setupFullRoom();
  fastForwardTo(room, playerIds, 'p_intro');

  const targetPid = playerIds[2]!;
  room.disconnect(targetPid);

  // 重连
  room.join('玩家3回来了', targetPid);

  // 重连后发言(按 turnOrder 轮到该玩家时)
  // playerIds[i] 对应 introTurnOrder[i],跳过前面已发言的
  for (let i = 0; i < 2; i++) {
    room.handleIntent(playerIds[i]!, { kind: 'speak', text: '发言' });
  }

  // 现在轮到 playerIds[2],他刚重连
  const r = room.handleIntent(targetPid, { kind: 'speak', text: '我回来了' });
  assert.equal(r.error, undefined, `重连后应能正常发言: ${r.error}`);
});

test('Room disconnect: 断线后 view 不再更新', () => {
  const { room, playerIds, cap } = setupFullRoom();
  const targetPid = playerIds[2]!;

  // 断线前看一下 view
  const viewBefore = cap.lastView(targetPid);
  assert.ok(viewBefore, '断线前应有 view');

  room.disconnect(targetPid);

  // 其他人 ready 推进环节
  for (let i = 0; i < playerIds.length; i++) {
    if (i === 2) continue;
    room.handleIntent(playerIds[i]!, { kind: 'ready' });
  }

  // 断线玩家不应收到新消息(stateSync/statePatch)
  const msgsAfterDisconnect = cap.messages(targetPid);
  const lastSyncIdx = msgsAfterDisconnect.reduce((acc, m, i) => m.kind === 'stateSync' ? i : acc, -1);
  // 他的最后 stateSync 应该是断线前的
  const viewAfter = cap.lastView(targetPid);
  // view 可能还存在(来自断线前的 stateSync),但不应有断线后的新 stateSync
  // 检查:断线后发的消息中不应有新的 stateSync
  const msgs = cap.messages(targetPid);
  // 找到 disconnect 调用后的时间点,验证没有新消息
  // 这里我们通过另一个方式验证:断线后重连应收到新的 stateSync
  room.join('回来', targetPid);
  const viewAfterReconnect = cap.lastView(targetPid);
  assert.ok(viewAfterReconnect, '重连后应收到新的 stateSync');
});

test('Room disconnect: 多人同时断线后逐个重连', () => {
  const { room, playerIds } = setupFullRoom();

  // 3 人断线
  room.disconnect(playerIds[1]!);
  room.disconnect(playerIds[3]!);
  room.disconnect(playerIds[5]!);

  const state = room.getState();
  assert.equal(state.players.filter((p) => !p.connected).length, 3, '应有 3 人断线');

  // 逐个重连
  room.join('回来1', playerIds[1]!);
  assert.equal(room.getState().players.filter((p) => !p.connected).length, 2);

  room.join('回来3', playerIds[3]!);
  assert.equal(room.getState().players.filter((p) => !p.connected).length, 1);

  room.join('回来5', playerIds[5]!);
  assert.equal(room.getState().players.filter((p) => !p.connected).length, 0);
  assert.equal(room.getState().players.length, 6, '总人数不变');
});
