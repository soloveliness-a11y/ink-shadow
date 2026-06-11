/**
 * BGM 槽位定义
 * ==========================
 * 槽位 = 一个情绪/场景分类，与剧本杀游戏 phase 对应
 * 资源 = 该槽位下的可播放文件列表（支持多首随机/顺序播放）
 *
 * 路径规则：public/audio/bgm/<file>
 * 开发期 Vite 会从 /public 根提供静态资源，生产期同样如此
 */

export type BgmSlot =
  | 'lobby'      // 大厅等待
  | 'briefing'   // 主持人任务简报
  | 'intro'      // 自我介绍/角色分配后
  | 'free'       // 自由讨论
  | 'vote'       // 投票/推理
  | 'reveal'     // 真相揭晓
  | 'finished';  // 结局收束

export interface BgmTrack {
  /** 文件路径（相对 public 根） */
  src: string;
  /** 内部 ID，方便排查 */
  id: string;
  /** 文件体积（KB），用于首屏优化提示 */
  sizeKb?: number;
}

export interface BgmSlotConfig {
  slot: BgmSlot;
  /** 中文标签 */
  label: string;
  /** 默认音量 0-1 */
  defaultVolume: number;
  /** 是否循环 */
  loop: boolean;
  /** 进入该槽位时淡入毫秒 */
  fadeInMs: number;
  /** 离开该槽位时淡出毫秒 */
  fadeOutMs: number;
  /** 可用曲目；多首时随机抽一首 */
  tracks: BgmTrack[];
}

/**
 * 槽位配置
 * ⚠️ tracks 当前为空数组时，播放器会安全跳过（不报错），
 *    待 QA 阶段再补资源；切换逻辑、淡入淡出、用户控制均已就绪
 */
