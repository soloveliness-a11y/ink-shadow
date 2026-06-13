import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError } from '../src/lib/errorMap.js';

test('friendlyError: known codes return mapped Chinese messages', () => {
  assert.equal(friendlyError('room_full'), '房间已满');
  assert.equal(friendlyError('not_host'), '只有房主可以执行此操作');
  assert.equal(friendlyError('kicked'), '你已被房主移出房间');
  assert.equal(friendlyError('version_mismatch'), '游戏已更新,请刷新页面(Cmd/Ctrl+R)后再进入');
  assert.equal(friendlyError('not_your_turn'), '请等待轮到你再行动');
  assert.equal(friendlyError('clue_locked'), '该线索尚未解锁,先去对应地点搜证');
  assert.equal(friendlyError('search_limit_reached'), '你的搜证次数已用完');
  assert.equal(friendlyError('cannot_vote_self'), '不能投给自己');
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

test('friendlyError: all mapped codes produce non-empty friendly strings', () => {
  const codes = [
    'no_active_phase', 'action_not_allowed', 'not_participant',
    'not_your_turn', 'clue_not_found', 'already_acquired', 'clue_private',
    'clue_locked', 'clue_taken', 'cannot_search_own_scene',
    'search_limit_reached', 'clue_not_owned', 'already_revealed',
    'target_not_found', 'cannot_vote_self', 'cannot_vote_victim',
    'not_host', 'not_in_lobby', 'no_script_selected', 'no_script',
    'no_script_provider', 'script_not_found', 'room_not_joinable',
    'room_full', 'no_char', 'no_pending_advance', 'no_snapshot',
    'not_test_mode', 'no_scripts_available', 'char_taken',
    'player_not_found', 'char_not_found', 'already_assigned',
    'not_in_assigning', 'version_mismatch', 'kicked',
    'kick_not_allowed', 'cannot_kick_self',
  ];
  for (const code of codes) {
    const result = friendlyError(code);
    assert.ok(result.length > 0, `${code} → empty`);
    assert.ok(result !== code, `${code} → not mapped (returned raw code)`);
  }
});
