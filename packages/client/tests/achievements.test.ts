import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordGame, getStats, getAllAchievements, type GameRecord } from '../src/lib/achievements.js';

// ── Mock localStorage ──

let store: Record<string, string>;

function mockLocalStorage() {
  store = {};
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as any;
}

function makeRecord(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    scriptId: 's1',
    scriptTitle: '午夜凶铃',
    charName: '侦探',
    myVoteTarget: 'suspect1',
    topVotedTarget: 'suspect1',
    myCluesFound: 3,
    totalRevealedClues: 5,
    isCorrectVote: true,
    playedAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ──

test('recordGame: 首局解锁 first_game', () => {
  mockLocalStorage();
  const unlocked = recordGame(makeRecord());
  assert.ok(unlocked.includes('first_game'));
});

test('recordGame: 首次正确解锁 first_correct', () => {
  mockLocalStorage();
  const unlocked = recordGame(makeRecord({ isCorrectVote: true }));
  assert.ok(unlocked.includes('first_correct'));
});

test('recordGame: 错误投票不解锁 first_correct', () => {
  mockLocalStorage();
  const unlocked = recordGame(makeRecord({ isCorrectVote: false }));
  assert.ok(!unlocked.includes('first_correct'));
});

test('recordGame: 5局解锁 five_games', () => {
  mockLocalStorage();
  for (let i = 0; i < 4; i++) recordGame(makeRecord());
  const unlocked = recordGame(makeRecord());
  assert.ok(unlocked.includes('five_games'));
});

test('recordGame: 10局解锁 ten_games', () => {
  mockLocalStorage();
  for (let i = 0; i < 9; i++) recordGame(makeRecord());
  const unlocked = recordGame(makeRecord());
  assert.ok(unlocked.includes('ten_games'));
});

test('recordGame: 单局5+线索解锁 clue_hunter', () => {
  mockLocalStorage();
  const unlocked = recordGame(makeRecord({ myCluesFound: 6 }));
  assert.ok(unlocked.includes('clue_hunter'));
});

test('recordGame: 单局找到全部线索解锁 all_clues', () => {
  mockLocalStorage();
  const unlocked = recordGame(makeRecord({ myCluesFound: 5, totalRevealedClues: 5 }));
  assert.ok(unlocked.includes('all_clues'));
});

test('recordGame: 连续3次正确解锁 three_streak', () => {
  mockLocalStorage();
  recordGame(makeRecord({ isCorrectVote: true }));
  recordGame(makeRecord({ isCorrectVote: true }));
  const unlocked = recordGame(makeRecord({ isCorrectVote: true }));
  assert.ok(unlocked.includes('three_streak'));
});

test('recordGame: 连续3次中断不解锁 three_streak', () => {
  mockLocalStorage();
  recordGame(makeRecord({ isCorrectVote: true }));
  recordGame(makeRecord({ isCorrectVote: false }));
  const unlocked = recordGame(makeRecord({ isCorrectVote: true }));
  assert.ok(!unlocked.includes('three_streak'));
});

test('recordGame: 3个不同剧本解锁 three_scripts', () => {
  mockLocalStorage();
  recordGame(makeRecord({ scriptId: 's1' }));
  recordGame(makeRecord({ scriptId: 's2' }));
  const unlocked = recordGame(makeRecord({ scriptId: 's3' }));
  assert.ok(unlocked.includes('three_scripts'));
});

test('recordGame: 正确率>60%(5局+)解锁 detective', () => {
  mockLocalStorage();
  // 4 correct, 1 wrong = 80%
  for (let i = 0; i < 4; i++) recordGame(makeRecord({ isCorrectVote: true }));
  const unlocked = recordGame(makeRecord({ isCorrectVote: false }));
  // detective 需要 >0.6, 4/5 = 0.8 → 解锁
  assert.ok(unlocked.includes('detective'));
});

test('recordGame: 累计5次正确解锁 five_correct', () => {
  mockLocalStorage();
  for (let i = 0; i < 4; i++) recordGame(makeRecord({ isCorrectVote: true }));
  const unlocked = recordGame(makeRecord({ isCorrectVote: true }));
  assert.ok(unlocked.includes('five_correct'));
});

test('recordGame: 记录上限50局', () => {
  mockLocalStorage();
  for (let i = 0; i < 60; i++) recordGame(makeRecord());
  const stats = getStats();
  assert.equal(stats.totalGames, 50);
});

test('getStats: 空状态返回零值', () => {
  mockLocalStorage();
  const stats = getStats();
  assert.equal(stats.totalGames, 0);
  assert.equal(stats.correctVotes, 0);
  assert.equal(stats.totalCluesFound, 0);
  assert.equal(stats.winRate, 0);
  assert.deepEqual(stats.unlocked, []);
  assert.deepEqual(stats.records, []);
});

test('getStats: 统计正确', () => {
  mockLocalStorage();
  recordGame(makeRecord({ isCorrectVote: true, myCluesFound: 3 }));
  recordGame(makeRecord({ isCorrectVote: false, myCluesFound: 2 }));
  recordGame(makeRecord({ isCorrectVote: true, myCluesFound: 1 }));
  const stats = getStats();
  assert.equal(stats.totalGames, 3);
  assert.equal(stats.correctVotes, 2);
  assert.equal(stats.totalCluesFound, 6);
  assert.equal(stats.winRate, 67);
});

test('getAllAchievements: 返回所有成就定义', () => {
  const all = getAllAchievements([]);
  assert.ok(all.length >= 10);
  assert.ok(all.every(a => a.id && a.name && a.desc && a.icon));
});

test('getAllAchievements: 正确标记已解锁', () => {
  const all = getAllAchievements(['first_game', 'first_correct']);
  const firstGame = all.find(a => a.id === 'first_game')!;
  const firstCorrect = all.find(a => a.id === 'first_correct')!;
  const fiveGames = all.find(a => a.id === 'five_games')!;
  assert.equal(firstGame.unlocked, true);
  assert.equal(firstCorrect.unlocked, true);
  assert.equal(fiveGames.unlocked, false);
});

test('recordGame: 已解锁成就不重复返回', () => {
  mockLocalStorage();
  recordGame(makeRecord());
  const second = recordGame(makeRecord());
  assert.ok(!second.includes('first_game'));
});
