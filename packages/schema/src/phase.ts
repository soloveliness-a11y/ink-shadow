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
});
export type Phase = z.infer<typeof zPhase>;

/** DAG 转移条件 */
export const zFlowCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('always') }),
  z.object({ kind: z.literal('voteResult'), equalsCharId: z.string() }),
  z.object({ kind: z.literal('voteTie') }),
  z.object({ kind: z.literal('flag'), flag: z.string(), equals: z.boolean() }),
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
