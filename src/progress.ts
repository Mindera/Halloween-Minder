import type { EnemyKind, ItemKind } from './config';

/** Everything that survives between games: settings, unlocked costumes, stats, stickers and the daily ghost. */

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
};

// ------------------------------------------------------------ settings (accessibility)

export interface Settings {
  /** Monsters move at 60% speed (for little kids). */
  slow: boolean;
  /** Larger on-screen controls. */
  bigButtons: boolean;
  /** Colour-blind friendly portals and items (distinct colours plus shapes). */
  colorBlind: boolean;
  /** Mutes the scary sounds (boss sting, monster rumble, jump-scare...). */
  noScary: boolean;
}

const SETTINGS_KEY = 'hm.settings';
export const settings: Settings = read<Settings>(SETTINGS_KEY, { slow: false, bigButtons: false, colorBlind: false, noScary: false });
export const saveSettings = () => write(SETTINGS_KEY, settings);

// ------------------------------------------------------------ costumes

export type Costume = 'witchHat' | 'partyHat' | 'cape';

/** Reaching these Arcade levels unlocks the costume for every Minder. */
export const COSTUMES: { id: Costume; level: number; slot: 'hat' | 'cape'; icon: string }[] = [
  { id: 'witchHat', level: 10, slot: 'hat', icon: '🧙' },
  { id: 'partyHat', level: 25, slot: 'hat', icon: '🥳' },
  { id: 'cape', level: 50, slot: 'cape', icon: '🧛' },
];

export interface Outfit {
  hat: 'witchHat' | 'partyHat' | null;
  cape: boolean;
}

const UNLOCK_KEY = 'hm.unlocks';
const OUTFIT_KEY = 'hm.outfit';
const unlocked = new Set<Costume>(read<{ list: Costume[] }>(UNLOCK_KEY, { list: [] }).list);
export const outfit: Outfit = read<Outfit>(OUTFIT_KEY, { hat: null, cape: false });

export const isUnlocked = (c: Costume) => unlocked.has(c);
export const saveOutfit = () => write(OUTFIT_KEY, outfit);

// ------------------------------------------------------------ stats & stickers

export interface Stats {
  crates: number;
  kills: number;
  bombKills: number;
  rabbits: number;
  teleports: number;
  bossKills: number;
  bossBombOnly: number;
  bestBlast: number;
  maxLevel: number;
  partyClears: number;
  squidClears: number;
  dailyClears: number;
  coopClears: number;
  fastClears: number;
  doors: number;
  pets: number;
  /** Times the title screen's secret climb was found. */
  secrets: number;
  /** Arcade games won: all 100 levels cleared. */
  wins: number;
  /** Most monsters bonked in a row (each within STREAK_GAP seconds of the last). */
  bestStreak: number;
  items: string[];
}

const STATS_KEY = 'hm.stats';
const STICKERS_KEY = 'hm.stickers';
export const stats: Stats = read<Stats>(STATS_KEY, {
  crates: 0, kills: 0, bombKills: 0, rabbits: 0, teleports: 0, bossKills: 0, bossBombOnly: 0, bestBlast: 0,
  maxLevel: 0, partyClears: 0, squidClears: 0, dailyClears: 0, coopClears: 0, fastClears: 0, doors: 0, pets: 0, secrets: 0, wins: 0, bestStreak: 0, items: [],
});
const earned = new Set<string>(read<{ list: string[] }>(STICKERS_KEY, { list: [] }).list);

const ALL_ITEMS: ItemKind[] = ['cricket', 'spice', 'pig', 'eclair', 'beer', 'computer', 'coffee', 'choco', 'foosball', 'lights', 'roach', 'rabbit', 'bomb', 'candy'];

export interface Sticker {
  id: string;
  icon: string;
  /** Current value and goal, for the progress shown under locked stickers. */
  progress: (s: Stats) => [number, number];
  /** Its name stays hidden in the sticker book until it is earned. */
  secret?: boolean;
  /** A big one: a full-width card in the sticker book and a bigger popup. */
  big?: boolean;
  /** Has a `stickers.<id>Sub` line saying what it's for. */
  sub?: boolean;
}

