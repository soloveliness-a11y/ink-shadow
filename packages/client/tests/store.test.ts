/**
 * Store 消息处理单元测试。
 * 直接测试 handleServerMessage，mock getState/setState/exitKicked。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleServerMessage } from '../src/store/game.js';
import type { GameState } from '../src/store/game.js';

// ── Mock helpers ──

/** Minimal mutable state snapshot used by tests. */
function freshState(): GameState {
  return {
    connected: false,
    connectionStatus: 'disconnected',
    playerId: null,
    sessionToken: null,
    roomCode: null,
    nickname: null,
    view: null,
    events: [],
    privateMessages: [],
    dmNarratives: [],
    error: null,
    conn: null,
    seenPhaseKey: null,
    connect: () => {},
    disconnect: () => {},
    send: () => {},
    joinRoom: () => {},
  };
}

/**
 * Create a test harness with a mutable state ref and tracking arrays.
 * Mocks window.setTimeout and localStorage for Node.js environment.
 */
function createHarness() {
  const state = freshState();
  const kickedCalled: string[] = [];
  const setStateCalls: Partial<GameState>[] = [];

  // Mock window (handleServerMessage uses window.setTimeout)
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  globalThis.window = {
    setTimeout: (fn: () => void) => { fn(); return 0; },
  } as any;

  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
  } as any;

  const getState = () => state;
  const setState = (partial: any) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    Object.assign(state, patch);
    setStateCalls.push(patch);
  };
  const exitKicked = () => { kickedCalled.push('kicked'); };

  return { state, getState, setState, exitKicked, kickedCalled, setStateCalls, cleanup() {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  }};
}

// ── Tests ──

test('joined → sets playerId, sessionToken, connected', () => {
  const h = createHarness();
  try {
    h.state.roomCode = 'ABCD';
    h.state.nickname = 'Alice';
    handleServerMessage(
      { kind: 'joined', playerId: 'p1', sessionToken: 'tok1' },
      h.getState, h.setState, h.exitKicked,
    );
    assert.equal(h.state.playerId, 'p1');
    assert.equal(h.state.sessionToken, 'tok1');
    assert.equal(h.state.connected, true);
    assert.equal(h.state.error, null);
  } finally { h.cleanup(); }
});

test('stateSync → updates view and roomCode', () => {
  const h = createHarness();
  try {
    const mockView = {
      roomCode: 'XYZ1',
      status: 'playing',
      publicCharacters: [],
    } as any;
    handleServerMessage(
      { kind: 'stateSync', view: mockView },
      h.getState, h.setState, h.exitKicked,
    );
    assert.deepEqual(h.state.view, mockView);
    assert.equal(h.state.roomCode, 'XYZ1');
    assert.equal(h.state.error, null);
  } finally { h.cleanup(); }
});

test('event → appends to events array', () => {
  const h = createHarness();
  try {
    const ev = { type: 'speak', charId: 'c1', text: 'hello', ts: 1000 };
    handleServerMessage(
      { kind: 'event', event: ev as any },
      h.getState, h.setState, h.exitKicked,
    );
    assert.equal(h.state.events.length, 1);
    assert.equal(h.state.events[0].text, 'hello');
  } finally { h.cleanup(); }
});

test('event → respects MAX_EVENTS=200 boundary', () => {
  const h = createHarness();
  try {
    // Pre-fill 200 events
    h.state.events = Array.from({ length: 200 }, (_, i) => ({ type: 'speak', charId: 'c1', text: `msg${i}`, ts: i }));
    // Add one more
    handleServerMessage(
      { kind: 'event', event: { type: 'speak', charId: 'c1', text: 'overflow', ts: 999 } as any },
      h.getState, h.setState, h.exitKicked,
    );
    assert.equal(h.state.events.length, 200);
    assert.equal(h.state.events[0].text, 'msg1'); // oldest dropped
    assert.equal(h.state.events[199].text, 'overflow');
  } finally { h.cleanup(); }
});

