import { z } from 'zod';

/** 环节种类(决定同步模型,见 PLAN/01 §5.1) */
export const zPhaseKind = z.enum(['briefing', 'sequential', 'free', 'vote', 'reveal']);
export type PhaseKind = z.infer<typeof zPhaseKind>;

/** 玩家在环节内可执行的操作 */
export const zActionKind = z.enum([
  'readScript',
  'speak',
  'searchClue',
  'revealClue',
  'privateMessage',
  'castVote',
  'submitTheory',
  'ready',
  'makeChoice', // 抉择(豪门本:选项→后果)
  'adjustCounter', // 机制本:主动增减计数器(如投入筹码/计分)
  'adjustResource', // 机制本:主动增减自己持有的资源
  'inspectCharItems', // 强搜随身物品:花额外 AP 强制查看目标玩家持有的线索(瑾园孤花)
  'expose', // 揭露:公开目标角色的过失/秘密,扣其推荐分或剥夺资格(珠帘异梦)
]);
export type ActionKind = z.infer<typeof zActionKind>;

/** 环节推进条件 */
export const zExitCondition = z.object({
  kind: z.enum(['allReady', 'allActed', 'timer', 'hostAdvance', 'voteComplete']),
  timerSec: z.number().int().positive().optional(),
});
export type ExitCondition = z.infer<typeof zExitCondition>;

/** 进入环节时解锁的内容 */
export const zPhaseUnlocks = z.object({
  clueIds: z.array(z.string()).optional(), // 开放可搜证的线索
  storyKey: z.string().optional(), // 解锁各角色 storyByPhase[storyKey]
});
export type PhaseUnlocks = z.infer<typeof zPhaseUnlocks>;

/** 环节节点 */
export const zPhase = z.object({
  id: z.string(),
  kind: zPhaseKind,
  title: z.string(),
  instruction: z.string(),
  participants: z.union([z.literal('all'), z.array(z.string())]).default('all'),
  allowedActions: z.array(zActionKind),
  turnOrder: z.array(z.string()).optional(), // 仅 sequential
  unlocks: zPhaseUnlocks.optional(),
  exit: zExitCondition,
  narrativeText: z.string().optional(), // 叙事文本（用于背景故事、过渡剧情等）
  maxSearches: z.number().int().positive().optional(), // 该阶段每位玩家最大搜证次数
  resetVotes: z.boolean().optional(), // 进入此阶段时清空投票记录（决胜轮用）
  restrictVoteTargets: z.union([z.literal('tied'), z.array(z.string())]).optional(), // 限制投票目标;'tied'=运行时从平票者填充
  voteMode: z.enum(['char', 'team', 'proposal', 'recommend']).optional(), // 'recommend'=加权推荐(珠帘异梦继承人选)
  choice: z.object({
    id: z.string(),
    prompt: z.string(),
    options: z.array(z.object({
      id: z.string(),
      label: z.string(),
      effects: z.array(z.union([
        z.object({ kind: z.literal('giveClue'), clueId: z.string() }),
        z.object({ kind: z.literal('setFlag'), flag: z.string() }),
        z.object({ kind: z.literal('advanceClock') }),
        z.object({ kind: z.literal('unlockStory'), storyKey: z.string() }),
        z.object({ kind: z.literal('jumpPhase'), phaseId: z.string() }),
        // 机制本/阵营本/情感本扩展 effects(第一期接通):
        z.object({ kind: z.literal('adjustCounter'), counter: z.string(), delta: z.number() }),
        z.object({ kind: z.literal('adjustResource'), resourceId: z.string(), delta: z.number() }),
        z.object({ kind: z.literal('adjustTeamScore'), teamId: z.string(), delta: z.number() }),
        z.object({ kind: z.literal('switchPersona'), charId: z.string(), personaId: z.string() }), // 双重人格切换(孽岛疑云)
      ])),
    })),
  }).optional(), // 抉择点(进入 phase 展示选项,makeChoice 触发 effects)
  clock: z.object({
    startTime: z.string(),
    stepMin: z.number().int().positive().default(5),
    endTime: z.string(),
  }).optional(), // 时钟指示物(调查阶段前进式时间,如 21:05→22:15)
  maxRounds: z.number().int().positive().optional(), // 轮次搜查上限(每轮每人 1 次,共 N 轮,如丹水 8 轮;强制轮流避免一窝蜂)
  inspectCost: z.number().int().positive().optional(), // 强搜随身物品的 AP 消耗(默认2,瑾园孤花)
});
export type Phase = z.infer<typeof zPhase>;

/** DAG 转移条件 */
export const zFlowCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('always') }),
  z.object({ kind: z.literal('voteResult'), equalsCharId: z.string() }),
  z.object({ kind: z.literal('voteTie') }),
  z.object({ kind: z.literal('flag'), flag: z.string(), equals: z.boolean() }),
  z.object({ kind: z.literal('teamWin'), teamId: z.string() }), // 阵营胜利(本轮实现)
  z.object({ kind: z.literal('scoreReach'), counter: z.string(), gte: z.number() }), // 机制本:counters[counter] >= gte
  z.object({ kind: z.literal('choiceResult'), choiceId: z.string(), value: z.string() }), // 情感还原本:集体抉择结果
  z.object({ kind: z.literal('recommendWin'), charId: z.string() }), // 机制本:加权推荐当选(珠帘异梦)
]);
export type FlowCondition = z.infer<typeof zFlowCondition>;

/** DAG 边 */
export const zPhaseEdge = z.object({
  from: z.string(),
  to: z.string(),
  condition: zFlowCondition.optional(), // 缺省 = always
});
export type PhaseEdge = z.infer<typeof zPhaseEdge>;

/** 环节流程 DAG(B 方案核心) */
export const zPhaseFlow = z.object({
  entry: z.string(),
  edges: z.array(zPhaseEdge),
});
export type PhaseFlow = z.infer<typeof zPhaseFlow>;
