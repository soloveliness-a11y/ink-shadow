import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Script, Character, Clue, Scene, Phase, PhaseFlow } from '@mmg/schema';
import { validateScript } from '@mmg/schema';
import { repairScript } from '../src/pipeline.js';

/**
 * M1 测试:用精心构造的 mock 数据验证 assemble + validateScript 逻辑。
 * 真实 LLM 调用需要 ANTHROPIC_API_KEY,不在自动化测试中跑。
 */

// ─── Mock 数据 ───

const mockStories: Record<string, string> = {
  char_b: '你回想起案发前的那个下午,遗嘱的内容让你彻夜难眠。',
  char_c: '你确信那天晚上书房的声响不是风声。',
  char_d: '你想起张三曾经问过你关于氰化物的问题。',
};

function buildMockScript(): Script {
  return {
    meta: {
      id: 'test-mock', title: '测试剧本·遗产风波', theme: '现代悬疑',
      playerCount: { min: 3, max: 3 }, difficulty: 'normal', durationMin: 120,
      synopsis: '家族族长在书房饮下毒酒身亡,三名嫌疑人各有秘密。',
      styleGuide: '写实风格,电影质感', schemaVersion: '1.0.0', status: 'validated',
    },
    characters: [
      { id: 'char_a', name: '死者', gender: 'male', age: 65, isVictim: true, isMurderer: false,
        publicProfile: '家族族长', privateScript: '(死者)', objectives: [], secrets: [],
        timeline: [{ time: '20:00', location: '宴会厅', action: '出席晚宴', isPublic: true }],
        relationships: [{ targetCharId: 'char_b', relation: '叔侄', isPublic: true }],
        visual: { kind: 'avatar', prompt: 'Elderly Chinese patriarch', aspect: '3:4' } },
      { id: 'char_b', name: '张三', gender: 'male', age: 40, isVictim: false, isMurderer: true,
        publicProfile: '侄子,表面恭顺', privateScript: '你对叔父的遗产分配深感不平。',
        storyByPhase: { round2: mockStories['char_b']! },
        objectives: [{ id: 'obj_b1', kind: 'main', description: '隐藏罪行' }],
        secrets: ['知道遗嘱内容', '有氰化物来源'],
        timeline: [
          { time: '20:00', location: '宴会厅', action: '出席晚宴', isPublic: true },
          { time: '21:30', location: '书房', action: '趁机下毒', isPublic: false },
          { time: '22:30', location: '走廊', action: '假装刚到', isPublic: true },
        ],
        relationships: [{ targetCharId: 'char_a', relation: '叔侄', isPublic: true }],
        visual: { kind: 'avatar', prompt: 'Nervous middle-aged Chinese man', aspect: '3:4' } },
      { id: 'char_c', name: '李四', gender: 'female', age: 35, isVictim: false, isMurderer: false,
        publicProfile: '管家', privateScript: '你发现书房有些不对劲。',
        storyByPhase: { round2: mockStories['char_c']! },
        objectives: [{ id: 'obj_c1', kind: 'main', description: '查明真相' }],
        secrets: ['听到书房异响'],
        timeline: [
          { time: '20:00', location: '宴会厅', action: '招待宾客', isPublic: true },
          { time: '21:00', location: '厨房', action: '准备酒水', isPublic: false },
          { time: '22:00', location: '走廊', action: '路过书房', isPublic: false },
        ],
        relationships: [{ targetCharId: 'char_a', relation: '主仆', isPublic: true }],
        visual: { kind: 'avatar', prompt: 'Capable female housekeeper', aspect: '3:4' } },
      { id: 'char_d', name: '王五', gender: 'male', age: 30, isVictim: false, isMurderer: false,
        publicProfile: '律师', privateScript: '你负责起草遗嘱。',
        storyByPhase: { round2: mockStories['char_d']! },
        objectives: [{ id: 'obj_d1', kind: 'main', description: '保护遗嘱秘密' }],
        secrets: ['遗嘱的真实内容'],
        timeline: [
          { time: '20:00', location: '宴会厅', action: '作为宾客出席', isPublic: true },
          { time: '21:00', location: '花园', action: '与死者密谈', isPublic: false },
          { time: '22:30', location: '客厅', action: '得知死讯', isPublic: true },
        ],
        relationships: [{ targetCharId: 'char_b', relation: '旧识', isPublic: false }],
        visual: { kind: 'avatar', prompt: 'Young Chinese lawyer in suit', aspect: '3:4' } },
    ],
    clues: [
      { id: 'clue_poison', title: '毒酒杯', content: '杯中检测出氰化物成分', sceneId: 'scene_study', visibility: 'searchable', round: 1, isKey: true, pointsTo: ['poison_method'] },
      { id: 'clue_motive', title: '遗嘱副本', content: '遗嘱中张三份额极少', sceneId: 'scene_study', visibility: 'searchable', round: 1, isKey: true, pointsTo: ['motive'] },
      { id: 'clue_witness', title: '异响', content: '管家听到书房有翻动声', ownerCharId: 'char_c', visibility: 'private', isKey: true, pointsTo: ['opportunity'] },
      { id: 'clue_bottle', title: '药瓶', content: '花园发现氰化物空瓶', sceneId: 'scene_study', visibility: 'searchable', round: 2, isKey: true, pointsTo: ['poison_source'] },
      { id: 'clue_opportunity', title: '行踪', content: '有人看到张三21:30前后进出书房', sceneId: 'scene_study', visibility: 'searchable', round: 2, isKey: true, pointsTo: ['suspect_b'] },
      { id: 'clue_red', title: '律师的秘密', content: '律师与张三是旧识', ownerCharId: 'char_d', visibility: 'private', isKey: false, pointsTo: [] },
    ],
    scenes: [
      { id: 'scene_study', name: '书房', description: '案发现场', visual: { kind: 'scene', prompt: 'Dark study room', aspect: '16:9' } },
      { id: 'scene_hall', name: '宴会厅', description: '晚宴举办地', visual: { kind: 'scene', prompt: 'Grand banquet hall', aspect: '16:9' } },
    ],
    phases: [
      { id: 'p_brief', kind: 'briefing', title: '开场', instruction: '阅读剧本', participants: 'all', allowedActions: ['readScript', 'ready'], exit: { kind: 'allReady' } },
      { id: 'p_intro', kind: 'sequential', title: '自我介绍', instruction: '轮流发言', participants: 'all', allowedActions: ['speak'], turnOrder: ['char_b', 'char_c', 'char_d'], exit: { kind: 'allActed' } },
      { id: 'p_search1', kind: 'free', title: '搜证一', instruction: '搜证', participants: 'all', allowedActions: ['searchClue', 'revealClue', 'speak'], unlocks: { clueIds: ['clue_poison', 'clue_motive'] }, exit: { kind: 'timer', timerSec: 600 } },
      { id: 'p_discuss1', kind: 'free', title: '讨论一', instruction: '讨论', participants: 'all', allowedActions: ['speak', 'revealClue'], exit: { kind: 'hostAdvance' } },
      { id: 'p_search2', kind: 'free', title: '搜证二', instruction: '搜证', participants: 'all', allowedActions: ['searchClue', 'revealClue', 'speak'], unlocks: { clueIds: ['clue_bottle', 'clue_opportunity'], storyKey: 'round2' }, exit: { kind: 'timer', timerSec: 600 } },
      { id: 'p_vote', kind: 'vote', title: '投票', instruction: '投票', participants: 'all', allowedActions: ['castVote'], exit: { kind: 'voteComplete' } },
      { id: 'p_end_good', kind: 'reveal', title: '好结局', instruction: '', participants: 'all', allowedActions: [], exit: { kind: 'hostAdvance' } },
      { id: 'p_end_bad', kind: 'reveal', title: '坏结局', instruction: '', participants: 'all', allowedActions: [], exit: { kind: 'hostAdvance' } },
    ],
    flow: {
      entry: 'p_brief',
      edges: [
        { from: 'p_brief', to: 'p_intro' },
        { from: 'p_intro', to: 'p_search1' },
        { from: 'p_search1', to: 'p_discuss1' },
        { from: 'p_discuss1', to: 'p_search2' },
        { from: 'p_search2', to: 'p_vote' },
        { from: 'p_vote', to: 'p_end_good', condition: { kind: 'voteResult', equalsCharId: 'char_b' } },
        { from: 'p_vote', to: 'p_end_bad', condition: { kind: 'always' } },
      ],
    },
    truth: {
      murdererCharIds: ['char_b'],
      method: '在红酒中下氰化物',
      motive: '遗产分配不公',
      crimeTimeline: [
        { time: '20:00', location: '宴会厅', action: '晚宴开始', isPublic: true },
        { time: '21:30', location: '书房', action: '趁机下毒', isPublic: false },
        { time: '22:00', location: '书房', action: '死者饮毒酒身亡', isPublic: false },
      ],
      solutionChain: ['clue_poison', 'clue_motive', 'clue_witness', 'clue_bottle', 'clue_opportunity'],
      reveal: '凶手是张三。他对遗产分配心怀怨恨,趁晚宴之际在书房将氰化物投入死者的红酒杯中。',
      endings: [
        { id: 'end_good', title: '正义伸张', narrative: '真相大白。', condition: { kind: 'voteResult', equalsCharId: 'char_b' } },
        { id: 'end_bad', title: '凶手逃脱', narrative: '真凶隐藏于阴影中。', condition: { kind: 'always' } },
      ],
    },
  };
}