export const BGM_SLOTS: Record<BgmSlot, BgmSlotConfig> = {
  lobby: {
    slot: 'lobby',
    label: '大厅',
    defaultVolume: 0.45,
    loop: true,
    fadeInMs: 1200,
    fadeOutMs: 800,
    tracks: [
      { src: 'audio/bgm/lobby-01.mp3', id: 'lobby-01', sizeKb: 812 },    // Wallpaper - 安静钢琴
      { src: 'audio/bgm/lobby-02.mp3', id: 'lobby-02', sizeKb: 648 },    // Fluffing a Duck - 轻木琴
      { src: 'audio/bgm/lobby-03.mp3', id: 'lobby-03', sizeKb: 1148 },   // Long Note Three - 钢琴叙事
      { src: 'audio/bgm/lobby-04.mp3', id: 'lobby-04', sizeKb: 3522 },   // Feather Waltz - 羽毛圆舞曲
      { src: 'audio/bgm/lobby-05.mp3', id: 'lobby-05', sizeKb: 3089 },   // Divertissement - 古典拨奏
    ],
  },
  briefing: {
    slot: 'briefing',
    label: '任务简报',
    defaultVolume: 0.5,
    loop: true,
    fadeInMs: 1000,
    fadeOutMs: 800,
    tracks: [
      { src: 'audio/bgm/briefing-01.mp3', id: 'briefing-01', sizeKb: 1648 }, // Long Note Two
      { src: 'audio/bgm/briefing-02.mp3', id: 'briefing-02', sizeKb: 1000 }, // Heavy Heart
      { src: 'audio/bgm/briefing-03.mp3', id: 'briefing-03', sizeKb: 1125 }, // Inspired
      { src: 'audio/bgm/briefing-04.mp3', id: 'briefing-04', sizeKb: 2484 }, // Prelude and Action
      { src: 'audio/bgm/briefing-05.mp3', id: 'briefing-05', sizeKb: 3304 }, // Mighty and Meek
    ],
  },
  intro: {
    slot: 'intro',
    label: '角色登场',
    defaultVolume: 0.55,
    loop: true,
    fadeInMs: 1500,
    fadeOutMs: 1000,
    tracks: [
      { src: 'audio/bgm/intro-01.mp3', id: 'intro-01', sizeKb: 3376 },    // Awkward Meeting
      { src: 'audio/bgm/intro-02.mp3', id: 'intro-02', sizeKb: 3633 },    // Long Note One
      { src: 'audio/bgm/intro-03.mp3', id: 'intro-03', sizeKb: 812 },     // Windswept
      { src: 'audio/bgm/intro-04.mp3', id: 'intro-04', sizeKb: 1052 },    // Flutey Sting - 神秘笛声
      { src: 'audio/bgm/intro-05.mp3', id: 'intro-05', sizeKb: 1084 },    // Supernatural - 超自然悬念
    ],
  },
  free: {
    slot: 'free',
    label: '自由讨论',
    defaultVolume: 0.6,
    loop: true,
    fadeInMs: 2000,
    fadeOutMs: 1500,
    tracks: [
      { src: 'audio/bgm/free-01.mp3', id: 'free-01', sizeKb: 179 },       // Dark Walk - 极轻悬疑循环
      { src: 'audio/bgm/free-02.mp3', id: 'free-02', sizeKb: 1172 },      // Heavy Interlude - 短 loop
      { src: 'audio/bgm/free-03.mp3', id: 'free-03', sizeKb: 4133 },      // Pookatori and Friends
      { src: 'audio/bgm/free-04.mp3', id: 'free-04', sizeKb: 1040 },      // Darkness Speaks - 暗黑悬疑
    ],
  },
  vote: {
    slot: 'vote',
    label: '推理/投票',
    defaultVolume: 0.65,
    loop: true,
    fadeInMs: 1200,
    fadeOutMs: 1000,
    tracks: [
      { src: 'audio/bgm/vote-01.mp3', id: 'vote-01', sizeKb: 2742 },      // Volatile Reaction
      { src: 'audio/bgm/vote-02.mp3', id: 'vote-02', sizeKb: 1180 },      // Crypto
      { src: 'audio/bgm/vote-03.mp3', id: 'vote-03', sizeKb: 1047 },      // Sneaky Snitch
      { src: 'audio/bgm/vote-04.mp3', id: 'vote-04', sizeKb: 496 },       // Faceoff - 对峙
      { src: 'audio/bgm/vote-05.mp3', id: 'vote-05', sizeKb: 0 },
    ],
  },
  reveal: {
    slot: 'reveal',
    label: '真相揭晓',
    defaultVolume: 0.7,
    loop: false,
    fadeInMs: 2500,
    fadeOutMs: 2000,
    tracks: [
      { src: 'audio/bgm/reveal-01.mp3', id: 'reveal-01', sizeKb: 2226 },  // Impact Prelude - 戏剧揭晓
      { src: 'audio/bgm/reveal-02.mp3', id: 'reveal-02', sizeKb: 2640 },  // Impact Andante - 戏剧变奏
      { src: 'audio/bgm/reveal-03.mp3', id: 'reveal-03', sizeKb: 765 },   // Volatile Reaction - 升级揭晓
      { src: 'audio/bgm/reveal-04.mp3', id: 'reveal-04', sizeKb: 0 },
      { src: 'audio/bgm/reveal-05.mp3', id: 'reveal-05', sizeKb: 0 },
    ],
  },
  finished: {
    slot: 'finished',
    label: '结局',
    defaultVolume: 0.55,
    loop: true,
    fadeInMs: 2000,
    fadeOutMs: 1500,
    tracks: [
      { src: 'audio/bgm/finished-01.mp3', id: 'finished-01', sizeKb: 6812 },  // Long Note Four - loop 收束
      { src: 'audio/bgm/finished-02.mp3', id: 'finished-02', sizeKb: 922 },   // Moonlight Hall - 静谧
      { src: 'audio/bgm/finished-03.mp3', id: 'finished-03', sizeKb: 805 },   // Folk Round - 民谣收束
      { src: 'audio/bgm/finished-04.mp3', id: 'finished-04', sizeKb: 0 },
    ],
  },
};

/** 随机选曲 */
export function pickTrack(slot: BgmSlot, excludeId?: string): BgmTrack | null {
  const cfg = BGM_SLOTS[slot];
  if (!cfg.tracks.length) return null;
  // 若排除当前 ID 且还有别的可选
  const pool = excludeId
    ? cfg.tracks.filter((t) => t.id !== excludeId)
    : cfg.tracks;
  const final = pool.length > 0 ? pool : cfg.tracks;
  const i = Math.floor(Math.random() * final.length);
  return final[i] ?? null;
}

/**
 * 同槽位切换到下一首（排除当前曲目避免重复）
 * - 只有 1 首时直接返原曲（降级）
 * - 返回当前选中 track 及是否为原曲
 */
export function pickNextTrack(
  slot: BgmSlot,
  currentId: string,
): { track: BgmTrack | null; changed: boolean } {
  const cfg = BGM_SLOTS[slot];
  if (!cfg.tracks.length) return { track: null, changed: false };
  if (cfg.tracks.length === 1) return { track: cfg.tracks[0]!, changed: false };
  const other = cfg.tracks.filter((t) => t.id !== currentId);
  const pool = other.length > 0 ? other : cfg.tracks;
  const i = Math.floor(Math.random() * pool.length);
  return { track: pool[i] ?? null, changed: pool[i]?.id !== currentId };
}
