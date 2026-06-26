import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setByPath, deleteByPath } from '../src/lib/patch.js';

// ── setByPath ──

test('setByPath: 设置顶层字段', () => {
  const obj: Record<string, unknown> = {};
  setByPath(obj, '/status', 'playing');
  assert.equal(obj['status'], 'playing');
});

test('setByPath: 设置嵌套值', () => {
  const obj = { phaseProgress: { actedCount: 0 } };
  setByPath(obj as any, '/phaseProgress/actedCount', 3);
  assert.equal((obj as any).phaseProgress.actedCount, 3);
});

test('setByPath: 创建中间对象', () => {
  const obj: Record<string, unknown> = {};
  setByPath(obj, '/a/b/c', 'deep');
  assert.equal((obj as any).a.b.c, 'deep');
});

test('setByPath: 覆盖已有值', () => {
  const obj = { x: 1 };
  setByPath(obj as any, '/x', 2);
  assert.equal(obj.x, 2);
});

test('setByPath: 空路径 → 无操作', () => {
  const obj = { a: 1 };
  setByPath(obj as any, '', 99);
  assert.equal(obj.a, 1);
});

test('setByPath: 设置数组值', () => {
  const obj = { players: ['a'] };
  setByPath(obj as any, '/players', ['a', 'b', 'c']);
  assert.deepEqual(obj.players, ['a', 'b', 'c']);
});

test('setByPath: 中间路径为 null 时自动创建对象', () => {
  const obj: Record<string, unknown> = { nested: null };
  setByPath(obj, '/nested/child', 'val');
  assert.equal((obj['nested'] as any).child, 'val');
});

// ── deleteByPath ──

test('deleteByPath: 删除顶层字段', () => {
  const obj: Record<string, unknown> = { a: 1, b: 2 };
  deleteByPath(obj, '/a');
  assert.equal(obj['a'], undefined);
  assert.equal(obj['b'], 2);
});

test('deleteByPath: 删除嵌套字段', () => {
  const obj = { phaseProgress: { actedCount: 3, totalRequired: 4 } };
  deleteByPath(obj as any, '/phaseProgress/actedCount');
  assert.equal((obj as any).phaseProgress.actedCount, undefined);
  assert.equal((obj as any).phaseProgress.totalRequired, 4);
});

test('deleteByPath: 路径不存在 → 无操作', () => {
  const obj: Record<string, unknown> = { a: 1 };
  deleteByPath(obj, '/nonexistent');
  assert.equal(obj['a'], 1);
});

test('deleteByPath: 中间路径不存在 → 无操作', () => {
  const obj: Record<string, unknown> = { a: 1 };
  deleteByPath(obj, '/x/y/z');
  assert.equal(obj['a'], 1);
});

test('deleteByPath: 空路径 → 无操作', () => {
  const obj: Record<string, unknown> = { a: 1 };
  deleteByPath(obj, '');
  assert.equal(obj['a'], 1);
});

test('deleteByPath: 删除后对象仍存在', () => {
  const obj = { parent: { child: 1, other: 2 } };
  deleteByPath(obj as any, '/parent/child');
  assert.ok('parent' in obj);
  assert.equal((obj as any).parent.other, 2);
});
