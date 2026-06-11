import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sep } from 'node:path';
import { safeResolve, resolveDir } from '../src/static.js';

const base = '/srv/content';

test('safeResolve: 正常子路径 → 解析到 base 内', () => {
  const r = safeResolve(base, '/_mock/assets/cover.png');
  assert.ok(r && r.startsWith(base + sep), `应在 base 内: ${r}`);
  assert.ok(r!.endsWith(`assets${sep}cover.png`));
});

test('safeResolve: 根("/") → base 本身', () => {
  assert.equal(safeResolve(base, '/'), base);
});

test('safeResolve: 明文 .. 穿越 → null', () => {
  assert.equal(safeResolve(base, '/../../etc/passwd'), null);
});

test('safeResolve: 编码 %2e%2e 穿越 → null', () => {
  assert.equal(safeResolve(base, '/%2e%2e/%2e%2e/etc/passwd'), null);
});

test('safeResolve: 编码斜杠 ..%2f 穿越 → null', () => {
  assert.equal(safeResolve(base, '/..%2f..%2fetc/passwd'), null);
});

test('safeResolve: 非法百分号编码 → null', () => {
  assert.equal(safeResolve(base, '/file%2'), null);
});

test('resolveDir: 绝对路径原样返回', () => {
  assert.equal(resolveDir('/var/data/content', 'file:///x/y/index.ts'), '/var/data/content');
});

test('resolveDir: 相对路径相对 baseUrl 解析', () => {
  const r = resolveDir('../../content', 'file:///srv/app/src/index.ts');
  assert.equal(r, '/srv/content');
});