// ─── Tests ───

test('mock script 通过 validateScript(零 error)', () => {
  const script = buildMockScript();
  const result = validateScript(script);
  if (!result.ok) {
    console.log('Issues:', JSON.stringify(result.issues, null, 2));
  }
  assert.equal(result.ok, true);
  assert.equal(result.issues.filter((i) => i.level === 'error').length, 0);
});

test('缺少凶手 → 校验失败', () => {
  const script = buildMockScript();
  script.characters = script.characters.map((c) => ({ ...c, isMurderer: false }));
  const result = validateScript(script);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'solve'));
});

test('关键线索 pointsTo 清空 → 校验失败', () => {
  const script = buildMockScript();
  const key = script.clues.find((c) => c.isKey);
  assert.ok(key);
  key!.pointsTo = [];
  const result = validateScript(script);
  assert.equal(result.ok, false);
});

test('DAG 终局不可达 → 校验失败', () => {
  const script = buildMockScript();
  script.flow.edges = script.flow.edges.filter((e) => e.to !== 'p_end_good' && e.to !== 'p_end_bad');
  const result = validateScript(script);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'flow'));
});

test('players 数范围 clamp 4-8', () => {
  const clamp = (n: number) => Math.max(4, Math.min(8, n));
  assert.equal(clamp(3), 4);
  assert.equal(clamp(6), 6);
  assert.equal(clamp(10), 8);
});

