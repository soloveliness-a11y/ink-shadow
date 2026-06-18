/**
 * view-parity 测试 —— 守护 buildViewBatch 与逐个 buildView 的字节等价性。
 *
 * buildViewBatch 是 broadcastState 的性能优化路径:公共部分只算一次。
 * 本测试断言:对任意状态,批量产出的每个玩家视图与逐个调用 buildView 产出**深度相等**。
 * 一旦 buildView / buildSharedParts 的字段拼装出现偏差,这里会立刻失败。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../src/loader.js';
import { buildView, buildViewBatch } from '../src/view.js';
import type { RuntimeState } from '@mmg/schema';
import { fileURLToPath } from 'node:url';

const mockScriptPath = fileURLToPath(new URL('../../../content/mock', import.meta.url));
const { script: mockScript } = loadScript(mockScriptPath);
const playableIds = mockScript.characters.filter((c) => !c.isVictim).map((c) => c.id);

/** 构造一个 6 人开局、处于指定 phase 的 RuntimeState。 */
function makeState(currentPhaseId: string, opts: {
  votes?: Record<string, string>;
  revealedClues?: string[];
  acquired?: Record<string, string[]>;
  flags?: Record<string, boolean>;
} = {}): RuntimeState {
  return {
    roomCode: 'TEST01',
    scriptId: mockScript.meta.id,
    status: 'playing',
    players: playableIds.map((charId, i) => ({
      playerId: `p${i + 1}`,
      charId,
      nickname: `玩家${i + 1}`,
      connected: i !== 5, // p6 掉线,覆盖「只给在线玩家发」的分支
      ready: true,
      isHost: i === 0,
    })),
    currentPhaseId,
    phaseRuntime: { phaseId: currentPhaseId, startedAt: Date.now(), actedCharIds: [] },
    revealedClues: opts.revealedClues ?? [],
    acquiredClues: opts.acquired ?? {},
    votes: opts.votes ?? {},
    theories: {},
    flags: opts.flags ?? {},
    teams: {},
    resources: {},
    counters: {},
    log: [],
  };
}

const SCRIPT_METAS = [mockScript.meta];

test('parity: briefing 阶段批量视图 == 逐个视图', () => {
  const state = makeState('p_brief');
  const onlineIds = state.players.filter((p) => p.connected).map((p) => p.playerId);
  const batch = buildViewBatch(mockScript, state, onlineIds, SCRIPT_METAS);
  for (const { playerId, view } of batch) {
    const single = buildView(mockScript, state, playerId, SCRIPT_METAS);
    assert.deepEqual(view, single, `玩家 ${playerId} 视图不一致`);
  }
});

test('parity: 投票阶段(含 votesPublic 裁剪)批量视图 == 逐个视图', () => {
  const state = makeState('p_vote', {
    // 每人投不同目标,触发 votesPublic 的 self/other 裁剪差异
    votes: {
      [playableIds[0]!]: playableIds[1]!,
      [playableIds[1]!]: playableIds[2]!,
      [playableIds[2]!]: playableIds[0]!,
    },
  });
  const onlineIds = state.players.filter((p) => p.connected).map((p) => p.playerId);
  const batch = buildViewBatch(mockScript, state, onlineIds, SCRIPT_METAS);
  assert.ok(batch.length > 0);
  for (const { playerId, view } of batch) {
    const single = buildView(mockScript, state, playerId, SCRIPT_METAS);
    assert.deepEqual(view, single, `玩家 ${playerId} 投票视图不一致`);
  }
});

test('parity: 搜证阶段(含 acquiredClues + sceneSearchProgress)批量视图 == 逐个视图', () => {
  // 给部分玩家分配已获取线索,触发 anyoneAcquired 并集与 sceneSearchProgress
  const acquired: Record<string, string[]> = {};
  const clueIds = mockScript.clues.slice(0, 3).map((c) => c.id);
  acquired[playableIds[0]!] = [clueIds[0]!];
  acquired[playableIds[1]!] = [clueIds[1]!];
  const flags: Record<string, boolean> = {};
  for (const cid of clueIds) flags[`unlocked:${cid}`] = true;

  const state = makeState('p_search1', { acquired, flags });
  const onlineIds = state.players.filter((p) => p.connected).map((p) => p.playerId);
  const batch = buildViewBatch(mockScript, state, onlineIds, SCRIPT_METAS);
  for (const { playerId, view } of batch) {
    const single = buildView(mockScript, state, playerId, SCRIPT_METAS);
    assert.deepEqual(view, single, `玩家 ${playerId} 搜证视图不一致`);
  }
});

test('parity: 公开线索后批量视图 == 逐个视图', () => {
  const clueIds = mockScript.clues.slice(0, 2).map((c) => c.id);
  const state = makeState('p_search1', { revealedClues: clueIds });
  const onlineIds = state.players.filter((p) => p.connected).map((p) => p.playerId);
  const batch = buildViewBatch(mockScript, state, onlineIds, SCRIPT_METAS);
  for (const { playerId, view } of batch) {
    const single = buildView(mockScript, state, playerId, SCRIPT_METAS);
    assert.deepEqual(view, single, `玩家 ${playerId} 公开线索视图不一致`);
  }
});

test('parity: 无剧本(lobby)批量视图 == 逐个视图', () => {
  const state: RuntimeState = {
    roomCode: 'TEST02',
    scriptId: '',
    status: 'lobby',
    players: [
      { playerId: 'p1', nickname: '玩家1', connected: true, ready: false, isHost: true },
      { playerId: 'p2', nickname: '玩家2', connected: true, ready: false, isHost: false },
    ],
    currentPhaseId: '',
    phaseRuntime: { phaseId: '', startedAt: Date.now(), actedCharIds: [] },
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
  const batch = buildViewBatch(null, state, ['p1', 'p2'], SCRIPT_METAS);
  for (const { playerId, view } of batch) {
    const single = buildView(null, state, playerId, SCRIPT_METAS);
    assert.deepEqual(view, single, `玩家 ${playerId} lobby 视图不一致`);
  }
});

test('parity: buildViewBatch 入参顺序与输出顺序一致', () => {
  const state = makeState('p_brief');
  const ids = ['p2', 'p1', 'p3', 'p4', 'p5']; // 乱序
  const batch = buildViewBatch(mockScript, state, ids, SCRIPT_METAS);
  assert.deepEqual(batch.map((b) => b.playerId), ids, '输出顺序应跟随入参顺序');
});
