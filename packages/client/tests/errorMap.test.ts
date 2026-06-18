import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError, SERVER_ERROR_CODES } from '../src/lib/errorMap.js';

test('friendlyError: known codes return mapped Chinese messages', () => {
  assert.equal(friendlyError('room_full'), '房间已满');
  assert.equal(friendlyError('not_host'), '只有房主可以执行此操作');
  assert.equal(friendlyError('kicked'), '你已被房主移出房间');
  assert.equal(friendlyError('version_mismatch'), '游戏已更新,请刷新页面(Cmd/Ctrl+R)后再进入');
  assert.equal(friendlyError('not_your_turn'), '请等待轮到你再行动');
  assert.equal(friendlyError('clue_locked'), '该线索尚未解锁,先去对应地点搜证');
  assert.equal(friendlyError('search_limit_reached'), '你的搜证次数已用完');
  assert.equal(friendlyError('cannot_vote_self'), '不能投给自己');
  // 本次补齐的码抽样
  assert.equal(friendlyError('already_voted'), '你已经投过票了');
  assert.equal(friendlyError('rate_limited'), '操作过于频繁,请稍后再试');
  assert.equal(friendlyError('theory_too_long'), '推理内容过长(上限 2000 字)');
});

test('friendlyError: unknown code falls back to code string', () => {
  assert.equal(friendlyError('some_new_error'), 'some_new_error');
  assert.equal(friendlyError('future_code_xyz'), 'future_code_xyz');
});

test('friendlyError: no code but has message returns message', () => {
  assert.equal(friendlyError(undefined, '服务器内部错误'), '服务器内部错误');
});

test('friendlyError: no code no message returns default', () => {
  assert.equal(friendlyError(), '未知错误');
  assert.equal(friendlyError(undefined, undefined), '未知错误');
});

test('friendlyError: code takes priority over message', () => {
  assert.equal(friendlyError('room_full', 'ignored message'), '房间已满');
});

test('SERVER_ERROR_CODES: 无重复', () => {
  const set = new Set(SERVER_ERROR_CODES);
  assert.equal(set.size, SERVER_ERROR_CODES.length, '存在重复的错误码');
});

test('friendlyError: 每个已知错误码都有中文映射(防漏译)', () => {
  // 服务器新增 reject()/code: 时若忘记在 errorMap 加映射,这里会失败。
  // 缺译的码会被 friendlyError 回退返回原始 code。
  const missing = SERVER_ERROR_CODES.filter((code) => friendlyError(code) === code);
  assert.deepEqual(missing, [], `以下错误码缺少中文映射: ${missing.join(', ')}`);
});

test('friendlyError: 每个映射均为非空中文文案', () => {
  for (const code of SERVER_ERROR_CODES) {
    const result = friendlyError(code);
    assert.ok(result.length > 0, `${code} → 映射为空`);
    assert.notEqual(result, code, `${code} → 回退到原始 code`);
    assert.match(result, /[\u4e00-\u9fff]/, `${code} → 映射不含中文`);
  }
});

test('friendlyError: skill_required 动态前缀特判', () => {
  assert.equal(
    friendlyError('skill_required:medical'),
    '需要「medical」技能才能搜索此线索',
  );
});
