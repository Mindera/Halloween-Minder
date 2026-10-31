export const MAX_LEVEL = 100;
export const ANNIVERSARY_LEVEL = 12;
export const LEVEL_TIME = 120;
export const EFFECT_TIME = 10;
export const SHARE_URL = 'https://mindera.github.io/Halloween-Minder/';

export interface MinderDef {
  id: string;
  name: string;
  tagline: string;
  /** Iris colour of the eyeballs this minder shoots. */
  iris: string;
}

export const MINDERS: MinderDef[] = [
  { id: 'classic', name: 'Classic Minder', tagline: 'The original. Never blinks.', iris: '#3a7bd5' },
  { id: 'pumpkin', name: 'Pumpkin Minder', tagline: 'Gourd-geously brave.', iris: '#ff8c1a' },
  { id: 'franken', name: 'Franken-Minder', tagline: "It's alive! And coding.", iris: '#2ecc40' },
  { id: 'boo', name: 'Boo Minder', tagline: 'Says BOO to bugs.', iris: '#8e44ad' },
  { id: 'slime', name: 'Slime Minder', tagline: 'Gooey but groovy.', iris: '#27ae60' },
  { id: 'fuzzy', name: 'Fuzzy Minder', tagline: 'Desperately needs a haircut.', iris: '#c0392b' },
  { id: 'shadow', name: 'Shadow Minder', tagline: 'Dark mode: ON.', iris: '#111111' },
  { id: 'scientist', name: 'Mad Scientist', tagline: 'Mwahaha-ha-hackathon!', iris: '#16a085' },
  { id: 'doctor', name: 'Dr. Minder', tagline: 'Fixes bugs. Literally.', iris: '#2980b9' },
  { id: 'cowboy', name: 'Cowboy Minder', tagline: 'Yee-haw! Deploys on Fridays.', iris: '#8b5a2b' },
  { id: 'gamer', name: 'Gamer Minder', tagline: 'Pro at eye-sports.', iris: '#e74c3c' },
  { id: 'rocket', name: 'Rocket Minder', tagline: 'Ships it to the moon.', iris: '#f39c12' },
  { id: 'bow', name: 'Bow Minder', tagline: 'Cute. Brave. Very cute.', iris: '#1abc9c' },
];

export type EnemyKind =
  | 'zombie'
  | 'pumpkin'
  | 'minipumpkin'
  | 'skeleton'
  | 'bat'
  | 'ghost'
  | 'witch'
  | 'mummy'
  | 'vampire';

export interface EnemyDef {
  name: string;
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
  deathLine: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  zombie: { name: 'Zombie', speed: 2.3, hp: 1, points: 100, phases: false, unlock: 1, weight: 4, smarts: 0.25, deathLine: 'A zombie gave you a big slobbery hug!' },
  pumpkin: { name: 'Pumpkin', speed: 3.0, hp: 1, points: 150, phases: false, unlock: 1, weight: 3, smarts: 0, deathLine: 'Squashed by a rolling pumpkin!' },
  minipumpkin: { name: 'Mini Pumpkin', speed: 3.8, hp: 1, points: 50, phases: false, unlock: 99, weight: 0, smarts: -0.2, deathLine: 'Nibbled by a tiny pumpkin!' },
  skeleton: { name: 'Skeleton', speed: 3.6, hp: 1, points: 150, phases: false, unlock: 2, weight: 3, smarts: 0.05, deathLine: 'Rattled to the bone by a skeleton!' },
  bat: { name: 'Bat', speed: 4.2, hp: 1, points: 120, phases: false, unlock: 3, weight: 2, smarts: -0.3, deathLine: 'Bat-tled a bat... and lost!' },
  ghost: { name: 'Ghost', speed: 1.7, hp: 1, points: 200, phases: true, unlock: 4, weight: 2, smarts: 0, deathLine: 'Booed right out of the maze!' },
  witch: { name: 'Witch', speed: 1.9, hp: 2, points: 300, phases: true, unlock: 6, weight: 1.5, smarts: 0, deathLine: 'Turned into a toad by a witch! Ribbit.' },
  mummy: { name: 'Mummy', speed: 2.0, hp: 3, points: 300, phases: false, unlock: 8, weight: 1.5, smarts: 0.3, deathLine: 'All wrapped up by a mummy!' },
  vampire: { name: 'Vampire', speed: 3.2, hp: 2, points: 400, phases: false, unlock: 10, weight: 1.2, smarts: 0.2, deathLine: 'A vampire wanted a byte!' },
};

export type ItemKind = 'cricket' | 'spice' | 'pig' | 'eclair' | 'beer' | 'computer' | 'coffee' | 'candy' | 'cake';

export interface ItemDef {
  name: string;
  toast: string;
  weight: number;
  /** Instant items give points only and have no timed effect. */
  instant?: boolean;
}

export const ITEMS: Record<ItemKind, ItemDef> = {
  cricket: { name: 'Cricket', toast: 'CRICKET! Chirp chirp... nearby monsters go bonkers!', weight: 3 },
  spice: { name: 'Hot Spice', toast: 'HOT SPICE! Turbo red mode!', weight: 3 },
  pig: { name: 'Pig', toast: 'PIG! Big belly bounces monsters away!', weight: 3 },
  eclair: { name: 'Eclair', toast: 'ECLAIR! The monsters ate way too much...', weight: 3 },
  beer: { name: 'Root Beer', toast: 'ROOT BEER! Whoa... everything is wobbly. Hic!', weight: 2 },
  computer: { name: 'Computer', toast: 'COMPUTER! Monsters got the Blue Screen of Death!', weight: 2 },
  coffee: { name: 'Coffee', toast: 'COFFEE! Rapid-fire eyeballs!', weight: 3 },
  candy: { name: 'Candy', toast: 'CANDY! +1000 sweet points!', weight: 2, instant: true },
  cake: { name: 'Birthday Cake', toast: 'HAPPY 12TH BIRTHDAY MINDERA! +1200!', weight: 0, instant: true },
};

export const KILL_WORDS = ['BONK!', 'SPLAT!', 'POP!', 'BOOM!', 'YIKES!', 'BYE!', 'OUCH!', '404!', 'DELETED!', 'Ctrl+Z!', 'GG!', 'BOING!'];

export const LEVEL_QUIPS = [
  'Monsters are compiling...',
  'Trick or tree-shake!',
  'Boo-ting up...',
  'Spooky deploy in progress',
  'Have you tried turning it off and on again?',
  'No bugs allowed (except the snacks)',
  'Merge conflict with the undead!',
  'It works on my crypt.',
  'Git push --force the monsters out!',
  '404: Courage not found. Just kidding!',
];

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
