const STORAGE_KEY = 'mmg:ratings';

interface Rating {
  score: number;
  comment?: string;
  ratedAt: number;
}

type RatingStore = Record<string, Rating>;

function readStore(): RatingStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function writeStore(store: RatingStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}

export function rateScript(scriptId: string, score: number, comment?: string): void {
  const store = readStore();
  store[scriptId] = { score: Math.max(1, Math.min(5, score)), comment, ratedAt: Date.now() };
  writeStore(store);
}

export function getRating(scriptId: string): Rating | null {
  return readStore()[scriptId] ?? null;
}

export function getAllRatings(): RatingStore {
  return readStore();
}