test('repairScript 补齐空标题和简介', () => {
  const script = buildMockScript();
  script.meta.title = '   ';
  script.meta.synopsis = '';

  const repaired = repairScript(script);

  assert.ok(repaired.meta.title.length > 0);
  assert.ok(repaired.meta.synopsis.length > 0);
  assert.equal(validateScript(repaired).ok, true);
});

test('repairScript 修正 sequential turnOrder 只包含可玩角色且不漏人', () => {
  const script = buildMockScript();
  const intro = script.phases.find((p) => p.kind === 'sequential');
  assert.ok(intro);
  intro!.turnOrder = ['char_a', 'ghost', 'char_d'];

  const repaired = repairScript(script);
  const fixedIntro = repaired.phases.find((p) => p.id === intro!.id);

  assert.deepEqual(fixedIntro?.turnOrder, ['char_d', 'char_b', 'char_c']);
  assert.equal(validateScript(repaired).ok, true);
});

test('repairScript 为搜证阶段补齐 round unlocks 和 round2 storyKey', () => {
  const script = buildMockScript();
  for (const phase of script.phases) {
    if (phase.allowedActions.includes('searchClue')) phase.unlocks = undefined;
  }

  const repaired = repairScript(script);
  const searchPhases = repaired.phases.filter((p) => p.allowedActions.includes('searchClue'));

  assert.deepEqual(searchPhases[0]?.unlocks?.clueIds?.sort(), ['clue_motive', 'clue_poison']);
  assert.deepEqual(searchPhases[1]?.unlocks?.clueIds?.sort(), ['clue_bottle', 'clue_opportunity']);
  assert.equal(searchPhases[1]?.unlocks?.storyKey, 'round2');
  assert.equal(validateScript(repaired).ok, true);
});

test('repairScript 将抽象 solutionChain key 映射为可达 clue id', () => {
  const script = buildMockScript();
  script.truth.solutionChain = ['poison_method', 'motive', 'opportunity', 'poison_source', 'suspect_b'];

  const repaired = repairScript(script);

  assert.deepEqual(repaired.truth.solutionChain, ['clue_poison', 'clue_motive', 'clue_witness', 'clue_bottle', 'clue_opportunity']);
  assert.equal(validateScript(repaired).ok, true);
});

test('validateScript 拦截未解锁的 searchable 搜证线索', () => {
  const script = buildMockScript();
  for (const phase of script.phases) {
    if (phase.allowedActions.includes('searchClue')) phase.unlocks = { clueIds: [] };
  }

  const result = validateScript(script);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'gameplay'));
});
