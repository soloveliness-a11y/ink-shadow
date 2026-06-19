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
  faction: z.string().optional(), // 阵营标识(阵营本,如 'red'/'blue'/'neutral')
  team: z.string().optional(), // 队伍标识(可与 faction 不同,机制本预留)
  resources: z.record(z.string(), z.number()).optional(), // 数值资源(金钱/体力/积分,机制本预留)
  /** 加权推荐投票的权重(珠帘异梦:如林雅珠权重=2,其余=1)。仅 voteMode=recommend 用 */
  voteWeight: z.number().int().min(1).default(1),
  /** 双重人格/共体(孽岛疑云):同一玩家可苏醒为不同人格,切换后改变可见信息 */
  personas: z.array(z.object({
    id: z.string(),
    name: z.string(),
    publicProfile: z.string().optional(),
    triggerFlag: z.string().optional(), // 该 flag 置位时此人格苏醒(由 makeChoice/unlockStory 触发)
  })).optional(),
  /** 替身/身份替换(惊魂醉阳楼):该角色其实是另一人冒名,真相揭晓时揭露 */
  disguiseOf: z.string().optional(), // 真身 charId(此角色是 disguiseOf 的替身)
  realName: z.string().optional(), // 真实姓名(替身/双重人格的真名,真相揭晓用)
  keywordMemories: z.array(z.object({
    id: z.string(),
    keyword: z.string(), // 触发关键词(玩家说出/看到时解锁,自己不能主动说)
    text: z.string(), // 记忆片段内容(仅持有者可见)
  })).optional(), // 关键词触发记忆(豪门本"回忆"机制)
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
  /** 持有指定物品(线索 id 或 prop id)才可解锁 —— 岳麓山下/裂镜重圆的持物解锁秘密线索 */
  requiredItem: z.string().optional(),
  linkedSecretClueId: z.string().optional(),
  /** 该线索被公开(revealClue)时触发的副作用 effects —— 嗜睡蔷薇"某线索导致角色死亡" */
  onReveal: z.array(z.union([
    z.object({ kind: z.literal('setFlag'), flag: z.string() }),
    z.object({ kind: z.literal('eliminate'), charId: z.string() }), // 标记角色淘汰/死亡
    z.object({ kind: z.literal('adjustCounter'), counter: z.string(), delta: z.number() }),
    z.object({ kind: z.literal('giveClue'), clueId: z.string(), toCharId: z.string().optional() }),
  ])).optional(),
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

/** 结局分支。condition 支持单条件(向后兼容)或多条件数组(全部满足=AND,裂镜重圆等 7 结局本需要) */
export const zEnding = z.object({
  id: z.string(),
  condition: z.union([zFlowCondition, z.array(zFlowCondition).min(1)]),
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
  /** 玩法类型。决定校验分支与 UI 渲染。老剧本缺省 = 'murder'(向后兼容)。 */
  genre: z.enum(['murder', 'faction', 'mechanism', 'emotion', 'horror']).default('murder'),
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
  truth: zTruth.optional(), // 推理本必填(校验层强制),非推理本可省略
  endings: z.array(zEnding).optional(), // 通用结局(与 genre 无关);缺省回退 truth.endings
});
export type Script = z.infer<typeof zScript>;
