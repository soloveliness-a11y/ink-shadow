const STORAGE_KEY = 'mmg:achievements';

export interface GameRecord {
  scriptId: string;
  scriptTitle: string;
  charName: string;
  myVoteTarget: string | null;
  topVotedTarget: string | null;
  myCluesFound: number;
  totalRevealedClues: number;
  isCorrectVote: boolean;
  playedAt: number;
}

export interface AchievementsData {
  records: GameRecord[];
  unlocked: string[];
}

function load(): AchievementsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { records: [], unlocked: [] };
    return JSON.parse(raw) as AchievementsData;
  } catch {
    return { records: [], unlocked: [] };
  }
}

function save(data: AchievementsData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* noop */ }
}

/** 记录一局游戏结果 */
export function recordGame(record: GameRecord): string[] {
  const data = load();
  data.records.push(record);
  // 保留最近 50 局
  if (data.records.length > 50) data.records = data.records.slice(-50);

  // 检查新解锁的成就
  const newlyUnlocked: string[] = [];
  for (const a of ALL_ACHIEVEMENTS) {
    if (data.unlocked.includes(a.id)) continue;
    if (a.check(data.records, data.unlocked)) {
      data.unlocked.push(a.id);
      newlyUnlocked.push(a.id);
    }
  }
  save(data);
  return newlyUnlocked;
}

/** 获取战绩统计 */
export function getStats() {
  const data = load();
  const r = data.records;
  return {
    totalGames: r.length,
    correctVotes: r.filter(g => g.isCorrectVote).length,
    totalCluesFound: r.reduce((s, g) => s + g.myCluesFound, 0),
    winRate: r.length > 0 ? Math.round((r.filter(g => g.isCorrectVote).length / r.length) * 100) : 0,
    unlocked: data.unlocked,
    records: r,
  };
}

/* ─── 成就定义 ─── */

interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (records: GameRecord[], unlocked: string[]) => boolean;
}

const ALL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_game',
    name: '初出茅庐',
    desc: '完成第一局游戏',
    icon: '🎭',
    check: (r) => r.length >= 1,
  },
  {
    id: 'first_correct',
    name: '慧眼如炬',
    desc: '首次正确指认凶手',
    icon: '🔍',
    check: (r) => r.some(g => g.isCorrectVote),
  },
  {
    id: 'three_streak',
    name: '连续推理',
    desc: '连续 3 次正确指认',
    icon: '🔥',
    check: (r) => {
      let streak = 0;
      for (let i = r.length - 1; i >= 0; i--) {
        if (r[i]!.isCorrectVote) { streak++; if (streak >= 3) return true; }
        else streak = 0;
      }
      return false;
    },
  },
  {
    id: 'five_games',
    name: '推理常客',
    desc: '完成 5 局游戏',
    icon: '📚',
    check: (r) => r.length >= 5,
  },
  {
    id: 'ten_games',
    name: '推理达人',
    desc: '完成 10 局游戏',
    icon: '🏆',
    check: (r) => r.length >= 10,
  },
  {
    id: 'clue_hunter',
    name: '线索猎手',
    desc: '单局找到 5 条以上线索',
    icon: '🗝️',
    check: (r) => r.some(g => g.myCluesFound >= 5),
  },
  {
    id: 'all_clues',
    name: '全知全能',
    desc: '单局发现全部可搜线索',
    icon: '👁️',
    check: (r) => r.some(g => g.totalRevealedClues > 0 && g.myCluesFound >= g.totalRevealedClues),
  },
  {
    id: 'detective',
    name: '名侦探',
    desc: '正确率超过 60%（至少 5 局）',
    icon: '🎩',
    check: (r) => r.length >= 5 && (r.filter(g => g.isCorrectVote).length / r.length) > 0.6,
  },
  {
    id: 'five_correct',
    name: '推理大师',
    desc: '累计 5 次正确指认',
    icon: '👑',
    check: (r) => r.filter(g => g.isCorrectVote).length >= 5,
  },
  {
    id: 'three_scripts',
    name: '见多识广',
    desc: '玩过 3 个不同剧本',
    icon: '📖',
    check: (r) => new Set(r.map(g => g.scriptId)).size >= 3,
  },
];

/** 获取所有成就（含解锁状态） */
export function getAllAchievements(unlocked: string[]) {
  return ALL_ACHIEVEMENTS.map(a => ({
    id: a.id,
    name: a.name,
    desc: a.desc,
    icon: a.icon,
    unlocked: unlocked.includes(a.id),
  }));
}
