import { z } from 'zod';

/** 房间状态 */
export const zRoomStatus = z.enum(['lobby', 'assigning', 'playing', 'finished']);
export type RoomStatus = z.infer<typeof zRoomStatus>;

/** 玩家槽位 */
export const zPlayerSlot = z.object({
  playerId: z.string(),
  charId: z.string().optional(),
  nickname: z.string(),
  connected: z.boolean(),
  ready: z.boolean(),
  isHost: z.boolean(),
});
export type PlayerSlot = z.infer<typeof zPlayerSlot>;

/** 当前环节的临时运行态 */
export const zPhaseRuntime = z.object({
  phaseId: z.string(),
  turnIndex: z.number().int().optional(), // sequential:当前轮到第几个
  startedAt: z.number(),
  deadline: z.number().optional(), // timer 环节截止时间戳
  actedCharIds: z.array(z.string()),
  searchCount: z.record(z.string(), z.number().int()).optional(), // charId → 已搜证次数
  resolvedVoteTargets: z.array(z.string()).optional(), // 决胜轮解析后的投票目标(不 mutate 共享 phase)
});
export type PhaseRuntime = z.infer<typeof zPhaseRuntime>;

/** 游戏事件(广播/回放) */
export const zGameEvent = z.object({
  ts: z.number(),
  type: z.string(),
  actorCharId: z.string().optional(),
  payload: z.unknown().optional(),
});
export type GameEvent = z.infer<typeof zGameEvent>;

/** 服务器权威的完整运行态(不直接下发,需经裁剪) */
export const zRuntimeState = z.object({
  roomCode: z.string(),
  scriptId: z.string(),
  status: zRoomStatus,
  players: z.array(zPlayerSlot),
  currentPhaseId: z.string(),
  phaseRuntime: zPhaseRuntime,
  revealedClues: z.array(z.string()), // 已公开线索 id
  acquiredClues: z.record(z.string(), z.array(z.string())), // charId -> 已获取线索 id
  votes: z.record(z.string(), z.string()), // voterCharId -> targetCharId
  tieCharIds: z.array(z.string()).optional(), // 平票决胜:上一轮平票角色 ID
  flags: z.record(z.string(), z.boolean()),
  log: z.array(zGameEvent),
});
export type RuntimeState = z.infer<typeof zRuntimeState>;
