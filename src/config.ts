export const MAX_LEVEL = 100;
export const ANNIVERSARY_LEVEL = 12;
/** Level 6 is the Halloween Game: red light, green light with a giant doll. */
export const SQUID_LEVEL = 6;
export const LEVEL_TIME = 120;
export const EFFECT_TIME = 10;
export const SHARE_URL = 'https://mindera.github.io/Halloween-Minder/';

export const START_BOMBS = 3;
export const MAX_BOMBS = 5;
export const BOMB_FUSE = 2;
export const BOMB_RADIUS = 1.8;

export type GameMode = 'arcade' | 'daily';
/** The Daily Challenge is three stages played at these difficulty levels (the last one brings the boss). */
export const DAILY_STAGES = [4, 7, 10];
/** Fixed maze size so everyone gets exactly the same daily mazes, whatever their screen. */
export const DAILY_DIMS = { w: 15, h: 21 };

/** Today's date in UTC, so the whole world shares the same daily challenge. */
export function dailyKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function dailySeed(key: string): number {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export interface MinderDef {
  id: string;
  /** Iris colour of the eyeballs this minder shoots. */
  iris: string;
  /** Where the eye sits in the picture (0..1), so tears come out of the right place. */
  eye: [number, number];
}

export const MINDERS: MinderDef[] = [
  { id: 'classic', iris: '#3a7bd5', eye: [0.5, 0.33] },
  { id: 'pumpkin', iris: '#ff8c1a', eye: [0.5, 0.45] },
  { id: 'franken', iris: '#2ecc40', eye: [0.48, 0.33] },
  { id: 'boo', iris: '#8e44ad', eye: [0.55, 0.32] },
  { id: 'slime', iris: '#27ae60', eye: [0.47, 0.33] },
  { id: 'fuzzy', iris: '#c0392b', eye: [0.5, 0.42] },
  { id: 'shadow', iris: '#111111', eye: [0.5, 0.33] },
  { id: 'scientist', iris: '#16a085', eye: [0.5, 0.33] },
  { id: 'doctor', iris: '#2980b9', eye: [0.5, 0.42] },
  { id: 'cowboy', iris: '#8b5a2b', eye: [0.5, 0.52] },
  { id: 'gamer', iris: '#e74c3c', eye: [0.5, 0.43] },
  { id: 'rocket', iris: '#f39c12', eye: [0.5, 0.35] },
  { id: 'bow', iris: '#1abc9c', eye: [0.5, 0.47] },
];

const BOSS_EVERY_LEVELS = 10;

export type EnemyKind =
  | 'zombie'
  | 'pumpkin'
  | 'minipumpkin'
  | 'skeleton'
  | 'bat'
  | 'ghost'
  | 'witch'
  | 'mummy'
  | 'vampire'
  | 'cousin';

export interface EnemyDef {
  /** Base speed in tiles per second, before the level multiplier. */
  speed: number;
  hp: number;
  points: number;
  /** Flies or floats through walls. */
  phases: boolean;
  /** First level this monster can appear on. */
  unlock: number;
  weight: number;
  /** How smart it is compared to the level baseline (added to the chase probability). */
  smarts: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  zombie: { speed: 2.3, hp: 1, points: 100, phases: false, unlock: 1, weight: 4, smarts: 0.25 },
  pumpkin: { speed: 3.0, hp: 1, points: 150, phases: false, unlock: 1, weight: 3, smarts: 0 },
  minipumpkin: { speed: 3.8, hp: 1, points: 50, phases: false, unlock: 99, weight: 0, smarts: -0.2 },
  skeleton: { speed: 3.6, hp: 1, points: 150, phases: false, unlock: 2, weight: 3, smarts: 0.05 },
  bat: { speed: 4.2, hp: 1, points: 120, phases: false, unlock: 3, weight: 2, smarts: -0.3 },
  ghost: { speed: 1.7, hp: 1, points: 200, phases: true, unlock: 4, weight: 2, smarts: 0 },
  witch: { speed: 1.9, hp: 2, points: 300, phases: true, unlock: 6, weight: 1.5, smarts: 0 },
  mummy: { speed: 2.0, hp: 3, points: 300, phases: false, unlock: 8, weight: 1.5, smarts: 0.3 },
  vampire: { speed: 3.2, hp: 2, points: 400, phases: false, unlock: 10, weight: 1.2, smarts: 0.2 },
  // The ultimate boss, Palos' cousin: a perfectly normal person. Never picked at random, see BOSS_EVERY.
  cousin: { speed: 2.5, hp: 10, points: 5000, phases: false, unlock: BOSS_EVERY_LEVELS, weight: 0, smarts: 0.45 },
};

/** Palos' cousin shows up at the end of every 10th level (and of level 100). */
export const BOSS_EVERY = BOSS_EVERY_LEVELS;
/** Optional photo for Palos' cousin, e.g. 'boss/palos-cousin.png' in public/. Empty = cartoon drawing. */
export const BOSS_PHOTO = '';

export type ItemKind = 'cricket' | 'spice' | 'pig' | 'eclair' | 'beer' | 'computer' | 'coffee' | 'roach' | 'rabbit' | 'bomb' | 'candy' | 'cake';

export interface ItemDef {
  weight: number;
  /** Instant items give points only and have no timed effect. */
  instant?: boolean;
}

/** Weights are counts in a shuffled bag, so every item shows up before any repeats. */
export const ITEMS: Record<ItemKind, ItemDef> = {
  cricket: { weight: 2 },
  spice: { weight: 3 },
  pig: { weight: 3 },
  eclair: { weight: 3 },
  beer: { weight: 2 },
  computer: { weight: 2 },
  coffee: { weight: 3 },
  roach: { weight: 2 },
  rabbit: { weight: 2 },
  bomb: { weight: 2, instant: true },
  candy: { weight: 2, instant: true },
  cake: { weight: 0, instant: true },
};



export type ThemeId = 'graveyard' | 'pumpkins' | 'haunted' | 'forest' | 'lab' | 'servers' | 'swamp' | 'castle' | 'party' | 'squid';

const THEME_ORDER: ThemeId[] = ['graveyard', 'pumpkins', 'haunted', 'forest', 'lab', 'servers', 'swamp', 'castle'];

export const THEME_LIST: ThemeId[] = ['graveyard', 'pumpkins', 'haunted', 'forest', 'lab', 'servers', 'swamp', 'castle'];


export function themeFor(level: number): ThemeId {
  if (level === ANNIVERSARY_LEVEL) return 'party';
  if (level === SQUID_LEVEL) return 'squid';
  return THEME_ORDER[(level - 1) % THEME_ORDER.length];
}

const LOOPS: Record<ThemeId, number> = {
  graveyard: 0.08, pumpkins: 0.14, haunted: 0.06, forest: 0.1, lab: 0.12, servers: 0.05, swamp: 0.16, castle: 0.08, party: 0, squid: 0.12,
};

/** Maze extras by level: crates from level 1, portals from 2, umbrellas from 3. */
export function featuresFor(level: number) {
  const theme = themeFor(level);
  return {
    loops: LOOPS[theme],
    room: theme === 'haunted' || theme === 'lab' || theme === 'castle',
    stage: theme === 'squid',
    crates: Math.min(0.3, 0.08 + level * 0.01),
    vaults: level < 6 ? 1 : 2,
    portals: level < 2 ? 0 : level < 7 ? 1 : 2,
    umbrellas: level < 3 ? 0 : Math.min(4, 2 + Math.floor(level / 8)),
    doors: level < 2 ? 1 : level < 15 ? 2 : 3,
  };
}

export interface Difficulty {
  speedMul: number;
  smart: number;
  total: number;
  maxActive: number;
  spawnEvery: number;
  hpBonus: number;
}

/** Ramps from friendly at level 1 to "good luck" well before level 100. */
export function difficulty(level: number): Difficulty {
  const l = Math.max(1, level);
  return {
    speedMul: 0.75 + 0.95 * (1 - Math.exp(-(l - 1) / 18)),
    smart: Math.min(0.97, 0.15 + (l - 1) * 0.035),
    total: Math.min(42, 4 + l + Math.floor(l / 4)),
    maxActive: Math.min(16, 3 + Math.floor(l / 2)),
    spawnEvery: Math.max(0.5, 3 - l * 0.09),
    hpBonus: Math.floor((l - 1) / 25),
  };
}
