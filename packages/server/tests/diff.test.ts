import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffViews } from '../src/diff.js';

test('diffViews: 相同 view → 空 patches 和 removes', () => {
  const view = { roomCode: 'ABCD', status: 'playing', players: ['a', 'b'] };
  const { patches, removes } = diffViews(view, view);
  assert.deepEqual(patches, {});
  assert.deepEqual(removes, []);
});

test('diffViews: 新增字段 → patches 包含该字段', () => {
  const prev = { roomCode: 'ABCD' };
  const next = { roomCode: 'ABCD', status: 'playing' };
  const { patches, removes } = diffViews(prev, next);
  assert.deepEqual(patches, { '/status': 'playing' });
  assert.deepEqual(removes, []);
});

test('diffViews: 删除字段 → removes 包含该路径', () => {
  const prev = { roomCode: 'ABCD', status: 'playing' };
  const next = { roomCode: 'ABCD' };
  const { patches, removes } = diffViews(prev, next);
  assert.deepEqual(patches, {});
  assert.deepEqual(removes, ['/status']);
});

test('diffViews: 字段值变化 → patches 包含新值', () => {
  const prev = { roomCode: 'ABCD', status: 'lobby' };
  const next = { roomCode: 'ABCD', status: 'playing' };
  const { patches, removes } = diffViews(prev, next);
  assert.deepEqual(patches, { '/status': 'playing' });
  assert.deepEqual(removes, []);
});

test('diffViews: 嵌套对象变更 (self) → 二级 diff patches', () => {
  const prev = {
    self: { charId: 'c1', name: 'Alice', hp: 10 },
  };
  const next = {
    self: { charId: 'c1', name: 'Alice', hp: 8 },
  };
  const { patches, removes } = diffViews(prev as any, next as any);
  assert.deepEqual(patches, { '/self/hp': 8 });
  assert.deepEqual(removes, []);
});

test('diffViews: 嵌套对象新增子字段 → 二级 diff patches', () => {
  const prev = {
    currentPhase: { id: 'p1', title: '调查' },
  };
  const next = {
    currentPhase: { id: 'p1', title: '调查', instruction: '搜证阶段' },
  };
  const { patches, removes } = diffViews(prev as any, next as any);
  assert.deepEqual(patches, { '/currentPhase/instruction': '搜证阶段' });
  assert.deepEqual(removes, []);
});

test('diffViews: 嵌套对象删除子字段 → removes', () => {
  const prev = {
    phaseProgress: { actedCount: 2, totalRequired: 4, actedCharIds: ['c1', 'c2'] },
  };
  const next = {
    phaseProgress: { actedCount: 2, totalRequired: 4 },
  };
  const { patches, removes } = diffViews(prev as any, next as any);
  assert.deepEqual(patches, {});
  assert.deepEqual(removes, ['/phaseProgress/actedCharIds']);
});

test('diffViews: 数组字段变更 → 全量替换', () => {
  const prev = { log: [{ text: 'a' }] };
  const next = { log: [{ text: 'a' }, { text: 'b' }] };
  const { patches, removes } = diffViews(prev as any, next as any);
  assert.equal(Object.keys(patches).length, 1);
  assert.deepEqual(patches['/log'], [{ text: 'a' }, { text: 'b' }]);
  assert.deepEqual(removes, []);
});

test('diffViews: players 数组变更 → 全量替换', () => {
  const prev = { players: ['a', 'b'] };
  const next = { players: ['a', 'b', 'c'] };
  const { patches, removes } = diffViews(prev as any, next as any);
  assert.deepEqual(patches['/players'], ['a', 'b', 'c']);
  assert.deepEqual(removes, []);
});

test('diffViews: 多字段同时变更', () => {
  const prev = { roomCode: 'ABCD', status: 'lobby', players: ['a'] };
  const next = { roomCode: 'ABCD', status: 'playing', players: ['a', 'b'], round: 1 };
  const { patches, removes } = diffViews(prev, next);
  assert.equal(patches['/status'], 'playing');
  assert.deepEqual(patches['/players'], ['a', 'b']);
  assert.equal(patches['/round'], 1);
  assert.deepEqual(removes, []);
});

test('diffViews: 原始类型 null → 有值 → patches', () => {
  const prev = { error: 'old error' };
  const next = { error: null };
  const { patches, removes } = diffViews(prev, next);
  assert.deepEqual(patches, {});
  assert.deepEqual(removes, ['/error']);
});

test('diffViews: prev 有值, next 为 undefined → removes', () => {
  const prev = { a: 1, b: 2 };
  const next = { a: 1 } as Record<string, unknown>;
  (next as any).b = undefined;
  const { patches, removes } = diffViews(prev, next);
  assert.deepEqual(patches, {});
  assert.deepEqual(removes, ['/b']);
});

test('diffViews: 两个空对象 → 空结果', () => {
  const { patches, removes } = diffViews({}, {});
  assert.deepEqual(patches, {});
  assert.deepEqual(removes, []);
});
