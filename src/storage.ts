export interface ScoreEntry {
  score: number;
  level: number;
  minder: string;
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