export const STICKERS: Sticker[] = [
  // Say it three times... for finishing all 100 levels.
  { id: 'champion', icon: '🪲', progress: (s) => [s.wins, 1], big: true, sub: true },
  { id: 'firstBonk', icon: '👁️', progress: (s) => [s.kills, 1] },
  { id: 'bonk500', icon: '💥', progress: (s) => [s.kills, 500] },
  { id: 'crates100', icon: '📦', progress: (s) => [s.crates, 100] },
  { id: 'bigBlast', icon: '🎃', progress: (s) => [s.bestBlast, 3] },
  { id: 'manita', icon: '🖐️', progress: (s) => [s.bestStreak, 5], sub: true },
  { id: 'rabbit5', icon: '🐇', progress: (s) => [s.rabbits, 5] },
  { id: 'teleport50', icon: '🌀', progress: (s) => [s.teleports, 50] },
  { id: 'boss', icon: '🤓', progress: (s) => [s.bossKills, 1] },
  { id: 'bossBombs', icon: '💣', progress: (s) => [s.bossBombOnly, 1] },
  { id: 'party', icon: '🎂', progress: (s) => [s.partyClears, 1] },
  { id: 'squid', icon: '🦑', progress: (s) => [s.squidClears, 1] },
  { id: 'level25', icon: '🥉', progress: (s) => [s.maxLevel, 25] },
  { id: 'level50', icon: '🥈', progress: (s) => [s.maxLevel, 50] },
  { id: 'level100', icon: '🏆', progress: (s) => [s.maxLevel, 100] },
  { id: 'daily', icon: '📅', progress: (s) => [s.dailyClears, 1] },
  { id: 'coop', icon: '👥', progress: (s) => [s.coopClears, 1] },
  { id: 'speedy', icon: '⏱️', progress: (s) => [s.fastClears, 1] },
  { id: 'doors10', icon: '🚪', progress: (s) => [s.doors, 10] },
  { id: 'pet', icon: '🦇', progress: (s) => [s.pets, 1] },
  { id: 'snacks', icon: '🍬', progress: (s) => [ALL_ITEMS.filter((k) => s.items.includes(k)).length, ALL_ITEMS.length] },
  { id: 'secret', icon: '🥚', progress: (s) => [s.secrets, 1], secret: true },
];

export const hasSticker = (id: string) => earned.has(id);

// ------------------------------------------------------------ events from the game

export type GameEvent =
  | { type: 'crate' }
  | { type: 'kill'; kind: EnemyKind; by: 'eye' | 'bomb' | 'pet' | 'other' }
  | { type: 'boss'; onlyBombs: boolean }
  | { type: 'blast'; kills: number }
  | { type: 'item'; kind: ItemKind }
  | { type: 'teleport' }
  | { type: 'reach'; level: number }
  | { type: 'clear'; level: number; timeLeft: number; party: boolean; coop: boolean; squid: boolean }
  | { type: 'dailyClear' }
  | { type: 'door' }
  | { type: 'pet' }
  | { type: 'secret' }
  | { type: 'victory' }
  | { type: 'streak'; n: number };

export interface Rewards {
  stickers: Sticker[];
  costumes: Costume[];
}

/** Updates the stats and returns any sticker or costume that this event just earned. */
export function record(e: GameEvent, arcade: boolean): Rewards {
  switch (e.type) {
    case 'crate':
      stats.crates++;
      break;
    case 'kill':
      stats.kills++;
      if (e.by === 'bomb') stats.bombKills++;
      break;
    case 'boss':
      stats.bossKills++;
      if (e.onlyBombs) stats.bossBombOnly++;
      break;
    case 'blast':
      stats.bestBlast = Math.max(stats.bestBlast, e.kills);
      break;
    case 'item':
      if (e.kind === 'rabbit') stats.rabbits++;
      if (!stats.items.includes(e.kind)) stats.items.push(e.kind);
      break;
    case 'teleport':
      stats.teleports++;
      break;
    case 'reach':
      if (arcade) stats.maxLevel = Math.max(stats.maxLevel, e.level);
      break;
    case 'clear':
      if (e.party) stats.partyClears++;
      if (e.squid) stats.squidClears++;
      if (e.coop) stats.coopClears++;
      if (e.timeLeft >= 60) stats.fastClears++;
      break;
    case 'dailyClear':
      stats.dailyClears++;
      break;
    case 'door':
      stats.doors++;
      break;
    case 'pet':
      stats.pets++;
      break;
    case 'secret':
      stats.secrets++;
      break;
    case 'victory':
      if (arcade) stats.wins++;
      break;
    case 'streak':
      stats.bestStreak = Math.max(stats.bestStreak, e.n);
      break;
  }
  const rewards: Rewards = { stickers: [], costumes: [] };
  for (const s of STICKERS) {
    if (earned.has(s.id)) continue;
    const [cur, goal] = s.progress(stats);
    if (cur >= goal) {
      earned.add(s.id);
      rewards.stickers.push(s);
    }
  }
  if (e.type === 'reach' && arcade) {
    for (const c of COSTUMES) {
      if (e.level >= c.level && !unlocked.has(c.id)) {
        unlocked.add(c.id);
        rewards.costumes.push(c.id);
      }
    }
  }
  return rewards;
}

/** Stats are written in batches (end of level / game) to keep storage writes rare. */
export function flush() {
  write(STATS_KEY, stats);
  write(STICKERS_KEY, { list: [...earned] });
  write(UNLOCK_KEY, { list: [...unlocked] });
}

// ------------------------------------------------------------ daily ghost replay

/** Samples every 0.1 s of play: [x*20, y*20, face] packed per stage. */
export interface GhostRun {
  day: string;
  minder: string;
  score: number;
  stages: number[][];
}

const GHOST_KEY = 'hm.ghost';

export function loadGhost(day: string): GhostRun | null {
  const g = read<GhostRun | { day: '' }>(GHOST_KEY, { day: '' });
  return g.day === day && 'stages' in g ? g : null;
}

export function saveGhost(run: GhostRun) {
  write(GHOST_KEY, run);
}
