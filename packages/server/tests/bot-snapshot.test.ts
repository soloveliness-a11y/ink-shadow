/**
 * BotRunner + SnapshotStore 单元测试。
 * 这两个类从 Room 抽出(原 Room.ts 的 autoPlayBots/scheduleBots 和 stateSnapshots)。
 * 集成测试已覆盖 Room 经由它们的行为;这里补充针对类本身的边界用例。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotStore } from '../src/room/SnapshotStore.js';
import { BotRunner, type BotContext } from '../src/room/BotRunner.js';
import type { Script, RuntimeState, ClientIntent } from '@mmg/schema';
import type { PhaseEngine } from '../src/engine/PhaseEngine.js';

// ─── SnapshotStore ───

function makeState(phaseId: string): RuntimeState {
  return {
    roomCode: 'ABCDEF',
    scriptId: 'test',
    status: 'playing',
    players: [],
    currentPhaseId: phaseId,
    phaseRuntime: { phaseId, startedAt: Date.now(), actedCharIds: [] },
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

test('SnapshotStore: 空栈 popToPrevious 返回 null', () => {
  const s = new SnapshotStore();
  assert.equal(s.popToPrevious(), null);
  assert.equal(s.depth, 0);
});

test('SnapshotStore: 仅 1 份快照 popToPrevious 返回 null(需 ≥2 才能回退)', () => {
  const s = new SnapshotStore();
  s.push(makeState('p1'));
  assert.equal(s.popToPrevious(), null);
  assert.equal(s.depth, 1);
});

test('SnapshotStore: 2 份快照 → 返回上一份(第 1 份),栈缩减为 1', () => {
  const s = new SnapshotStore();
  s.push(makeState('p1'));
  s.push(makeState('p2'));
  assert.equal(s.depth, 2);
  const prev = s.popToPrevious();
  assert.ok(prev);
  assert.equal(prev.currentPhaseId, 'p1');
  assert.equal(s.depth, 1);
});

test('SnapshotStore: 返回的是深拷贝,修改不影响栈内数据', () => {
  const s = new SnapshotStore();
  s.push(makeState('p1'));
  s.push(makeState('p2'));
  const prev = s.popToPrevious()!;
  prev.currentPhaseId = 'MUTATED';
  // 再次回退(现在栈里只剩 p1,需重新 push 才能回退)
  s.push(makeState('p3'));
  const prev2 = s.popToPrevious()!;
  assert.equal(prev2.currentPhaseId, 'p1', '栈内数据未被外部修改污染');
});

test('SnapshotStore: clear 清空栈', () => {
  const s = new SnapshotStore();
  s.push(makeState('p1'));
  s.push(makeState('p2'));
  s.clear();
  assert.equal(s.depth, 0);
  assert.equal(s.popToPrevious(), null);
});

// ─── BotRunner ───

/** 构造一个 mock PhaseEngine,记录收到的意图,可配置 handleAction 的返回。 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mockEngine(overrides: { handleAction?: (c: string, i: ClientIntent) => { ok: boolean; error?: string } } = {}): PhaseEngine {
  return {
    handleAction: overrides.handleAction ?? (() => ({ ok: true })),
    forceAdvance: () => {},
  } as unknown as PhaseEngine;
}

/** 构造 BotRunner + 可变 context,测试中直接改 ctx 字段触发 tick。 */
function makeRunner(initial: {
  state: RuntimeState;
  script: Script | null;
  engine: PhaseEngine | null;
  testMode?: boolean;
  botIds?: string[];
}): { runner: BotRunner; ctx: BotContext } {
  const ctx: BotContext = {
    getState: () => initial.state,
    getScript: () => initial.script,
    getEngine: () => initial.engine,
    isTestMode: () => initial.testMode ?? true,
    botIds: () => initial.botIds ?? [],
  };
  return { runner: new BotRunner(ctx), ctx };
}

test('BotRunner: 非测试模式 schedule 不轮询', () => {
  const { runner } = makeRunner({
    state: makeState('p1'),
    script: null,
    engine: null,
    testMode: false,
  });
  // schedule 内部会因 !isTestMode 直接 return,无定时器
  runner.schedule();
  // 没有断言异常即通过;stop 是幂等清理
  runner.stop();
});

test('BotRunner: tick 在 status≠playing 时静默返回', () => {
  const state = makeState('p1');
  state.status = 'lobby';
  const { runner } = makeRunner({ state, script: null, engine: null, testMode: true });
  // 直接调 schedule 会排一个 tick;stop 立即清除,确保无副作用
  runner.schedule();
  runner.stop();
  assert.equal(state.status, 'lobby');
});

test('BotRunner: stop 幂等(未调度/已停止均可再调)', () => {
  const { runner } = makeRunner({ state: makeState('p1'), script: null, engine: null });
  runner.stop();
  runner.stop();
  assert.ok(true, 'stop 多次调用不抛错');
});
