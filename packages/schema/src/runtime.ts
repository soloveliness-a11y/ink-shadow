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
  currentTime: z.string().optional(), // 时钟指示物当前时间(clock phase 用,如 "21:10")
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
  theories: z.record(z.string(), z.string()), // charId -> 理论文本
  flags: z.record(z.string(), z.boolean()),
  teams: z.record(z.string(), z.object({
    score: z.number().optional(),
    eliminated: z.boolean().optional(),
    members: z.array(z.string()).optional(),
  })).optional(), // 阵营状态(阵营本)
  resources: z.record(z.string(), z.record(z.string(), z.number())).optional(), // charId -> {resourceId: amount}(机制本预留)
  counters: z.record(z.string(), z.number()).optional(), // 任意数值计数器(补 flags 只能 boolean 的短板)
  log: z.array(zGameEvent),
});
export type RuntimeState = z.infer<typeof zRuntimeState>;

/** 可序列化的房间快照，用于持久化到磁盘 */
export interface RoomSnapshot {
  /** 版本号，用于未来数据迁移。当前 = 2(加 teams/resources/counters,全 optional)。类型用 number 以便老快照(version 1)restore。 */
  version: number;
  state: RuntimeState;
  hostId: string;
  scriptId: string;
  isTestMode: boolean;
  botIds: string[];
  phaseHistory: string[];
  dmConfig: { provider: 'anthropic' | 'openai'; apiKey: string; apiUrl?: string; model: string } | null;
  kickedTokens: string[];
  savedAt: string;
}
