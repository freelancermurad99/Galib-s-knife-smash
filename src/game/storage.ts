const KEY = "galib_knife_smash_v1";

export type SaveData = {
  highScores: { score: number; level: number; date: string }[];
  coins: number;
  unlocked: string[];
  equipped: string;
  muted: boolean;
  bestLevel: number;
};

const DEFAULT: SaveData = {
  highScores: [],
  coins: 0,
  unlocked: ["classic"],
  equipped: "classic",
  muted: false,
  bestLevel: 1,
};

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT, ...parsed };
  } catch {
    return { ...DEFAULT };
  }
}

export function save(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function addHighScore(
  data: SaveData,
  score: number,
  level: number,
): SaveData {
  const entry = { score, level, date: new Date().toISOString() };
  const highScores = [...data.highScores, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const next = { ...data, highScores, bestLevel: Math.max(data.bestLevel, level) };
  save(next);
  return next;
}
