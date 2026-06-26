import { z } from 'zod';
import { zActionKind, zPhaseKind } from './phase.js';
import { zClue, zObjective, zScriptMeta } from './script.js';
import { zRoomStatus, zGameEvent } from './runtime.js';

/**
 * 协议版本号。每次改动 ClientIntent / ServerMessage / ClientStateView 结构时手动 +1。
 * client join 时上报,server 比对;不一致则提示玩家刷新页面(防旧前端发旧协议的静默故障)。
 */
export const PROTOCOL_VERSION = 10;

/**
 * 客户端 → 服务器:玩家意图。
 * 服务器对每个意图做权威校验(环节是否允许、是否轮到该玩家、线索是否解锁)。
 */
export const zClientIntent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('join'), roomCode: z.string().max(64), nickname: z.string().max(40), sessionToken: z.string().max(128).optional(), clientVersion: z.number().int().optional() }),
  z.object({ kind: z.literal('selectScript'), scriptId: z.string().max(128) }),
  z.object({ kind: z.literal('startTest') }),
  z.object({ kind: z.literal('selectChar'), charId: z.string().max(128) }),
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('speak'), text: z.string().max(2000) }),
  z.object({ kind: z.literal('searchClue'), clueId: z.string().max(128) }),
  z.object({ kind: z.literal('revealClue'), clueId: z.string().max(128) }),
  z.object({ kind: z.literal('privateMessage'), toCharId: z.string().max(128), text: z.string().max(2000) }),
  z.object({ kind: z.literal('castVote'), targetCharId: z.string().max(128) }),
  z.object({ kind: z.literal('submitTheory'), text: z.string().max(2000) }),
  z.object({ kind: z.literal('hostAdvance') }),
  z.object({ kind: z.literal('kickPlayer'), targetPlayerId: z.string().max(128) }), // 房主踢人(仅 lobby)
  z.object({ kind: z.literal('manualAdvance') }),
  z.object({ kind: z.literal('rollbackPhase') }),
  z.object({ kind: z.literal('makeChoice'), choiceId: z.string().max(128), optionId: z.string().max(128) }),
  z.object({ kind: z.literal('adjustCounter'), counter: z.string().max(64), delta: z.number().finite() }),
  z.object({ kind: z.literal('adjustResource'), resourceId: z.string().max(64), delta: z.number().finite() }),
  z.object({ kind: z.literal('inspectCharItems'), targetCharId: z.string().max(64) }),
  z.object({ kind: z.literal('expose'), targetCharId: z.string().max(64), severity: z.enum(['minor', 'major']) }),
  z.object({ kind: z.literal('configureDm'), enabled: z.boolean(), provider: z.enum(['anthropic', 'openai']).optional(), apiKey: z.string().max(512).optional(), apiUrl: z.string().max(512).optional(), model: z.string().max(128).optional() }),
]);
export type ClientIntent = z.infer<typeof zClientIntent>;

/** 公开角色信息(全员可见) */
export const zPublicCharacter = z.object({
  id: z.string(),
  name: z.string(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  publicProfile: z.string(),
  isVictim: z.boolean().optional(),
  faction: z.string().optional(), // 阵营标识(阵营本,侧栏分组用)
  avatar: z.string().optional(), // 头像 asset 路径
  /** 仅公开行踪(isPublic=true),便于侧栏时间线展示 */
  publicTimeline: z
    .array(
      z.object({
        time: z.string(),
        location: z.string(),
        action: z.string(),
      }),
    )
    .optional(),
  /** 公开关系(对其他角色公开的关系),帮助玩家在侧栏看到社交网 */
  publicRelations: z
    .array(
      z.object({
        targetCharId: z.string(),
        relation: z.string(),
      }),
    )
    .optional(),
});
export type PublicCharacter = z.infer<typeof zPublicCharacter>;

/**
 * 服务器 → 客户端的裁剪后视图。
 * 防作弊核心:绝不含 Truth、他人 privateScript/secrets/isMurderer、未获取线索内容。
 */
export const zSearchableClueStub = z.object({
  id: z.string(),
  title: z.string(),
  sceneId: z.string().optional(),
});
export type SearchableClueStub = z.infer<typeof zSearchableClueStub>;

export const zPublicScene = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  image: z.string().optional(),
});
export type PublicScene = z.infer<typeof zPublicScene>;

