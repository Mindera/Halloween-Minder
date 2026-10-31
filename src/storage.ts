export interface ScoreEntry {
  score: number;
  level: number;
  minder: string;
  /** Player 2's minder in co-op games. */
  minder2?: string;
  date: string;
}

const KEY = 'hm.scores';
const MINDER_KEY = 'hm.minder';

export function loadScores(): ScoreEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? (raw as ScoreEntry[]) : [];
  } catch {
    return [];
  }
}

/** Saves the run and returns its rank (0 = new high score), or -1 when it did not make the top 10. */
export function saveScore(entry: ScoreEntry): number {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, 10);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    /* storage full or blocked */
  }
  return top.indexOf(entry);
}

export function highScore(): number {
  return loadScores()[0]?.score ?? 0;
}

export function loadMinder(): string | null {
  try {
    return localStorage.getItem(MINDER_KEY);
  } catch {
    return null;
  }
}

export function saveMinder(id: string) {
  try {
    localStorage.setItem(MINDER_KEY, id);
  } catch {
    /* ignore */
  }
}

export interface DailyEntry {
  score: number;
  /** Stages cleared (3 = completed). */
  stages: number;
  minder: string;
}

const DAILY_KEY = 'hm.daily';

/** Best Daily Challenge result per UTC day (last 30 days kept). */
export function loadDaily(): Record<string, DailyEntry> {
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, DailyEntry>) : {};
  } catch {
    return {};
  }
}

/** Saves today's run if it beats today's best; returns true when it is a new best. */
export function saveDaily(day: string, entry: DailyEntry): boolean {
  const all = loadDaily();
  const prev = all[day];
  if (prev && prev.score >= entry.score) return false;
  all[day] = entry;
  const keep = Object.keys(all).sort().slice(-30);
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, all[k]]))));
  } catch {
    /* ignore */
  }
  return true;
}