test('privateMessage → appends to privateMessages', () => {
  const h = createHarness();
  try {
    handleServerMessage(
      { kind: 'privateMessage', fromCharId: 'c1', text: 'secret' },
      h.getState, h.setState, h.exitKicked,
    );
    assert.equal(h.state.privateMessages.length, 1);
    assert.equal(h.state.privateMessages[0].text, 'secret');
    assert.equal(h.state.privateMessages[0].fromCharId, 'c1');
  } finally { h.cleanup(); }
});

test('privateMessage → respects MAX_PRIVATE=100 boundary', () => {
  const h = createHarness();
  try {
    h.state.privateMessages = Array.from({ length: 100 }, (_, i) => ({
      fromCharId: 'c1', toCharId: 'c2', text: `pm${i}`, ts: i,
    }));
    handleServerMessage(
      { kind: 'privateMessage', fromCharId: 'c1', text: 'overflow' },
      h.getState, h.setState, h.exitKicked,
    );
    assert.equal(h.state.privateMessages.length, 100);
    assert.equal(h.state.privateMessages[0].text, 'pm1'); // oldest dropped
    assert.equal(h.state.privateMessages[99].text, 'overflow');
  } finally { h.cleanup(); }
});

test('dmNarrative → appends to dmNarratives', () => {
  const h = createHarness();
  try {
    handleServerMessage(
      { kind: 'dmNarrative', text: '夜幕降临...' },
      h.getState, h.setState, h.exitKicked,
    );
    assert.equal(h.state.dmNarratives.length, 1);
    assert.equal(h.state.dmNarratives[0].text, '夜幕降临...');
  } finally { h.cleanup(); }
});

test('dmNarrative → caps at 50 entries', () => {
  const h = createHarness();
  try {
    h.state.dmNarratives = Array.from({ length: 50 }, (_, i) => ({
      text: `n${i}`, ts: i,
    }));
    handleServerMessage(
      { kind: 'dmNarrative', text: 'overflow' },
      h.getState, h.setState, h.exitKicked,
    );
    assert.equal(h.state.dmNarratives.length, 50);
    assert.equal(h.state.dmNarratives[0].text, 'n1');
    assert.equal(h.state.dmNarratives[49].text, 'overflow');
  } finally { h.cleanup(); }
});

test('kicked → calls exitKicked', () => {
  const h = createHarness();
  try {
    handleServerMessage(
      { kind: 'kicked', reason: 'bye' },
      h.getState, h.setState, h.exitKicked,
    );
    assert.deepEqual(h.kickedCalled, ['kicked']);
  } finally { h.cleanup(); }
});

test('error with code=kicked → calls exitKicked', () => {
  const h = createHarness();
  try {
    handleServerMessage(
      { kind: 'error', code: 'kicked', message: 'removed' },
      h.getState, h.setState, h.exitKicked,
    );
    assert.deepEqual(h.kickedCalled, ['kicked']);
  } finally { h.cleanup(); }
});

test('error with known code → sets friendly error message', () => {
  const h = createHarness();
  try {
    handleServerMessage(
      { kind: 'error', code: 'room_full', message: 'room_full' },
      h.getState, h.setState, h.exitKicked,
    );
    assert.equal(h.state.error, '房间已满');
    assert.deepEqual(h.kickedCalled, []);
  } finally { h.cleanup(); }
});

test('error with unknown code + message → friendlyError returns message', () => {
  const h = createHarness();
  try {
    handleServerMessage(
      { kind: 'error', code: 'future_err', message: 'Something went wrong' },
      h.getState, h.setState, h.exitKicked,
    );
    // friendlyError: unknown code → returns code; but code is set, so fallback chain is code > message
    // Actually: code='future_err' is not in MAP, so MAP[code] is falsy → falls to `if (message) return message`
    assert.equal(h.state.error, 'Something went wrong');
    assert.deepEqual(h.kickedCalled, []);
  } finally { h.cleanup(); }
});

test('assigned → no-op (handled via stateSync)', () => {
  const h = createHarness();
  try {
    const before = { ...h.state };
    handleServerMessage(
      { kind: 'assigned', charId: 'c1' },
      h.getState, h.setState, h.exitKicked,
    );
    assert.equal(h.state.playerId, before.playerId);
    assert.equal(h.state.events.length, 0);
    assert.deepEqual(h.kickedCalled, []);
  } finally { h.cleanup(); }
});