export const zClientStateView = z.object({
  roomCode: z.string(),
  status: zRoomStatus,
  selectedScript: zScriptMeta.optional(),
  availableScripts: z.array(zScriptMeta),
  players: z.array(
    z.object({
      playerId: z.string(),
      nickname: z.string(),
      charId: z.string().optional(),
      connected: z.boolean(),
      ready: z.boolean(),
      isHost: z.boolean(),
    }),
  ),
  self: z
    .object({
      charId: z.string(),
      privateScript: z.string(),
      storyUnlocked: z.array(z.string()),
      unlockedNarratives: z.array(z.object({
        phaseTitle: z.string(),
        text: z.string(),
      })).default([]),
      /** 各解锁阶段配对块:公共旁白 + 角色私人记忆按阶段成组,供「我的剧本」交错排列。 */
      unlockedPhaseBlocks: z.array(z.object({
        phaseTitle: z.string(),
        narrative: z.string().optional(),
        story: z.string().optional(),
      })).default([]),
      objectives: z.array(zObjective),
      myClues: z.array(zClue),
      relationships: z.array(z.object({
        targetCharId: z.string(),
        relation: z.string(),
        isPublic: z.boolean(),
        sharedSecret: z.string().optional(),
      })).optional(),
      skills: z.array(z.string()).optional(),
      passiveClueGivers: z.array(z.object({
        targetCharId: z.string(),
        clueId: z.string(),
      })).optional(),
      mandatoryReveal: z.array(z.string()).optional(), // 必须公开的信息
      theory: z.string().optional(), // 已提交的推理文本
      unlockedKeywordMemories: z.array(z.object({
        id: z.string(),
        keyword: z.string(),
        text: z.string(),
      })).default([]), // 关键词触发解锁的记忆片段(豪门本"回忆")
      searchedThisRound: z.boolean().optional(), // 本轮是否已搜查(maxRounds 轮流搜查)
      resources: z.record(z.string(), z.number()).optional(), // 机制本:该玩家持有的资源 {resourceId: amount}
    })
    .optional(),
  currentPhase: z
    .object({
      id: z.string(),
      kind: zPhaseKind,
      title: z.string(),
      instruction: z.string(),
      allowedActions: z.array(zActionKind),
      turnCharId: z.string().optional(),
      deadline: z.number().optional(),
      narrativeText: z.string().optional(),
      unlockedStoryKey: z.string().optional(),
      maxSearches: z.number().int().optional(),
      mySearchCount: z.number().int().optional(),
      restrictVoteTargets: z.array(z.string()).optional(),
      voteMode: z.enum(['char', 'team', 'proposal', 'recommend']).optional(),
      choice: z.object({
        id: z.string(),
        prompt: z.string(),
        options: z.array(z.object({ id: z.string(), label: z.string() })),
      }).optional(), // 抉择点(裁掉 effects,不下发后果)
      currentTime: z.string().optional(), // 时钟当前时间(clock phase)
      clockEnd: z.string().optional(), // 时钟结束时间
      round: z.number().int().optional(), // 当前搜查轮次
      maxRounds: z.number().int().optional(), // 搜查总轮次
    })
    .optional(),
  phaseProgress: z
    .object({
      actedCharIds: z.array(z.string()),
      requiredCharIds: z.array(z.string()),
      totalRequired: z.number().int(),
      actedCount: z.number().int(),
      pendingCharIds: z.array(z.string()),
      exitKind: z.string(),
    })
    .optional(),
  publicCharacters: z.array(zPublicCharacter),
  publicScenes: z.array(zPublicScene),
  revealedClues: z.array(zClue),
  searchableClues: z.array(zSearchableClueStub),
  sceneSearchProgress: z.record(z.string(), z.object({ total: z.number(), acquired: z.number() })).optional(),
  sceneImages: z.record(z.string(), z.string()), // sceneId -> 图路径
  propImages: z.record(z.string(), z.string()).optional(), // propId -> 图路径
  votesPublic: z.record(z.string(), z.string()).optional(),
  teams: z.record(z.string(), z.object({
    score: z.number().optional(),
    members: z.array(z.string()).optional(),
    eliminated: z.boolean().optional(),
  })).optional(), // 阵营状态(阵营本,全员可见)
  myFaction: z.string().optional(), // 本玩家的阵营(裁剪后)
  counters: z.record(z.string(), z.number()).optional(), // 机制本全局计数器(全员可见,如公共计分)
  isTestMode: z.boolean().optional(),
  dmEnabled: z.boolean().optional(),
  pendingAdvance: z.boolean().optional(),
  phaseHistory: z.array(z.string()).optional(), // 已经过的阶段标题
  ending: z
    .object({ title: z.string(), narrative: z.string(), truthReveal: z.string(), theories: z.record(z.string(), z.string()).optional() })
    .optional(), // 仅 finished 才有
  log: z.array(zGameEvent),
});
export type ClientStateView = z.infer<typeof zClientStateView>;

/** 服务器 → 客户端消息 */
export const zServerMessage = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('joined'), playerId: z.string(), sessionToken: z.string() }),
  z.object({ kind: z.literal('assigned'), charId: z.string() }), // 私密:仅发本人
  z.object({ kind: z.literal('stateSync'), view: zClientStateView }),
  z.object({ kind: z.literal('statePatch'), patches: z.record(z.string(), z.unknown()), removes: z.array(z.string()).optional() }),
  z.object({ kind: z.literal('event'), event: zGameEvent }),
  z.object({ kind: z.literal('privateMessage'), fromCharId: z.string(), text: z.string() }),
  z.object({ kind: z.literal('kicked'), reason: z.string().optional() }), // 被房主移出房间
  z.object({ kind: z.literal('dmNarrative'), text: z.string(), charId: z.string().optional() }), // AI DM 旁白
  z.object({ kind: z.literal('keywordMemory'), charId: z.string(), memId: z.string(), keyword: z.string(), text: z.string() }), // 私发:关键词解锁的记忆片段
  z.object({ kind: z.literal('error'), code: z.string().optional(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof zServerMessage>;
