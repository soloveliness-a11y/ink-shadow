/**
 * M1 生成引擎入口。
 * 详见 PLAN/02-m1-script-generation.md。
 */

export interface GenParams {
  players: number;
  theme: string;
  difficulty: 'easy' | 'normal' | 'hard' | 'expert';
  style?: string;
  outDir?: string;
  seed?: number;
  resume?: boolean;
}

export type { GenParams as default };
