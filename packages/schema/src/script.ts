import { z } from 'zod';
import { zVisualSpec } from './visual.js';
import { zPhase, zPhaseFlow, zFlowCondition } from './phase.js';

/** 角色任务目标 */
export const zObjective = z.object({
  id: z.string(),
  kind: z.enum(['main', 'side', 'hidden']),
  description: z.string(),
  scoring: z.number().optional(),
});
export type Objective = z.infer<typeof zObjective>;

/** 时间线条目 */
export const zTimelineEntry = z.object({
  time: z.string(),
  location: z.string(),
  action: z.string(),
  isPublic: z.boolean(),
});
export type TimelineEntry = z.infer<typeof zTimelineEntry>;

/** 角色关系 */
export const zRelationship = z.object({
  targetCharId: z.string(),
  relation: z.string(),
  isPublic: z.boolean(),
  sharedSecret: z.string().optional(), // 仅双方知晓的共享秘密
});
export type Relationship = z.infer<typeof zRelationship>;

/** 角色 */
export const zCharacter = z.object({
  id: z.string(),
  name: z.string(),
  gender: z.enum(['male', 'female', 'other']),
  age: z.number().int().optional(),
  isVictim: z.boolean(),
  isMurderer: z.boolean(), // 服务器侧;运行时不下发
  publicProfile: z.string(),
  privateScript: z.string(),
  storyByPhase: z.record(z.string(), z.string()).optional(), // 分幕解锁
  objectives: z.array(zObjective),
  secrets: z.array(z.string()),
  timeline: z.array(zTimelineEntry),
  relationships: z.array(zRelationship),
  skills: z.array(z.string()).optional(),
  sceneId: z.string().optional(), // 角色所在区域（搜证时不可调查自己区域）
  passiveClueGivers: z.array(z.object({
    targetCharId: z.string(),
    clueId: z.string(),
  })).optional(),
  investigationReport: z.string().optional(),
  mandatoryReveal: z.array(z.string()).optional(), // 必须公开的信息（被问到时必须回答）
  visual: zVisualSpec, // 头像(必填)
});
export type Character = z.infer<typeof zCharacter>;

/** 线索 */
export const zClue = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  sceneId: z.string().optional(),
  ownerCharId: z.string().optional(),
  visibility: z.enum(['public', 'private', 'searchable']),
  round: z.number().int().optional(),
  isKey: z.boolean(),
  pointsTo: z.array(z.string()), // 指向真相要素 / clue.id(自洽校验用)
  requiredSkill: z.string().optional(),
  linkedSecretClueId: z.string().optional(),
  visual: zVisualSpec.optional(),
});
export type Clue = z.infer<typeof zClue>;

/** 场景(搜证地点) */
export const zScene = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  visual: zVisualSpec, // 场景图(必填)
});
export type Scene = z.infer<typeof zScene>;

/** 道具 */
export const zProp = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  visual: zVisualSpec, // 道具图(必填)
});
export type Prop = z.infer<typeof zProp>;

/** 结局分支 */
export const zEnding = z.object({
  id: z.string(),
  condition: zFlowCondition,
  title: z.string(),
  narrative: z.string(),
});
export type Ending = z.infer<typeof zEnding>;

/** 真相(仅服务器可见) */
export const zTruth = z.object({
  murdererCharIds: z.array(z.string()).min(1),
  method: z.string(),
  motive: z.string(),
  crimeTimeline: z.array(zTimelineEntry),
  solutionChain: z.array(z.string()), // 推理链(每步引用 clue.id / 真相要素)
  reveal: z.string(),
  endings: z.array(zEnding),
});
export type Truth = z.infer<typeof zTruth>;

/** 剧本元信息 */
export const zScriptMeta = z.object({
  id: z.string(),
  title: z.string(),
  theme: z.string(),
  playerCount: z.object({ min: z.number().int(), max: z.number().int() }),
  difficulty: z.enum(['easy', 'normal', 'hard', 'expert']),
  durationMin: z.number().int().positive(),
  synopsis: z.string(),
  styleGuide: z.string(), // 全局美术风格(M2 统一出图用)
  cover: zVisualSpec.optional(), // 封面图(竖版海报,M2 回填 asset)
  schemaVersion: z.string(),
  status: z.enum(['draft', 'validated', 'ready']),
});
export type ScriptMeta = z.infer<typeof zScriptMeta>;

/** 剧本根结构(剧本包) */
export const zScript = z.object({
  meta: zScriptMeta,
  characters: z.array(zCharacter),
  clues: z.array(zClue),
  scenes: z.array(zScene),
  props: z.array(zProp).optional(),
  phases: z.array(zPhase),
  flow: zPhaseFlow,
  truth: zTruth,
});
export type Script = z.infer<typeof zScript>;
