/**
 * regression.test.ts —— 守护本轮深度优化修复的专项回归测试。
 *
 * 覆盖的修复:
 *  - B1: tieCharIds 平票残留 → 进入非决胜环节时清理
 *  - B4: Room.destroy() 清理定时器 + PhaseEngine.dispose()
 *  - R2: private(技能门控)线索计入搜证次数限制
 *  - B2: reveal 阶段未 finished 时 theories 只下发自己的
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhaseEngine } from '../src/engine/PhaseEngine.js';
import { Room } from '../src/room/Room.js';
import type { Script, RuntimeState, GameEvent, ServerMessage, ClientStateView } from '@mmg/schema';

// ─── 共用 mock ───

function makeBus(events: string[] = []) {
  return {
    broadcastState: () => {},
    event: (evt: Omit<GameEvent, 'ts'>) => events.push(evt.type),
    sendToChar: () => {},
  };
}

function makeState(opts: { players?: { playerId: string; charId: string; nickname: string }[]; phaseId?: string } = {}): RuntimeState {
  return {
    roomCode: 'TEST',
    scriptId: '_mock',
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

// ─── B1: tieCharIds 残留清理 ───

test('B1: 进入非决胜投票环节时,残留的 tieCharIds 被清空', () => {
  // 构造剧本:决胜轮 p_tiebreak(restrictVoteTargets='tied') 后跟普通投票 p_vote2
  // flow edges 让 p_vote2 从 p_tiebreak 可达(无条件边)
  const script: Script = {
    id: '_mock', meta: { id: '_mock', title: 't', players: 3, duration: 60, difficulty: 1, themes: [], tags: [] },
    characters: [
      { id: 'c_wife', name: '妻', gender: 'female' as const, publicProfile: '', visual: {} } as never,
      { id: 'c_butler', name: '仆', gender: 'male' as const, publicProfile: '', visual: {} } as never,
    ],
    scenes: [], clues: [],
    flow: { entry: 'p_tiebreak', edges: [{ from: 'p_tiebreak', to: 'p_vote2' }] },
    phases: [
      {
        id: 'p_tiebreak', kind: 'vote', title: '决胜', instruction: '', participants: 'all',
        allowedActions: ['castVote'], restrictVoteTargets: 'tied',
        exit: { kind: 'hostAdvance' },
      },
      {
        id: 'p_vote2', kind: 'vote', title: '普通投票', instruction: '', participants: 'all',
        allowedActions: ['castVote'],
        exit: { kind: 'voteComplete' },
      },
    ],
  } as unknown as Script;

  const state = makeState({ phaseId: 'p_tiebreak' });
  // 模拟上一轮平票写入的残留
  state.tieCharIds = ['c_wife', 'c_butler'];
  const events: string[] = [];
  const engine = new PhaseEngine(script, state, makeBus(events));

  // 强制进入 p_tiebreak(触发 enter)
  engine.start();
  // tieCharIds 仍在(决胜环节需读取)
  assert.deepEqual(state.tieCharIds, ['c_wife', 'c_butler'], '决胜环节期间 tieCharIds 应保留');

  // 推进到 p_vote2(非决胜)→ enter() 应清空
  engine.forceAdvance();
  assert.equal(state.tieCharIds, undefined, '进入非决胜环节后 tieCharIds 应被清空');
});

// ─── B4: Room.destroy / PhaseEngine.dispose 不抛错 ───

test('B4: Room.destroy() 可安全调用,不抛错', () => {
  const send = () => {};
  const room = new Room('DESTROY', send);
  // destroy 在未初始化剧本的状态下也应安全
  assert.doesNotThrow(() => room.destroy());
});

test('B4: PhaseEngine.dispose() 清理 timer 后不抛错', () => {
  const script = {
    id: '_mock', meta: { id: '_mock', title: 't', players: 3, duration: 60, difficulty: 1, themes: [], tags: [] },
    characters: [], scenes: [], clues: [],
    flow: { entry: 'p_timer', edges: [] },
    phases: [{
      id: 'p_timer', kind: 'briefing', title: '计时', instruction: '', participants: 'all',
      allowedActions: [], exit: { kind: 'timer', timerSec: 30 },
    }],
  } as unknown as Script;
  const state = makeState({ phaseId: 'p_timer' });
  const engine = new PhaseEngine(script, state, makeBus());
  engine.start(); // 启动计时器
  assert.doesNotThrow(() => engine.dispose());
});

// ─── R2: private 线索计入搜证次数限制 ───

test('R2: 有技能的角色搜 private 线索受 maxSearches 限制', () => {
  // 两条不同的 private 线索,maxSearches=1 → 第 2 条应触发 search_limit_reached
  const script: Script = {
    id: '_mock', meta: { id: '_mock', title: 't', players: 3, duration: 60, difficulty: 1, themes: [], tags: [] },
    characters: [{ id: 'c_doctor', name: '医生', gender: 'male' as const, publicProfile: '', visual: {}, skills: ['medical'] } as never],
    scenes: [],
    clues: [
      { id: 'c_secret1', title: '秘密1', visibility: 'private' as const, requiredSkill: 'medical', content: 'x', sceneId: 's1' } as never,
      { id: 'c_secret2', title: '秘密2', visibility: 'private' as const, requiredSkill: 'medical', content: 'y', sceneId: 's1' } as never,
    ],
    flow: { entry: 'p_search', edges: [] },
    phases: [{
      id: 'p_search', kind: 'free', title: '搜证', instruction: '', participants: 'all',
      allowedActions: ['searchClue'], maxSearches: 1, maxRounds: 0,
      exit: { kind: 'hostAdvance' },
    }],
  } as unknown as Script;

  const state = makeState({ phaseId: 'p_search', players: [{ playerId: 'p3', charId: 'c_doctor', nickname: '医' }] });
  state.flags['unlocked:c_secret1'] = true;
  state.flags['unlocked:c_secret2'] = true;
  const engine = new PhaseEngine(script, state, makeBus());
  engine.start();

  // 第 1 条 private 线索:成功(maxSearches 从 0→1)
  const r1 = engine.handleAction('c_doctor', { kind: 'searchClue', clueId: 'c_secret1' });
  assert.equal(r1.error, undefined, '第 1 次搜 private 线索应成功');

  // 第 2 条不同的 private 线索:应被 maxSearches=1 拒绝(R2 修复前 private 绕过此限制)
  const r2 = engine.handleAction('c_doctor', { kind: 'searchClue', clueId: 'c_secret2' });
  assert.equal(r2.error, 'search_limit_reached', '搜第 2 条 private 线索应触发 search_limit_reached');
});

// ─── B2: reveal 阶段 theories 脱敏 ───

test('B2: reveal 阶段(status=playing)只下发自己的 theory;finished 后全量', async () => {
  const { loadScript } = await import('../src/loader.js');
  const { fileURLToPath } = await import('node:url');
  const { buildView } = await import('../src/view.js');
  const path = fileURLToPath(new URL('../../../content/mock', import.meta.url));
  const { script } = loadScript(path);

  const charIds = script.characters.filter((c) => !c.isVictim).map((c) => c.id);
  const state = makeState({ phaseId: script.phases.find((p) => p.kind === 'reveal')?.id ?? '' });
  state.players = charIds.map((charId, i) => ({
    playerId: `p${i}`, charId, nickname: `P${i}`, connected: true, ready: true, isHost: i === 0,
  }));
  // 两个角色各提交了推理
  state.theories = { [charIds[0]!]: '推理A', [charIds[1]!]: '推理B' };

  // status=playing + reveal phase → 只看到自己的
  state.status = 'playing';
  const viewReveal = buildView(script, state, 'p0', []) as ClientStateView;
  if (viewReveal.ending?.theories) {
    const keys = Object.keys(viewReveal.ending.theories);
    assert.ok(keys.length === 1 && keys[0] === charIds[0], `reveal 阶段应只下发自己的推理,实际 keys=${keys.join(',')}`);
  }

  // status=finished → 全量
  state.status = 'finished';
  const viewFinished = buildView(script, state, 'p0', []) as ClientStateView;
  if (viewFinished.ending?.theories) {
    const keys = Object.keys(viewFinished.ending.theories);
    assert.ok(keys.length === 2, `finished 后应下发全部推理,实际 ${keys.length} 条`);
  }
});
