import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScript } from '../src/index.js';

const mockUrl = new URL('../../../content/mock/script.json', import.meta.url);
const loadMock = (): unknown => JSON.parse(readFileSync(mockUrl, 'utf8'));

test('mock 剧本包通过结构 + 自洽校验,零 error 零 warn', () => {
  const result = validateScript(loadMock());
  const errors = result.issues.filter((i) => i.level === 'error');
  const warns = result.issues.filter((i) => i.level === 'warn' && i.code !== 'balance');
  assert.deepEqual(errors, [], `不应有 error:\n${JSON.stringify(errors, null, 2)}`);
  assert.deepEqual(warns, [], `不应有 warn(除 balance):\n${JSON.stringify(warns, null, 2)}`);
  assert.equal(result.ok, true);
});

test('抹掉凶手 → 校验器报 solve error(证明校验真的在工作)', () => {
  const raw = loadMock() as { characters: Array<{ isMurderer: boolean }> };
  raw.characters = raw.characters.map((c) => ({ ...c, isMurderer: false }));
  const result = validateScript(raw);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'solve'), '应报告 solve 类错误');
});

test('制造悬空引用(投票指向不存在的角色)→ 报 ref error', () => {
  const raw = loadMock() as { flow: { edges: Array<Record<string, unknown>> } };
  raw.flow.edges.push({ from: 'p_vote', to: 'p_end_good', condition: { kind: 'voteResult', equalsCharId: 'c_ghost' } });
  const result = validateScript(raw);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'ref'), '应报告 ref 类错误');
});

test('破坏 DAG(终局不可达)→ 报 flow error', () => {
  const raw = loadMock() as { flow: { edges: Array<{ to: string }> } };
  // 把所有指向终局的边删掉,所有 reveal 变不可达
  raw.flow.edges = raw.flow.edges.filter((e) => !e.to.startsWith('p_end_'));
  const result = validateScript(raw);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'flow'), '应报告 flow 类错误');
});

test('投票分支缺 always 兜底 → 报 flow error', () => {
  const raw = loadMock() as { flow: { edges: Array<{ from: string; to: string; condition?: { kind: string } }> } };
  raw.flow.edges = raw.flow.edges.filter((e) => !((e.from === 'p_vote' || e.from === 'p_vote_tiebreak') && e.condition?.kind === 'always'));
  const result = validateScript(raw);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'flow' && i.message.includes('always')), '应要求投票兜底结局');
});

test('非剧本对象 → 结构层 schema error', () => {
  const result = validateScript({ hello: 'world' });
  assert.equal(result.ok, false);
  assert.ok(result.issues.every((i) => i.code === 'schema'));
});

test('线索需要技能但无角色拥有该技能 → 报 skillBalance error', () => {
  const raw = loadMock();
  const rawObj = JSON.parse(JSON.stringify(raw));
  rawObj.characters = rawObj.characters.map((c: { skills?: string[]; [k: string]: unknown }) => ({ ...c, skills: [] }));
  rawObj.clues = rawObj.clues.map((c: { requiredSkill?: string; [k: string]: unknown }) => ({ ...c, requiredSkill: 'lockpick' }));
  const result = validateScript(rawObj);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'skillBalance'), '应报告 skillBalance 类错误');
});

test('线索需要技能且有角色拥有该技能 → 不报 skillBalance error', () => {
  const raw = loadMock();
  const rawObj = JSON.parse(JSON.stringify(raw));
  rawObj.characters[0].skills = ['lockpick'];
  rawObj.clues[0].requiredSkill = 'lockpick';
  const result = validateScript(rawObj);
  assert.ok(!result.issues.some((i) => i.code === 'skillBalance'), '不应报告 skillBalance 错误');
});
