import { CHANT_TIME, audio, type Sfx } from './audio';
import {
  ANNIVERSARY_LEVEL,
  BOMB_FUSE,
  BOMB_RADIUS,
  BOSS_EVERY,
  DAILY_DIMS,
  DAILY_STAGES,
  EFFECT_TIME,
  ENEMIES,
  ITEMS,
  LEVEL_TIME,
  MAX_BOMBS,
  MAX_LEVEL,
  START_BOMBS,
  THEME_LIST,
  dailyKey,
  dailySeed,
  difficulty,
  featuresFor,
  themeFor,
  type Difficulty,
  type EnemyKind,
  type GameMode,
  type ItemKind,
  type ThemeId,
} from './config';
import { buzz, type Buzz } from './feedback';
import { say, ta, type Msg } from './i18n';
import type { Input, Pad } from './input';
import { CRATE, DIRS, OPEN, bfsFrom, generateAnniversaryMaze, generateMaze, isWall, makeRng, opposite, type Maze, type Point } from './maze';
import { settings, type GameEvent, type GhostRun } from './progress';
import { PARTY_PELLET_KINDS, PELLET_KINDS } from './sprites';

export interface Mover {
  x: number;
  y: number;
  dir: number;
  /** Tile we just teleported onto (so we don't bounce straight back), or -1. */
  portal: number;
}

export type Emote = 'none' | 'cheer' | 'cry';

export interface Player extends Mover {
  /** 0 = player 1, 1 = player 2 (co-op). */
  id: number;
  next: number;
  face: number;
  recoil: number;
  invuln: number;
  walk: number;
  alive: boolean;
  cooldown: number;
  emote: Emote;
  emoteTime: number;
}

export interface Enemy extends Mover {
  id: number;
  kind: EnemyKind;
  hp: number;
  rising: number;
  stun: number;
  mad: number;
  flash: number;
  wobble: number;
  walk: number;
  face: number;
  /** Damage taken from anything but bombs (for the "beat the boss with only bombs" sticker). */
  eyeHits: number;
}

/**
 * A foosball (bola de matraquilhos): it bounces along with a height of its own. Low, it ricochets off walls;
 * high, it sails over them, or lands on top of one and bounces along it. It knocks out every monster it touches.
 */
export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Height above the floor, in tiles. */
  z: number;
  vz: number;
  spin: number;
  life: number;
  owner: number;
  /** Palos' cousin is only hit once in a while by the same ball. */
  bossCool: number;
}

/** A monster about to come out of a spawn tile: players see the warning for WARN_TIME seconds first. */
export interface SpawnWarning {
  /** The spawn tile. */
  x: number;
  y: number;
  kind: EnemyKind;
  /** Seconds until the monster starts rising out of the ground. */
  left: number;
}

/** How long the warning shows before a monster comes out (it then takes another 0.9 s to rise). */
export const WARN_TIME = 2.5;

/** A tiny friendly bat or ghost that follows its minder and shoots for a while. */
export interface Pet {
  owner: number;
  kind: 'bat' | 'ghost';
  x: number;
  y: number;
  life: number;
  cooldown: number;
}

export interface PetShot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  owner: number;
}

export interface Door {
  x: number;
  y: number;
  open: boolean;
}

export interface Eye {
  id: number;
  x: number;
  y: number;
  dir: number;
  spin: number;
  portal: number;
  /** Which player fired it (for the iris colour). */
  owner: number;
  /** A fireball (chocolate): burns through every monster in its way and smashes crates in one hit. */
  fire: boolean;
  /** Monsters this fireball already burned, so each one is only hit once. */
  burned?: number[];
}

export interface Bomb {
  x: number;
  y: number;
  fuse: number;
}

export interface Umbrella {
  x: number;
  y: number;
  /** Seconds left open; while open, whatever is underneath is hidden. */
  open: number;
  cool: number;
  /** 0 = closed, 1 = fully open (for the animation). */
  anim: number;
}

export interface Item extends Mover {
  kind: ItemKind;
  life: number;
  max: number;
}

export type ParticleKind = 'dot' | 'confetti' | 'note' | 'flame' | 'star' | 'rocket' | 'spark' | 'debris' | 'shock';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  rot: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  size: number;
}

export type Phase = 'intro' | 'play' | 'clear' | 'dying' | 'over' | 'won';

/** Red light, green light (level 6): the doll sings (green), turns round, then watches (red). */
export type Light = 'green' | 'turn' | 'red';

/** A laser from the doll's eyes to where she caught a minder moving. */
export interface Zap {
  x: number;
  y: number;
  life: number;
}

/** A sound, popup, burst or map change that the other phone has to replay in a networked game (see `Game.onFx`). */
export type Fx =
  | { t: 'sfx'; s: Sfx }
  | { t: 'buzz'; k: Buzz }
  | { t: 'music' }
  | { t: 'pop'; x: number; y: number; m: Msg; c: string; z: number }
  | { t: 'burst'; x: number; y: number; c: string[]; n: number; z: number; k: ParticleKind }
  | { t: 'confetti'; n: number }
  | { t: 'rocket' }
  | { t: 'debris'; x: number; y: number }
  | { t: 'shock'; x: number; y: number }
  | { t: 'pellet'; i: number }
  | { t: 'crate'; i: number; hp: number };

export interface GameCallbacks {
  toast(text: Msg, color?: string): void;
  levelIntro(level: number): void;
  levelClear(level: number, bonus: number): void;
  gameOver(reason: Msg): void;
  victory(): void;
  /** Progress events for stats, stickers and costume unlocks. */
  event(e: GameEvent): void;
}

/** Everything the other phone needs to show a new level in a networked game. */
export interface LevelInfo {
  mode: GameMode;
  level: number;
  stage: number;
  day: string;
  theme: ThemeId;
  w: number;
  h: number;
  walls: number[];
  pellets: number[];
  crateHp: number[];
  spawns: Point[];
  start: Point;
  portals: [Point, Point][];
  umbrellas: Point[];
  doors: Point[];
}

export interface StartOptions {
  mode: GameMode;
  players: 1 | 2;
  level?: number;
}

const PLAYER_SPEED = 5.2;
/** Foosballs: speed (tiles/s), how long each one bounces about, how high a wall is, and gravity for the hops. */
const BALL_SPEED = 10;
const BALL_LIFE = 4;
const WALL_TOP = 0.35;
const BALL_GRAVITY = 20;
const BALL_R = 0.18;
/** A side turn asked for up to this far (in tiles) after passing a junction still takes it, by cutting the corner. */
const CORNER_GRACE = 0.45;
const EYE_SPEED = 11;
const SPLAT: Record<EnemyKind, string[]> = {
  zombie: ['#86c66b', '#5b7fa3', '#9ad97a'],
  pumpkin: ['#ff8c1a', '#ffa646', '#4a7a2a'],
  minipumpkin: ['#ff8c1a', '#ffa646'],
  skeleton: ['#f4f1e8', '#cfc9b8'],
  bat: ['#4a2f6b', '#2b1b3d'],
  ghost: ['#ffffff', '#e0e0ff'],
  witch: ['#7ccf4f', '#5b2a86', '#ff9f1a'],
  mummy: ['#e8dfc4', '#b8ab8a'],
  vampire: ['#b3123a', '#14081f', '#ece4f5'],
  cousin: ['#4fc3f7', '#c8a97e', '#f1c27d'],
};
const CONFETTI = ['#ffd400', '#ff4081', '#40c4ff', '#69f0ae', '#ff9100', '#e040fb'];
const CRATE_HP = 2;
/** Palos' cousin loses this many hit points to a bomb (everything else is bonked outright). */
const BOMB_BOSS_DAMAGE = 3;
const PET_CHANCE = 0.1;
const PET_LIFE = 15;
/** Red light, green light: how long the doll takes to turn round, how long she watches, and the moment you get to let go. */
const TURN_TIME = 0.8;
const RED_TIME = [2, 3.4];
const RED_GRACE = 0.3;
/** How long the "caught" moment lasts before the game-over screen, and when the sad tune starts (after the monster's laugh). */
const DYING_TIME = 2.6;
const LAUGH_TIME = 1.3;
/** Bonks at most this many seconds apart make a streak ("×2", "×3"...): 5 in a row earns the Manita sticker. */
const STREAK_GAP = 4;
/** The daily ghost is sampled every 0.1 s: x*20, y*20, face. */
const GHOST_STEP = 0.1;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
/** On-screen text as an i18n key (see `Msg`), optionally followed by `s`. */
const msg = (k: string, p?: Record<string, string | number>, s?: string): Msg => ({ k, p, s });
/** A random entry of the i18n list `k`. */
const anyOf = (k: string, s?: string): Msg => ({ k, i: Math.floor(Math.random() * ta(k).length), s });
const suffix = (m: Msg, s: string): Msg => (typeof m === 'string' ? m + s : { ...m, s: (m.s ?? '') + s });

export class Game {
  mode: GameMode = 'arcade';
  coop = false;
  /** Daily Challenge stage (0-based). */
  stage = 0;
  day = '';
  level = 1;
  score = 0;
  phase: Phase = 'intro';
  phaseTime = 0;
  time = 0;
  timeLeft = LEVEL_TIME;
  maze!: Maze;
  /** -1 = no pellet, otherwise the pellet sprite index. */
  pellets!: Int8Array;
  pelletCount = 0;
  players: Player[] = [];
  enemies: Enemy[] = [];
  /** Monsters about to come out (they already left the queue). */
  warnings: SpawnWarning[] = [];
  eyes: Eye[] = [];
  balls: Ball[] = [];
  bombs: Bomb[] = [];
  bombStock = START_BOMBS;
  item: Item | null = null;
  particles: Particle[] = [];
  popups: Popup[] = [];
  /** Red light, green light on level 6 (`lightLeft` counts down from `lightLen`). */
  light: Light = 'green';
  lightLeft = 0;
  lightLen = 0;
  zaps: Zap[] = [];
  effects = new Map<ItemKind, number>();
  deathReason: Msg = '';
  killer: EnemyKind | null = null;
  kills = 0;
  theme: ThemeId = 'graveyard';
  umbrellas: Umbrella[] = [];
  /** Hits left on each crate tile. */
  crateHp!: Uint8Array;
  /** Teleport destination per tile, or -1. */
  links!: Int32Array;
  /** Seconds of screen shake left (bombs). */
  shake = 0;
  doors: Door[] = [];
  pets: Pet[] = [];
  petShots: PetShot[] = [];
  /** Jump-scare ghost on screen (seconds left). */
  scare = 0;
  /** Reversed controls from a trick (seconds left). */
  reverse = 0;
  /** Seconds of play in the current level/stage (drives the daily ghost). */
  stageClock = 0;
  /** This run's recording, one sample list per daily stage. */
  recording: number[][] = [];
  /** Best run of the day to race against (Daily Challenge, single player). */
  ghostRun: GhostRun | null = null;
  ghost: number[] | null = null;
  /** Networked co-op, host phone: gets every effect so it can be replayed on the other phone. */
  onFx?: (fx: Fx) => void;
  /** Networked co-op, other phone: the host runs the game and this one only shows it (see `net/sync.ts`). */
  remote = false;
  /** Monsters still waiting to come out, as reported by the host (remote only). */
  remoteQueued = 0;

  private diff!: Difficulty;
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;
  private itemTimer = 0;
  private distMap!: Int16Array;
  private distFrom = '';
  private nextId = 1;
  private lastTick = 0;
  private hintedPellets = false;
  private hintedEnemies = false;
  private cakeGiven = false;
  /** Monsters bonked in a row, and when the last one went. */
  private streak = 0;
  private lastKill = -99;
  private bag: ItemKind[] = [];
  private lastItem: ItemKind | null = null;
  private hints = new Set<string>();
  /** Minders the doll already caught during this red light. */
  private caught = new Set<number>();
  /** While the cockroach "bug" is active, input directions are remapped through this. */
  private scramble = [0, 1, 2, 3];
  private scrambleTimer = 0;
  private seed = Math.floor(Math.random() * 1e9);
  private recordTimer = 0;
  /** Level-content randomness: seeded in the Daily Challenge so everyone gets the same monsters and items. */
  private rnd: () => number = Math.random;

  constructor(
    private input: Input,
    private cb: GameCallbacks,
    private dims: () => { w: number; h: number },
  ) {}

  /** Player 1 (kept for code that only cares about one minder). */
  get player(): Player {
    return this.players[0];
  }

  get squid() {
    return this.theme === 'squid';
  }

  get party() {
    return this.mode === 'arcade' && this.level === ANNIVERSARY_LEVEL;
  }

  get daily() {
    return this.mode === 'daily';
  }

  get enemiesLeft() {
    return (this.remote ? this.remoteQueued : this.queue.length + this.warnings.length) + this.enemies.length;
  }

  has(kind: ItemKind) {
    return (this.effects.get(kind) ?? 0) > 0;
  }

  start(opts: StartOptions) {
    this.mode = opts.mode;
    this.coop = opts.players === 2;
    this.score = 0;
    this.kills = 0;
    this.stage = 0;
    this.hints.clear();
    this.bag = [];
    this.lastItem = null;
    this.bombStock = START_BOMBS - 1;
    this.players = [];
    this.recording = [];
    if (this.daily) {
      this.day = dailyKey();
      this.seed = dailySeed(this.day);
      this.startLevel(DAILY_STAGES[0]);
    } else {
      this.seed = Math.floor(Math.random() * 1e9);
      this.startLevel(opts.level ?? 1);
    }
  }

  startLevel(level: number) {
    this.level = level;
    const { w, h } = this.daily ? DAILY_DIMS : this.dims();
    const rng = makeRng(this.seed + level * 7919);
    this.rnd = this.daily ? makeRng(this.seed ^ (level * 104729)) : Math.random;
    this.theme = this.daily ? THEME_LIST[(this.seed + this.stage * 3) % THEME_LIST.length] : themeFor(level);
    const features = featuresFor(level);
    this.maze = this.party ? generateAnniversaryMaze(w, h, rng, features) : generateMaze(w, h, rng, features);
    const m = this.maze;
    this.linkPortals();
    this.crateHp = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (m.walls[i] === CRATE) this.crateHp[i] = CRATE_HP;
    this.umbrellas = m.umbrellas.map((u) => ({ x: u.x + 0.5, y: u.y + 0.5, open: 0, cool: 0, anim: 0 }));
    this.pellets = new Int8Array(w * h).fill(-1);
    this.pelletCount = 0;
    const kinds = this.party ? PARTY_PELLET_KINDS : PELLET_KINDS;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isWall(m, x, y)) continue;
        if (x === m.start.x && y === m.start.y) continue;
        if (this.links[y * w + x] >= 0) continue;
        if (m.doors.some((d) => d.x === x && d.y === y)) continue;
        if (m.spawns.some((s) => s.x === x && s.y === y)) continue;
        this.pellets[y * w + x] = Math.floor(rng() * kinds);
        this.pelletCount++;
      }
    }
    // Everybody is back for the new level (in co-op a knocked-out player returns).
    const starts = this.coop ? [this.startTile(0), this.startTile(1)] : [m.start];
    this.players = starts.map((s, id) => ({
      id,
      x: s.x + 0.5,
      y: s.y + 0.5,
      dir: -1,
      portal: -1,
      next: -1,
      face: 0,
      recoil: 0,
      invuln: 2.5,
      walk: 0,
      alive: true,
      cooldown: 0,
      emote: 'none',
      emoteTime: 0,
    }));
    this.bombStock = Math.min(MAX_BOMBS, this.bombStock + 1);
    this.bombs = [];
    this.doors = m.doors.map((d) => ({ x: d.x, y: d.y, open: false }));
    this.pets = [];
    this.petShots = [];
    this.scare = 0;
    this.reverse = 0;
    this.stageClock = 0;
    this.recordTimer = 0;
    this.light = 'green';
    this.lightLeft = this.lightLen = 0;
    this.zaps = [];
    if (this.daily && !this.coop) {
      this.recording[this.stage] = [];
      this.ghost = this.ghostRun?.stages[this.stage] ?? null;
    } else this.ghost = null;
    if (!this.daily) this.cb.event({ type: 'reach', level });
    this.enemies = [];
    this.warnings = [];
    this.eyes = [];
    this.balls = [];
    this.item = null;
    this.popups = [];
    this.effects.clear();
    this.diff = difficulty(level);
    this.queue = this.buildQueue();
    this.spawnTimer = 1.2;
    this.itemTimer = 5 + this.rnd() * 5;
    this.timeLeft = LEVEL_TIME;
    this.distMap = new Int16Array(w * h);
    this.distFrom = '';
    this.hintedPellets = false;
    this.hintedEnemies = false;
    this.cakeGiven = false;
    this.streak = 0;
    this.input.reset();
    this.phase = 'intro';
    this.phaseTime = 2.4;
    this.cb.levelIntro(level);
  }

  private linkPortals() {
    const { w, h, portals } = this.maze;
    this.links = new Int32Array(w * h).fill(-1);
    for (const [a, b] of portals) {
      this.links[a.y * w + a.x] = b.y * w + b.x;
      this.links[b.y * w + b.x] = a.y * w + a.x;
    }
  }

  /** The level as it is right now, for the other phone in a networked game. */
  levelInfo(): LevelInfo {
    const m = this.maze;
    return {
      mode: this.mode,
      level: this.level,
      stage: this.stage,
      day: this.day,
      theme: this.theme,
      w: m.w,
      h: m.h,
      walls: [...m.walls],
      pellets: [...this.pellets],
      crateHp: [...this.crateHp],
      spawns: m.spawns,
      start: m.start,
      portals: m.portals,
      umbrellas: m.umbrellas,
      doors: m.doors,
    };
  }

  /** Shows a level the host phone just started (remote only: monsters and minders come in with the snapshots). */
  loadLevel(l: LevelInfo) {
    this.mode = l.mode;
    this.coop = true;
    this.level = l.level;
    this.stage = l.stage;
    this.day = l.day;
    this.theme = l.theme;
    this.maze = {
      w: l.w, h: l.h, walls: Uint8Array.from(l.walls), spawns: l.spawns, start: l.start,
      portals: l.portals, umbrellas: l.umbrellas, doors: l.doors,
    };
    this.linkPortals();
    this.pellets = Int8Array.from(l.pellets);
    this.pelletCount = l.pellets.filter((p) => p >= 0).length;
    this.crateHp = Uint8Array.from(l.crateHp);
    this.umbrellas = l.umbrellas.map((u) => ({ x: u.x + 0.5, y: u.y + 0.5, open: 0, cool: 0, anim: 0 }));
    this.doors = l.doors.map((d) => ({ x: d.x, y: d.y, open: false }));
    this.players = [];
    this.enemies = [];
    this.warnings = [];
    this.eyes = [];
    this.balls = [];
    this.bombs = [];
    this.pets = [];
    this.petShots = [];
    this.item = null;
    this.popups = [];
    this.effects.clear();
    this.scare = 0;
    this.reverse = 0;
    this.light = 'green';
    this.lightLeft = this.lightLen = 0;
    this.zaps = [];
    this.ghost = null;
    this.phase = 'intro';
  }

  private buildQueue(): EnemyKind[] {
    const pool = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].unlock <= this.level && ENEMIES[k].weight > 0);
    const total = pool.reduce((s, k) => s + ENEMIES[k].weight, 0);
    const q: EnemyKind[] = [];
    // A newly unlocked monster always shows up on its debut level.
    const debut = pool.find((k) => ENEMIES[k].unlock === this.level);
    if (debut) q.push(debut);
    while (q.length < this.diff.total + (this.coop ? 2 : 0)) {
      let r = this.rnd() * total;
      for (const k of pool) {
        r -= ENEMIES[k].weight;
        if (r <= 0) {
          q.push(k);
          break;
        }
      }
    }
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    // The queue is popped from the end, so the boss at the front arrives last.
    if (this.level % BOSS_EVERY === 0) q.unshift('cousin');
    return q;
  }

  // ------------------------------------------------------------ update

  update(dt: number) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    for (const p of this.players) if (p.emote !== 'none') p.emoteTime += dt;
    this.updateParticles(dt);
    this.zaps = this.zaps.filter((z) => (z.life -= dt) > 0);
    this.ambience(dt);
    if (this.remote) return;
    switch (this.phase) {
      case 'intro':
        this.phaseTime -= dt;
        if (this.phaseTime <= 0) {
          this.phase = 'play';
          this.showHints();
          if (this.squid) this.greenLight();
        }
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'clear':
        this.phaseTime -= dt;
        if (this.phaseTime <= 0) this.nextLevel();
        break;
      case 'dying': {
        const before = this.phaseTime;
        this.phaseTime -= dt;
        const tune = DYING_TIME - LAUGH_TIME;
        if (before > tune && this.phaseTime <= tune) this.sfx('death');
        if (this.phaseTime <= 0) {
          this.phase = 'over';
          this.cb.gameOver(this.deathReason);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Sparkle each phone makes for itself (it isn't sent to the other phone in a networked game). */
  private ambience(dt: number) {
    if (this.phase === 'clear') {
      if (Math.random() < dt * 30) this.playFx({ t: 'confetti', n: 1 });
      if (this.party && Math.random() < dt * 4) this.playFx({ t: 'rocket' });
      return;
    }
    if (this.phase !== 'play') return;
    // The ground rumbles where a monster is about to come out, harder as it gets closer.
    if (!this.squid || this.light === 'green') {
      for (const w of this.warnings) {
        const k = 1 - w.left / WARN_TIME;
        if (Math.random() > dt * (5 + k * 20)) continue;
        this.particles.push({
          kind: 'debris', x: w.x + 0.5 + rand(-0.3, 0.3), y: w.y + 0.7, vx: rand(-1.2, 1.2), vy: rand(-3.5, -1.5),
          life: 0.45, max: 0.45, color: pick(['#5d4037', '#8d6e63', '#3e2723']), size: rand(0.05, 0.09), rot: rand(0, 6),
        });
      }
    }
    if (this.squid && this.light === 'green' && Math.random() < dt * 2.5) {
      // The doll is singing.
      this.particles.push({
        kind: 'note', x: this.maze.w / 2 + rand(-0.7, 0.7), y: 0.9, vx: rand(-0.8, 0.8), vy: rand(0.1, 0.5),
        life: 1.2, max: 1.2, color: '#ff80ab', size: 0.4, rot: 0,
      });
    }
    for (const e of this.eyes) {
      if (!e.fire || Math.random() > dt * 40) continue;
      this.particles.push({
        kind: 'flame', x: e.x + rand(-0.12, 0.12), y: e.y + rand(-0.12, 0.12), vx: rand(-0.4, 0.4), vy: rand(-1, -0.3),
        life: 0.35, max: 0.35, color: pick(['#ff3d00', '#ff9100', '#ffea00']), size: rand(0.08, 0.14), rot: 0,
      });
    }
    for (const p of this.alivePlayers()) {
      if (this.has('choco') && Math.random() < dt * 7) {
        // Little puffs of fire and smoke from the minder's mouth.
        const d = DIRS[p.face];
        this.particles.push({
          kind: 'flame', x: p.x + d.x * 0.35, y: p.y + d.y * 0.35 - 0.05, vx: d.x * 0.8 + rand(-0.3, 0.3), vy: d.y * 0.8 - rand(0.3, 0.8),
          life: 0.5, max: 0.5, color: pick(['#ff9100', '#ffea00', '#9e9e9e']), size: rand(0.06, 0.11), rot: 0,
        });
      }
      if (this.has('spice') && Math.random() < dt * 25) {
        this.particles.push({
          kind: 'flame', x: p.x + rand(-0.2, 0.2), y: p.y + 0.3, vx: rand(-0.3, 0.3), vy: rand(0.2, 0.8),
          life: 0.5, max: 0.5, color: pick(['#ff3d00', '#ff9100', '#ffea00']), size: rand(0.08, 0.16), rot: 0,
        });
      }
      if (this.has('cricket') && Math.random() < dt * 4) {
        this.particles.push({
          kind: 'note', x: p.x + rand(-1, 1), y: p.y + rand(-1, 0), vx: rand(-0.5, 0.5), vy: -1,
          life: 1, max: 1, color: '#b2ff59', size: 0.4, rot: 0,
        });
      }
    }
  }

  private nextLevel() {
    if (this.daily) {
      if (this.stage >= DAILY_STAGES.length - 1) {
        this.cb.event({ type: 'dailyClear' });
        return this.win();
      }
      this.stage++;
      return this.startLevel(DAILY_STAGES[this.stage]);
    }
    if (this.level >= MAX_LEVEL) {
      this.cb.event({ type: 'victory' });
      return this.win();
    }
    this.startLevel(this.level + 1);
  }

  private win() {
    this.phase = 'won';
    for (const p of this.players) this.emote(p, 'cheer');
    this.cb.victory();
  }

  private alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  /** The closest minder that is still in the game. */
  nearestPlayer(x: number, y: number): Player {
    let best = this.players[0];
    let bd = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = Math.abs(p.x - x) + Math.abs(p.y - y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private updatePlay(dt: number) {
    // While the doll is looking, everything holds still (the clock too).
    if (this.squid && this.updateLight(dt)) return;
    this.timeLeft -= dt;
    this.stageClock += dt;
    this.scare = Math.max(0, this.scare - dt);
    this.reverse = Math.max(0, this.reverse - dt);
    if (this.recording[this.stage] && this.daily && !this.coop) {
      this.recordTimer -= dt;
      while (this.recordTimer <= 0) {
        const p = this.players[0];
        this.recording[this.stage].push(Math.round(p.x * 20), Math.round(p.y * 20), p.face);
        this.recordTimer += GHOST_STEP;
      }
    }
    if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== this.lastTick) {
      this.lastTick = Math.ceil(this.timeLeft);
      this.sfx('tick');
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.die(msg('over.timeUp'), null);
      return;
    }

    for (const [k, t] of this.effects) {
      const nt = t - dt;
      if (nt <= 0) {
        this.effects.delete(k);
        if (k === 'lights') this.sfx('switch'); // ...and the lights come back on
      } else this.effects.set(k, nt);
    }
    if (this.has('roach')) {
      this.scrambleTimer -= dt;
      if (this.scrambleTimer <= 0) this.reshuffleControls();
    }

    for (const p of this.alivePlayers()) this.updatePlayer(p, this.input.pads[p.id], dt);
    this.updateEyes(dt);
    this.updateBalls(dt);
    this.updateBombs(dt);
    this.updatePets(dt);

    // Distance map for chasing monsters: distance to the nearest minder.
    const alive = this.alivePlayers();
    const key = alive.map((p) => Math.floor(p.y) * this.maze.w + Math.floor(p.x)).join(',');
    if (key !== this.distFrom) {
      bfsFrom(this.maze, alive.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })), this.distMap, this.links);
      this.distFrom = key;
    }

    this.updateEnemies(dt);
    if (this.phase !== 'play') return;

    // Spawning: a monster is announced first, and comes out WARN_TIME seconds later.
    this.spawnTimer -= dt;
    const active = this.enemies.length + this.warnings.length;
    if (this.spawnTimer <= 0 && this.queue.length && active < this.diff.maxActive + (this.coop ? 2 : 0)) {
      this.warnSpawn(this.queue.pop()!);
      this.spawnTimer = this.diff.spawnEvery;
    }
    for (const w of [...this.warnings]) {
      w.left -= dt;
      if (w.left > 0) continue;
      this.warnings.splice(this.warnings.indexOf(w), 1);
      this.spawnEnemy(w);
    }

    this.updateItem(dt);
    this.updateUmbrellas(dt);

    if (this.pelletCount === 0 && this.enemiesLeft > 0 && !this.hintedPellets) {
      this.hintedPellets = true;
      this.cb.toast(msg('toast.allBits'), '#69f0ae');
    }
    if (this.enemiesLeft === 0 && this.pelletCount > 0 && !this.hintedEnemies) {
      this.hintedEnemies = true;
      this.cb.toast(msg('toast.monstersGone'), '#69f0ae');
    }
    if (this.pelletCount === 0 && this.enemiesLeft === 0) this.levelClear();
  }

  private updatePlayer(p: Player, pad: Pad, dt: number) {
    p.invuln = Math.max(0, p.invuln - dt);
    p.recoil = Math.max(0, p.recoil - dt * 6);
    if (pad.dir >= 0) {
      let d = this.has('roach') ? this.scramble[pad.dir] : pad.dir;
      if (this.reverse > 0) d = opposite(d);
      p.next = d;
    }
    if (p.dir >= 0 && p.next === opposite(p.dir)) p.dir = p.next;
    this.cornerTurn(p);
    const speed = PLAYER_SPEED * (this.has('spice') ? 1.55 : 1) * (this.has('pig') ? 0.8 : 1);
    const before = p.x + p.y;
    this.advance(p, speed * dt, () => this.playerDecide(p));
    if (p.x + p.y !== before) p.walk += dt * speed;
    this.eatPellet(p);
    this.checkDoor(p);

    p.cooldown -= dt;
    const fire = pad.consumeFire();
    const maxEyes = (this.has('coffee') ? 7 : 3) * this.players.length;
    if (fire && p.cooldown <= 0 && this.has('foosball')) {
      if (this.balls.length < 4 * this.players.length) this.kickBall(p);
    } else if (fire && p.cooldown <= 0 && this.eyes.length < maxEyes) {
      const d = DIRS[p.face];
      const flame = this.has('choco');
      // An eyeball fired while standing on a portal shouldn't get warped by that same portal.
      this.eyes.push({
        id: this.nextId++, x: p.x + d.x * 0.3, y: p.y + d.y * 0.3, dir: p.face, spin: 0,
        portal: Math.floor(p.y) * this.maze.w + Math.floor(p.x), owner: p.id, fire: flame,
      });
      p.cooldown = this.has('coffee') ? 0.11 : 0.3;
      p.recoil = 1;
      if (flame) {
        this.burst(p.x + d.x * 0.4, p.y + d.y * 0.4 - 0.1, ['#ff3d00', '#ff9100', '#ffea00'], 8, 0.08, 'flame');
        this.sfx('flame');
      } else this.sfx('shoot');
    }
    if (pad.consumeBomb()) this.dropBomb(p);
  }

  /** Grid movement: entities travel between tile centres and choose a new direction at each centre. */
  private advance(m: Mover, dist: number, decide: () => void) {
    // Exactly one decision per tile centre, even when we land on it within float error.
    let decided = false;
    let guard = 0;
    while (dist > 1e-6 && guard++ < 12) {
      if (m.dir < 0) {
        m.x = Math.floor(m.x) + 0.5;
        m.y = Math.floor(m.y) + 0.5;
        decide();
        decided = true;
        if (m.dir < 0) return;
      }
      const d = DIRS[m.dir];
      const tx = Math.floor(m.x);
      const ty = Math.floor(m.y);
      const cx = tx + 0.5;
      const cy = ty + 0.5;
      const off = (m.x - cx) * d.x + (m.y - cy) * d.y;
      if (off < -1e-6) {
        const need = -off;
        if (dist < need) {
          m.x += d.x * dist;
          m.y += d.y * dist;
          return;
        }
        m.x = cx;
        m.y = cy;
        dist -= need;
        this.teleport(m);
        decide();
        decided = true;
        continue;
      }
      if (off <= 1e-6) {
        m.x = cx;
        m.y = cy;
        if (!decided) {
          this.teleport(m);
          decide();
          decided = true;
          continue;
        }
        if (isWall(this.maze, tx + d.x, ty + d.y)) {
          m.dir = -1;
          return;
        }
      }
      const need = 1 - Math.max(0, off);
      if (dist < need) {
        m.x += d.x * dist;
        m.y += d.y * dist;
        return;
      }
      m.x = cx + d.x;
      m.y = cy + d.y;
      dist -= need;
      this.teleport(m);
      decide();
      decided = true;
    }
  }

  /** Called whenever a walker reaches a tile centre. */
  private teleport(m: Mover) {
    const w = this.maze.w;
    const i = Math.floor(m.y) * w + Math.floor(m.x);
    if (m.portal === i) return;
    m.portal = -1;
    const to = this.links[i];
    if (to < 0) return;
    this.burst(m.x, m.y, ['#80deea', '#e1f5fe', '#b388ff'], 10, 0.07, 'star');
    m.x = (to % w) + 0.5;
    m.y = Math.floor(to / w) + 0.5;
    m.portal = to;
    this.burst(m.x, m.y, ['#80deea', '#e1f5fe', '#b388ff'], 10, 0.07, 'star');
    if (this.players.includes(m as Player)) {
      this.sfx('warp');
      this.distFrom = '';
      this.cb.event({ type: 'teleport' });
    }
  }

  private open(x: number, y: number, d: number) {
    return !isWall(this.maze, x + DIRS[d].x, y + DIRS[d].y);
  }

  /**
   * Forgiving turns (like the arcade classics): a side turn that comes in just after the minder passed the middle
   * of a junction is still taken. The minder cuts the corner instead of missing the turn and running on.
   */
  private cornerTurn(p: Player) {
    if (p.dir < 0 || p.next < 0 || p.next === p.dir || p.next === opposite(p.dir)) return;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    const d = DIRS[p.dir];
    const past = (p.x - tx - 0.5) * d.x + (p.y - ty - 0.5) * d.y;
    if (past <= 0 || past > CORNER_GRACE) return;
    // Not on a portal: the minder already came out of it at the middle of this tile.
    if (!this.open(tx, ty, p.next) || this.links[ty * this.maze.w + tx] >= 0) return;
    const n = DIRS[p.next];
    p.x = tx + 0.5 + n.x * past;
    p.y = ty + 0.5 + n.y * past;
    p.dir = p.face = p.next;
  }

  private playerDecide(p: Player) {
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (p.next >= 0) {
      const ahead = (ty + DIRS[p.next].y) * this.maze.w + tx + DIRS[p.next].x;
      if (this.open(tx, ty, p.next)) p.dir = p.next;
      else if (p.dir < 0) p.face = p.next;
      else if (p.next !== p.dir && this.maze.walls[ahead] === CRATE) {
        // Pushing towards a crate at the side: stop and face it so it can be shot.
        p.dir = -1;
        p.face = p.next;
      }
    }
    if (p.dir >= 0) {
      if (this.open(tx, ty, p.dir)) p.face = p.dir;
      else p.dir = -1;
    }
  }

  private eatPellet(p: Player) {
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (Math.abs(p.x - tx - 0.5) > 0.35 || Math.abs(p.y - ty - 0.5) > 0.35) return;
    const i = ty * this.maze.w + tx;
    if (this.pellets[i] < 0) return;
    this.fx({ t: 'pellet', i });
    this.pelletCount--;
    this.addScore(10);
    this.sfx('pellet');
  }

  private updateEyes(dt: number) {
    const speed = EYE_SPEED * (this.has('coffee') ? 1.25 : 1);
    const fatHit = this.has('eclair') ? 0.72 : 0.5;
    this.eyes = this.eyes.filter((e) => {
      const d = DIRS[e.dir];
      const steps = Math.ceil((speed * dt) / 0.25);
      for (let s = 0; s < steps; s++) {
        e.x += (d.x * speed * dt) / steps;
        e.y += (d.y * speed * dt) / steps;
        e.spin += dt * 12;
        const m = this.maze;
        const tx = Math.floor(e.x);
        const ty = Math.floor(e.y);
        const ti = ty * m.w + tx;
        if (this.links[ti] >= 0 && e.portal !== ti) {
          const to = this.links[ti];
          e.x = (to % m.w) + 0.5;
          e.y = Math.floor(to / m.w) + 0.5;
          e.portal = to;
        } else if (e.portal >= 0 && e.portal !== ti) {
          e.portal = -1;
        }
        const ax = Math.floor(e.x + d.x * 0.15);
        const ay = Math.floor(e.y + d.y * 0.15);
        if (isWall(m, ax, ay)) {
          if (m.walls[ay * m.w + ax] === CRATE) {
            // Fire smashes a crate in one go.
            if (e.fire) this.crateHp[ay * m.w + ax] = 1;
            this.hitCrate(ax, ay);
          }
          this.burst(e.x, e.y, e.fire ? ['#ff3d00', '#ff9100', '#ffea00'] : ['#ffffff', '#ffcdd2'], e.fire ? 10 : 5, 0.06, e.fire ? 'flame' : 'dot');
          return false;
        }
        for (const en of [...this.enemies]) {
          if (en.rising > 0 || e.burned?.includes(en.id)) continue;
          const r = fatHit * (en.kind === 'minipumpkin' ? 0.8 : en.kind === 'cousin' ? 1.5 : 1);
          if (Math.abs(en.x - e.x) < r && Math.abs(en.y - e.y) < r) {
            this.hitEnemy(en, 'eye', e.owner);
            if (!e.fire) return false;
            (e.burned ??= []).push(en.id);
          }
        }
      }
      return true;
    });
  }

  // ------------------------------------------------------------ foosballs

  /** Kicks a foosball off at an angle (so it bounces all over the maze) in the direction the minder faces. */
  private kickBall(p: Player) {
    const d = DIRS[p.face];
    const side = (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.65);
    const vx = d.x - d.y * side;
    const vy = d.y + d.x * side;
    const k = BALL_SPEED / Math.hypot(vx, vy);
    this.balls.push({
      id: this.nextId++, x: p.x + d.x * 0.3, y: p.y + d.y * 0.3, vx: vx * k, vy: vy * k,
      z: 0.05, vz: rand(4, 5.5), spin: 0, life: BALL_LIFE, owner: p.id, bossCool: 0,
    });
    p.cooldown = 0.35;
    p.recoil = 1;
    this.sfx('kick');
  }

  /** What a ball bounces on at (x, y): the floor (0), the top of a wall, or the edge of the maze (never cleared). */
  private surface(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.maze.w || ty >= this.maze.h) return Infinity;
    return isWall(this.maze, tx, ty) ? WALL_TOP : 0;
  }

  private updateBalls(dt: number) {
    this.balls = this.balls.filter((b) => {
      b.life -= dt;
      b.bossCool = Math.max(0, b.bossCool - dt);
      if (b.life <= 0) {
        this.burst(b.x, b.y, ['#ffffff', '#cfd8dc'], 6, 0.06);
        return false;
      }
      const steps = Math.ceil((BALL_SPEED * dt) / 0.1);
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        // Hop: it bounces on the floor, or on top of a wall.
        b.vz -= BALL_GRAVITY * h;
        b.z += b.vz * h;
        const under = this.surface(b.x, b.y);
        if (b.z <= under) {
          b.z = under;
          b.vz = rand(3.6, 5.6);
        }
        // Sideways: it ricochets off any wall it's too low to clear.
        const nx = b.x + b.vx * h;
        const ex = nx + Math.sign(b.vx) * BALL_R;
        if (this.surface(ex, b.y) > b.z) {
          this.ricochet(ex, b.y);
          b.vx = -b.vx;
        } else b.x = nx;
        const ny = b.y + b.vy * h;
        const ey = ny + Math.sign(b.vy) * BALL_R;
        if (this.surface(b.x, ey) > b.z) {
          this.ricochet(b.x, ey);
          b.vy = -b.vy;
        } else b.y = ny;
        b.spin += h * 18;
      }
      // Knocks out every monster it touches (Palos' cousin just loses a hit point now and then).
      for (const e of [...this.enemies]) {
        if (e.rising > 0 || Math.hypot(e.x - b.x, e.y - b.y) > 0.65) continue;
        if (e.kind === 'cousin') {
          if (b.bossCool > 0) continue;
          b.bossCool = 0.4;
          this.hitEnemy(e, 'eye', b.owner);
        } else this.killEnemy(e, anyOf('killWords'), 'eye', b.owner);
      }
      return true;
    });
  }

  /** A ball hit the side of a wall: a crate there takes a knock. */
  private ricochet(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx >= 0 && ty >= 0 && tx < this.maze.w && ty < this.maze.h && this.maze.walls[ty * this.maze.w + tx] === CRATE) this.hitCrate(tx, ty);
    else this.sfx('tok');
  }

  private hitCrate(x: number, y: number, force = false) {
    const m = this.maze;
    const i = y * m.w + x;
    const hp = force ? 0 : Math.max(0, this.crateHp[i] - 1);
    this.fx({ t: 'crate', i, hp });
    if (hp > 0) {
      this.sfx('crack');
      this.popup(x + 0.5, y + 0.2, msg('pop.crack'), '#ffcc80', 0.3);
      return;
    }
    this.distFrom = '';
    this.addScore(25);
    this.cb.event({ type: 'crate' });
    if (!force) {
      this.sfx('crunch');
      this.buzz('light');
      this.popup(x + 0.5, y + 0.2, anyOf('pop.smash'), '#ffb74d', 0.38);
    }
    this.fx({ t: 'debris', x: x + 0.5, y: y + 0.5 });
  }

  // ------------------------------------------------------------ pumpkin bombs

  private dropBomb(p: Player) {
    const x = Math.floor(p.x) + 0.5;
    const y = Math.floor(p.y) + 0.5;
    if (this.bombStock <= 0) {
      this.popup(p.x, p.y - 0.6, msg('pop.noBombs'), '#ff8a80', 0.3);
      return;
    }
    if (this.bombs.length >= 3 || this.bombs.some((b) => b.x === x && b.y === y)) return;
    this.bombs.push({ x, y, fuse: BOMB_FUSE });
    this.bombStock--;
    this.sfx('fuse');
  }

  private updateBombs(dt: number) {
    for (const b of [...this.bombs]) {
      const before = b.fuse;
      b.fuse -= dt;
      if (Math.floor(before * 4) !== Math.floor(b.fuse * 4) && b.fuse > 0) this.sfx('tick');
      if (b.fuse <= 0) this.explode(b);
    }
  }

  /** Breaks every crate and bonks every monster within BOMB_RADIUS. Minders are safe. */
  private explode(b: Bomb) {
    const i = this.bombs.indexOf(b);
    if (i < 0) return;
    this.bombs.splice(i, 1);
    const m = this.maze;
    this.sfx('boom');
    this.buzz('heavy');
    this.popup(b.x, b.y - 0.5, anyOf('pop.kaboom'), '#ff9100', 0.55);
    this.fx({ t: 'shock', x: b.x, y: b.y });
    this.burst(b.x, b.y, ['#ff3d00', '#ff9100', '#ffea00', '#ff8c1a'], 26, 0.16, 'dot');
    const r = Math.ceil(BOMB_RADIUS);
    for (let y = Math.floor(b.y) - r; y <= Math.floor(b.y) + r; y++) {
      for (let x = Math.floor(b.x) - r; x <= Math.floor(b.x) + r; x++) {
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
        if (m.walls[y * m.w + x] !== CRATE) continue;
        if (Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y) <= BOMB_RADIUS) this.hitCrate(x, y, true);
      }
    }
    let blastKills = 0;
    for (const e of [...this.enemies]) {
      if (Math.hypot(e.x - b.x, e.y - b.y) > BOMB_RADIUS + 0.25) continue;
      if (e.kind === 'cousin') {
        e.hp -= BOMB_BOSS_DAMAGE;
        e.flash = 0.3;
        if (e.hp > 0) {
          this.popup(e.x, e.y - 0.9, msg('pop.bossBomb'), '#ffeb3b', 0.35);
          continue;
        }
      }
      e.rising = 0;
      this.killEnemy(e, { k: 'pop.kaboom', i: 0 }, 'bomb');
      blastKills++;
    }
    if (blastKills) this.cb.event({ type: 'blast', kills: blastKills });
    // Chain reaction.
    for (const other of this.bombs) if (Math.hypot(other.x - b.x, other.y - b.y) <= BOMB_RADIUS) other.fuse = Math.min(other.fuse, 0.12);
    for (const p of this.alivePlayers()) {
      if (Math.hypot(p.x - b.x, p.y - b.y) <= BOMB_RADIUS) this.popup(p.x, p.y - 0.8, msg('pop.phew'), '#b2ff59', 0.3);
    }
  }

  // ------------------------------------------------------------ trick-or-treat doors

  private checkDoor(p: Player) {
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (Math.abs(p.x - tx - 0.5) > 0.3 || Math.abs(p.y - ty - 0.5) > 0.3) return;
    const door = this.doors.find((d) => !d.open && d.x === tx && d.y === ty);
    if (!door) return;
    door.open = true;
    this.cb.event({ type: 'door' });
    const x = tx + 0.5;
    const y = ty + 0.5;
    const r = this.rnd();
    if (r < 0.3) {
      const pts = [250, 500, 750][Math.floor(this.rnd() * 3)];
      this.addScore(pts);
      this.popup(x, y - 0.5, msg('pop.treat', undefined, ` +${pts}`), '#ffd54f', 0.45);
      this.burst(x, y, ['#ffd54f', '#ff8a65', '#fff'], 16, 0.08, 'star');
      this.sfx('candy');
    } else if (r < 0.6) {
      this.popup(x, y - 0.9, msg('pop.treat'), '#ffd54f', 0.45);
      this.applyItem(this.nextItem(), x, y);
    } else if (r < 0.8) {
      this.scare = 1.1;
      this.popup(x, y - 0.5, msg('pop.trick'), '#ce93d8', 0.45);
      this.sfx('boo');
      this.buzz('heavy');
    } else {
      this.reverse = 3;
      this.popup(x, y - 0.5, msg('pop.trick'), '#ce93d8', 0.45);
      this.cb.toast(msg('toast.reverse'), '#ce93d8');
      this.sfx('glitch');
    }
  }

  // ------------------------------------------------------------ pets

  private spawnPet(owner: number, x: number, y: number, kind: 'bat' | 'ghost') {
    if (this.pets.some((p) => p.owner === owner)) return;
    this.pets.push({ owner, kind, x, y, life: PET_LIFE, cooldown: 0.6 });
    this.popup(x, y - 0.6, msg('pop.pet'), '#f48fb1', 0.4);
    this.burst(x, y, ['#f48fb1', '#fff', '#ce93d8'], 12, 0.07, 'star');
    this.sfx('appear');
    this.cb.event({ type: 'pet' });
  }

  private updatePets(dt: number) {
    for (const pet of [...this.pets]) {
      pet.life -= dt;
      const owner = this.players[pet.owner]?.alive ? this.players[pet.owner] : this.nearestPlayer(pet.x, pet.y);
      if (pet.life <= 0 || !owner) {
        this.pets.splice(this.pets.indexOf(pet), 1);
        this.burst(pet.x, pet.y, ['#f48fb1', '#fff'], 10, 0.06, 'star');
        this.popup(pet.x, pet.y - 0.4, msg('pop.petBye'), '#f48fb1', 0.3);
        continue;
      }
      // Hover just behind the minder.
      const f = DIRS[owner.face];
      const tx = owner.x - f.x * 0.75 + Math.sin(this.time * 3 + pet.owner) * 0.15;
      const ty = owner.y - f.y * 0.75 - 0.45 + Math.cos(this.time * 4) * 0.1;
      const k = Math.min(1, dt * 6);
      pet.x += (tx - pet.x) * k;
      pet.y += (ty - pet.y) * k;
      pet.cooldown -= dt;
      if (pet.cooldown > 0) continue;
      let target: Enemy | null = null;
      let best = 5;
      for (const e of this.enemies) {
        if (e.rising > 0) continue;
        const d = Math.hypot(e.x - pet.x, e.y - pet.y);
        if (d < best) {
          best = d;
          target = e;
        }
      }
      if (!target) continue;
      const len = best || 1;
      this.petShots.push({ id: this.nextId++, x: pet.x, y: pet.y, vx: ((target.x - pet.x) / len) * 9, vy: ((target.y - pet.y) / len) * 9, life: 0.8, owner: pet.owner });
      pet.cooldown = 0.75;
    }
    // Pet shots are a bit magic: they fly over walls.
    this.petShots = this.petShots.filter((s) => {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0) return false;
      for (const e of this.enemies) {
        if (e.rising > 0) continue;
        if (Math.abs(e.x - s.x) < 0.45 && Math.abs(e.y - s.y) < 0.45) {
          this.hitEnemy(e, 'pet', s.owner);
          return false;
        }
      }
      return true;
    });
  }

  // ------------------------------------------------------------ monsters

  private hitEnemy(e: Enemy, by: 'eye' | 'pet', owner: number) {
    e.hp--;
    e.eyeHits++;
    e.flash = 0.15;
    if (e.hp > 0) {
      this.sfx('hit');
      const word = e.kind === 'cousin' ? anyOf('pop.bossHit') : msg('pop.ouch');
      this.popup(e.x, e.y - (e.kind === 'cousin' ? 0.9 : 0.4), word, '#ffeb3b', 0.35);
      return;
    }
    this.killEnemy(e, anyOf('killWords'), by, owner);
  }

  private killEnemy(e: Enemy, word: Msg, by: 'eye' | 'bomb' | 'pet' | 'other' = 'other', owner = -1) {
    const idx = this.enemies.indexOf(e);
    if (idx < 0) return;
    this.enemies.splice(idx, 1);
    this.kills++;
    const pts = ENEMIES[e.kind].points;
    this.addScore(pts);
    this.popup(e.x, e.y - 0.3, suffix(word, ` +${pts * (this.party ? 2 : 1)}`), '#fff', 0.42);
    this.burst(e.x, e.y, SPLAT[e.kind], 16, 0.1);
    this.streak = this.time - this.lastKill <= STREAK_GAP ? this.streak + 1 : 1;
    this.lastKill = this.time;
    if (this.streak >= 2) {
      this.popup(e.x, e.y - 0.8, `×${this.streak}${this.streak >= 5 ? ' 🖐️' : ''}`, '#ffab40', 0.34 + Math.min(this.streak, 6) * 0.025);
      this.cb.event({ type: 'streak', n: this.streak });
    }
    this.sfx('kill');
    this.buzz('light');
    this.cb.event({ type: 'kill', kind: e.kind, by });
    if (e.kind === 'cousin') this.cb.event({ type: 'boss', onlyBombs: by === 'bomb' && e.eyeHits === 0 });
    // Sometimes a defeated monster turns into a tiny friendly pet.
    if (e.kind !== 'cousin' && by !== 'other' && Math.random() < PET_CHANCE) {
      const near = owner >= 0 ? this.players[owner] : this.nearestPlayer(e.x, e.y);
      if (near?.alive) this.spawnPet(near.id, e.x, e.y, e.kind === 'ghost' || e.kind === 'bat' ? e.kind : pick(['bat', 'ghost'] as const));
    }
    if (e.kind === 'cousin') {
      this.confetti(70);
      this.burst(e.x, e.y, ['#4fc3f7', '#f1c27d', '#ffd400'], 30, 0.14, 'star');
      if (this.enemiesLeft === 0) this.hintedEnemies = true;
      this.cb.toast(msg(this.enemiesLeft === 0 && this.pelletCount > 0 ? 'toast.bossOutBits' : 'toast.bossOut'), '#ffd400');
      this.buzz('heavy');
    }
    if (e.kind === 'pumpkin' && this.level >= 5) {
      for (const s of [-1, 1]) this.addEnemy('minipumpkin', e.x, e.y, 0, s > 0 ? e.dir : opposite(e.dir));
      this.popup(e.x, e.y + 0.2, msg('pop.split'), '#ff9800', 0.32);
    }
    if (e.kind === 'vampire') {
      for (let i = 0; i < 2; i++) this.addEnemy('bat', e.x, e.y, 0, i ? e.dir : opposite(e.dir));
      this.popup(e.x, e.y + 0.2, msg('pop.bats'), '#ce93d8', 0.32);
    }
  }

  /** Picks where the next monster comes out and shows the warning there (see `drawWarnings` in render.ts). */
  private warnSpawn(kind: EnemyKind) {
    const m = this.maze;
    const options = m.spawns
      .map((s) => ({ s, d: this.distMap[s.y * m.w + s.x] }))
      .filter((o) => o.d < 0 || o.d >= 5);
    // Spread out over the spawn tiles that aren't already warning, so each warning stays readable.
    const free = options.filter((o) => !this.warnings.some((w) => w.x === o.s.x && w.y === o.s.y));
    const pool = free.length ? free : options;
    const choice = pool.length ? pick(pool).s : m.spawns.reduce((a, b) => (this.distMap[b.y * m.w + b.x] > this.distMap[a.y * m.w + a.x] ? b : a));
    this.warnings.push({ x: choice.x, y: choice.y, kind, left: WARN_TIME });
    if (kind === 'cousin') {
      this.cb.toast(msg('toast.bossIn'), '#ff5252');
      this.sfx('boss');
      this.buzz('heavy');
    } else this.sfx('warn');
  }

  private spawnEnemy(w: SpawnWarning) {
    const x = w.x + 0.5;
    const y = w.y + 0.5;
    this.addEnemy(w.kind, x, y, 0.9, -1);
    this.burst(x, y + 0.2, ['#5d4037', '#8d6e63', '#3e2723', '#ff5252'], 10, 0.07, 'debris');
    if (w.kind === 'cousin') this.buzz('heavy');
    this.sfx('spawn');
  }

  private addEnemy(kind: EnemyKind, x: number, y: number, rising: number, dir: number) {
    const def = ENEMIES[kind];
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    this.enemies.push({
      id: this.nextId++,
      kind,
      x: def.phases ? x : tx + 0.5,
      y: def.phases ? y : ty + 0.5,
      dir: dir >= 0 && this.open(tx, ty, dir) ? dir : -1,
      portal: -1,
      hp: kind === 'cousin' ? def.hp : def.hp + this.diff.hpBonus,
      rising,
      stun: 0,
      mad: 0,
      flash: 0,
      wobble: Math.random() * 10,
      walk: 0,
      face: 1,
      eyeHits: 0,
    });
  }

  private enemySpeed(e: Enemy) {
    const base = ENEMIES[e.kind].speed * this.diff.speedMul * (this.party ? 0.9 : 1);
    return Math.min(7.5, base) * (this.has('eclair') ? 0.55 : 1) * (settings.slow ? 0.6 : 1);
  }

  private updateEnemies(dt: number) {
    const frozen = this.has('computer');
    const cricket = this.has('cricket');
    for (const e of [...this.enemies]) {
      e.wobble += dt * 8;
      e.flash = Math.max(0, e.flash - dt);
      if (e.rising > 0) {
        e.rising -= dt;
        continue;
      }
      const near = this.nearestPlayer(e.x, e.y);
      if (cricket && e.mad <= 0 && e.kind !== 'cousin' && Math.hypot(e.x - near.x, e.y - near.y) < 3.5) {
        e.mad = 0.9;
        this.popup(e.x, e.y - 0.4, anyOf('pop.mad'), '#b2ff59', 0.3);
      }
      if (e.mad > 0) {
        e.mad -= dt;
        e.wobble += dt * 40;
        if (e.mad <= 0) this.killEnemy(e, msg('pop.bonkers'));
        continue;
      }
      if (e.stun > 0) {
        e.stun -= dt;
      } else if (!frozen) {
        const speed = this.enemySpeed(e);
        const bx = e.x;
        if (ENEMIES[e.kind].phases) this.float(e, speed, dt);
        else this.advance(e, speed * dt, () => this.enemyDecide(e));
        if (Math.abs(e.x - bx) > 1e-4) e.face = e.x > bx ? 1 : -1;
        e.walk += dt * speed;
      }

      const reach = (this.has('pig') ? 0.75 : 0.6) * (this.has('eclair') ? 1.15 : 1) * (e.kind === 'cousin' ? 1.3 : 1);
      for (const p of this.alivePlayers()) {
        if (Math.abs(e.x - p.x) >= reach || Math.abs(e.y - p.y) >= reach) continue;
        if (frozen && e.kind === 'cousin') {
          // Even a Blue Screen can't delete Palos' cousin: you have to shoot him.
        } else if (frozen) {
          this.killEnemy(e, msg('pop.ctrlAltDel'));
        } else if (e.stun > 0) {
          // Dizzy monsters are harmless.
        } else if (this.has('pig')) {
          e.stun = 2.5;
          e.dir = opposite(e.dir);
          this.popup(e.x, e.y - 0.4, msg('pop.boing'), '#f48fb1', 0.4);
          this.sfx('boing');
          this.addScore(50);
        } else if (p.invuln <= 0) {
          this.knockOut(p, msg(`monsters.${e.kind}.death`), e.kind);
          if (this.phase !== 'play') return;
        }
        break;
      }
    }
  }

  /** In co-op a caught minder sits out the rest of the level; the game ends when nobody is left. */
  private knockOut(p: Player, reason: Msg, killer: EnemyKind | null) {
    if (this.alivePlayers().length > 1) {
      p.alive = false;
      p.dir = -1;
      this.emote(p, 'cry');
      this.sfx('cry');
      this.sfx('laugh');
      this.buzz('error');
      this.popup(p.x, p.y - 0.7, msg('pop.out', { n: p.id + 1 }), '#ff8a80', 0.4);
      this.cb.toast(msg('toast.playerOut', { n: p.id + 1, other: 2 - p.id }), '#ff8a80');
      this.distFrom = '';
      return;
    }
    this.die(reason, killer);
  }

  /** Ghosts and witches drift through walls straight towards the nearest minder. */
  private float(e: Enemy, speed: number, dt: number) {
    const p = this.nearestPlayer(e.x, e.y);
    const smart = Math.min(0.98, this.diff.smart + 0.2);
    let dx = p.x - e.x;
    let dy = p.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const wob = (1 - smart) * 1.6;
    const ang = Math.atan2(dy, dx) + Math.sin(e.wobble * 0.35) * wob;
    e.x += Math.cos(ang) * speed * dt;
    e.y += Math.sin(ang) * speed * dt * (e.kind === 'witch' ? 1 : 0.9);
    e.x = Math.max(0.5, Math.min(this.maze.w - 0.5, e.x));
    e.y = Math.max(0.5, Math.min(this.maze.h - 0.5, e.y));
  }

  private enemyDecide(e: Enemy) {
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    const back = opposite(e.dir);
    const opts = [0, 1, 2, 3].filter((d) => d !== back && this.open(tx, ty, d));
    if (!opts.length) {
      e.dir = back >= 0 && this.open(tx, ty, back) ? back : -1;
      return;
    }
    const smart = Math.max(0.05, Math.min(0.98, this.diff.smart + ENEMIES[e.kind].smarts));
    if (Math.random() < smart) {
      const w = this.maze.w;
      if (e.kind === 'pumpkin' || e.kind === 'minipumpkin') {
        // Ambush: aim a few tiles ahead of where the nearest minder is heading.
        const p = this.nearestPlayer(e.x, e.y);
        const f = DIRS[p.dir >= 0 ? p.dir : p.face];
        const gx = p.x + f.x * 3;
        const gy = p.y + f.y * 3;
        e.dir = opts.reduce((a, b) =>
          Math.hypot(tx + DIRS[b].x + 0.5 - gx, ty + DIRS[b].y + 0.5 - gy) <
          Math.hypot(tx + DIRS[a].x + 0.5 - gx, ty + DIRS[a].y + 0.5 - gy)
            ? b
            : a,
        );
      } else {
        const score = (d: number) => {
          const v = this.distMap[(ty + DIRS[d].y) * w + tx + DIRS[d].x];
          return v < 0 ? 9999 : v;
        };
        e.dir = opts.reduce((a, b) => (score(b) < score(a) ? b : a));
      }
    } else if (e.dir >= 0 && opts.includes(e.dir) && Math.random() < 0.5) {
      // keep going straight
    } else {
      e.dir = pick(opts);
    }
  }

  // ------------------------------------------------------------ red light, green light

  /** Where a minder starts the level (in co-op, player 2 starts next to player 1). */
  private startTile(id: number): Point {
    const m = this.maze;
    if (id === 0) return m.start;
    return [3, 1, 0, 2].map((d) => ({ x: m.start.x + DIRS[d].x, y: m.start.y + DIRS[d].y })).find((p) => !isWall(m, p.x, p.y)) ?? m.start;
  }

  /** The doll faces the tree and sings; when the song ends she turns round. */
  private greenLight() {
    const r = this.rnd();
    const song: Sfx = r < 0.25 ? 'chantFast' : r < 0.45 ? 'chantSlow' : 'chant';
    this.light = 'green';
    this.lightLeft = this.lightLen = CHANT_TIME[song];
    this.sfx(song);
  }

  /** Returns true while the doll is watching: then nothing moves, and a minder who moves anyway is caught. */
  private updateLight(dt: number): boolean {
    this.lightLeft -= dt;
    if (this.lightLeft <= 0) {
      const mid = { x: this.maze.w / 2, y: this.maze.h / 2 };
      if (this.light === 'green') {
        this.light = 'turn';
        this.lightLeft = this.lightLen = TURN_TIME;
        this.sfx('turn');
      } else if (this.light === 'turn') {
        this.light = 'red';
        this.lightLeft = this.lightLen = RED_TIME[0] + this.rnd() * (RED_TIME[1] - RED_TIME[0]);
        this.caught.clear();
        // Only what you press from now on counts.
        for (const pad of this.input.pads) pad.dir = -1;
        this.popup(mid.x, mid.y, msg('squid.red'), '#ff1744', 0.8);
        this.buzz('medium');
      } else {
        this.greenLight();
        this.popup(mid.x, mid.y, msg('squid.green'), '#69f0ae', 0.8);
      }
    }
    if (this.light !== 'red') return false;
    const watching = this.lightLen - this.lightLeft > RED_GRACE;
    for (const p of this.alivePlayers()) {
      const pad = this.input.pads[p.id];
      const moved = pad.dir >= 0;
      pad.dir = -1;
      const fired = pad.consumeFire();
      const bombed = pad.consumeBomb();
      if (watching && (moved || fired || bombed) && !this.caught.has(p.id)) this.catchMover(p);
    }
    return true;
  }

  /** The doll saw a minder move: zap, and back to the start line it goes. */
  private catchMover(p: Player) {
    this.caught.add(p.id);
    this.zaps.push({ x: p.x, y: p.y, life: 0.6 });
    this.burst(p.x, p.y, ['#ff1744', '#ff80ab', '#ffffff'], 18, 0.09, 'spark');
    this.popup(p.x, p.y - 0.6, msg('squid.caught'), '#ff1744', 0.45);
    this.cb.toast(msg('squid.back'), '#ff80ab');
    this.sfx('zap');
    this.buzz('heavy');
    const s = this.startTile(p.id);
    p.x = s.x + 0.5;
    p.y = s.y + 0.5;
    p.dir = -1;
    p.next = -1;
    p.portal = -1;
    p.invuln = Math.max(p.invuln, 1.5);
    this.distFrom = '';
    this.burst(p.x, p.y, ['#ff80ab', '#ffffff'], 12, 0.07, 'star');
  }

  // ------------------------------------------------------------ items

  private updateItem(dt: number) {
    if (!this.item) {
      this.itemTimer -= dt;
      if (this.itemTimer <= 0) this.spawnItem();
      return;
    }
    const it = this.item;
    // The White Rabbit doesn't sit still: it hops away and you have to chase it.
    if (it.kind === 'rabbit') this.advance(it, 3.3 * dt, () => this.rabbitDecide(it));
    it.life -= dt;
    if (it.life <= 0) {
      this.item = null;
      this.itemTimer = 6 + this.rnd() * 6;
      return;
    }
    if (this.alivePlayers().some((p) => Math.abs(it.x - p.x) < 0.65 && Math.abs(it.y - p.y) < 0.65)) {
      this.item = null;
      this.itemTimer = 8 + this.rnd() * 7;
      this.applyItem(it.kind, it.x, it.y);
    }
  }

  private rabbitDecide(r: Item) {
    const p = this.nearestPlayer(r.x, r.y);
    const tx = Math.floor(r.x);
    const ty = Math.floor(r.y);
    const back = opposite(r.dir);
    let opts = [0, 1, 2, 3].filter((d) => d !== back && this.open(tx, ty, d));
    if (!opts.length) opts = [0, 1, 2, 3].filter((d) => this.open(tx, ty, d));
    if (!opts.length) {
      r.dir = -1;
      return;
    }
    const away = (d: number) => Math.abs(tx + DIRS[d].x - p.x) + Math.abs(ty + DIRS[d].y - p.y);
    r.dir = Math.random() < 0.7 ? opts.reduce((a, b) => (away(b) > away(a) ? b : a)) : pick(opts);
  }

  private spawnItem() {
    const m = this.maze;
    const tiles: number[] = [];
    for (let i = 0; i < m.w * m.h; i++) {
      const x = i % m.w;
      const y = (i - x) / m.w;
      if (m.walls[i]) continue;
      if (this.alivePlayers().some((p) => Math.abs(x + 0.5 - p.x) + Math.abs(y + 0.5 - p.y) < 4)) continue;
      tiles.push(i);
    }
    if (!tiles.length) return;
    const i = tiles[Math.floor(this.rnd() * tiles.length)];
    let kind: ItemKind;
    if (this.party && !this.cakeGiven) {
      kind = 'cake';
      this.cakeGiven = true;
    } else {
      kind = this.nextItem();
    }
    const life = 10 + this.rnd() * 5;
    this.item = { kind, x: (i % m.w) + 0.5, y: Math.floor(i / m.w) + 0.5, dir: -1, portal: -1, life, max: life };
    this.sfx('appear');
  }

  /** Shuffle bag: every item comes out once (or `weight` times) before the bag refills, and never twice in a row. */
  private nextItem(): ItemKind {
    if (!this.bag.length) {
      for (const k of Object.keys(ITEMS) as ItemKind[]) for (let n = 0; n < ITEMS[k].weight; n++) this.bag.push(k);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rnd() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    let idx = this.bag.length - 1;
    if (this.bag[idx] === this.lastItem) {
      const other = this.bag.findIndex((k) => k !== this.lastItem);
      if (other >= 0) idx = other;
    }
    const kind = this.bag.splice(idx, 1)[0];
    this.lastItem = kind;
    return kind;
  }

  /** A derangement: every direction ends up somewhere else (left might become right, up might become left...). */
  private reshuffleControls() {
    let perm: number[];
    do {
      perm = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    } while (perm.some((v, i) => v === i));
    this.scramble = perm;
    this.scrambleTimer = 3;
    if (this.has('roach') && this.phase === 'play') this.sfx('glitch');
  }

  private updateUmbrellas(dt: number) {
    for (const u of this.umbrellas) {
      if (u.open > 0) {
        u.open -= dt;
        u.anim = Math.min(1, u.anim + dt * 5);
        if (u.open <= 0) {
          u.cool = 4;
          this.sfx('umbrella');
        }
        continue;
      }
      u.anim = Math.max(0, u.anim - dt * 4);
      u.cool -= dt;
      if (u.cool > 0) continue;
      const opener = this.enemies.find((e) => e.rising <= 0 && Math.abs(e.x - u.x) < 0.6 && Math.abs(e.y - u.y) < 0.6);
      if (opener) {
        u.open = rand(6, 9);
        this.sfx('umbrella');
        this.popup(u.x, u.y - 0.9, anyOf('pop.umbrella'), '#ce93d8', 0.3);
      }
    }
  }

  private showHints() {
    const m = this.maze;
    const hint = (key: string, text: Msg) => {
      if (this.hints.has(key)) return false;
      this.hints.add(key);
      this.cb.toast(text, '#80deea');
      return true;
    };
    if (this.squid && hint('squid', msg('squid.hint'))) return;
    if (m.walls.some((v) => v === CRATE) && hint('crate', msg('toast.hintCrate'))) return;
    if (m.portals.length && hint('portal', msg('toast.hintPortal'))) return;
    if (m.umbrellas.length) hint('umbrella', msg('toast.hintUmbrella'));
  }

  private applyItem(kind: ItemKind, x: number, y: number) {
    this.cb.toast(msg(`items.${kind}.toast`), kind === 'beer' ? '#ffcc80' : '#fff59d');
    this.burst(x, y, ['#fff59d', '#ffffff', '#ffd54f'], 14, 0.08, 'star');
    this.buzz('medium');
    const sounds: Record<ItemKind, Sfx> = {
      cricket: 'chirp', spice: 'spice', pig: 'oink', eclair: 'nom', beer: 'burp', computer: 'bsod', coffee: 'slurp', choco: 'nom', foosball: 'kick', lights: 'switch',
      roach: 'glitch', rabbit: 'matrix', bomb: 'fuse', candy: 'candy', cake: 'candy',
    };
    this.sfx(sounds[kind]);
    this.cb.event({ type: 'item', kind });
    if (kind === 'candy') {
      this.addScore(1000);
      this.popup(x, y - 0.3, '+1000', '#ffd54f', 0.5);
      return;
    }
    if (kind === 'cake') {
      this.addScore(1200);
      this.popup(x, y - 0.3, msg('pop.cake'), '#ffd400', 0.5);
      this.confetti(80);
      return;
    }
    if (kind === 'bomb') {
      this.bombStock = Math.min(MAX_BOMBS, this.bombStock + 2);
      this.popup(x, y - 0.3, msg('pop.plusBombs'), '#ff9100', 0.45);
      return;
    }
    this.effects.set(kind, ITEMS[kind].time ?? EFFECT_TIME);
    if (kind === 'computer') this.popup(x, y - 0.4, ':(', '#82b1ff', 0.6);
    if (kind === 'roach') {
      this.reshuffleControls();
      this.popup(x, y - 0.4, msg('pop.bugFound'), '#69f0ae', 0.45);
    }
  }

  private addScore(n: number) {
    this.score += n * (this.party ? 2 : 1);
  }

  private emote(p: Player, e: Emote) {
    p.emote = e;
    p.emoteTime = 0;
  }

  private die(reason: Msg, killer: EnemyKind | null) {
    this.phase = 'dying';
    this.phaseTime = DYING_TIME;
    this.deathReason = reason;
    this.killer = killer;
    this.effects.clear();
    for (const p of this.players) this.emote(p, 'cry');
    this.fx({ t: 'music' });
    // The monsters laugh at you first; the sad tune follows (see 'dying' in update).
    this.sfx('laugh');
    this.buzz('error');
  }

  private levelClear() {
    const mult = this.party ? 2 : 1;
    const bonus = (Math.ceil(this.timeLeft) * 10 + this.level * 100) * mult;
    this.score += bonus;
    this.phase = 'clear';
    this.phaseTime = this.party ? 7 : 3;
    this.effects.clear();
    this.eyes = [];
    this.balls = [];
    this.bombs = [];
    for (const p of this.alivePlayers()) this.emote(p, 'cheer');
    this.cb.event({ type: 'clear', level: this.level, timeLeft: this.timeLeft, party: this.party, coop: this.coop, squid: this.squid });
    this.sfx('clear');
    this.buzz('medium');
    this.confetti(60);
    if (this.party) for (let i = 0; i < 4; i++) this.fx({ t: 'rocket' });
    this.cb.levelClear(this.level, bonus);
  }

  // ------------------------------------------------------------ effects

  /** Plays an effect here and, in a networked game, hands it to the other phone too. */
  private fx(f: Fx) {
    this.onFx?.(f);
    this.playFx(f);
  }

  /** Plays an effect on this phone only (also used to replay the host's effects on the other phone). */
  playFx(f: Fx) {
    switch (f.t) {
      case 'sfx':
        audio.play(f.s);
        break;
      case 'buzz':
        buzz(f.k);
        break;
      case 'music':
        audio.stopMusic();
        break;
      case 'pop':
        this.popups.push({ x: f.x, y: f.y, text: say(f.m), life: 1.1, color: f.c, size: f.z });
        break;
      case 'burst':
        for (let i = 0; i < f.n; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = rand(1, 4);
          this.particles.push({
            kind: f.k, x: f.x, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: rand(0.4, 0.8), max: 0.8, color: pick(f.c), size: f.z * rand(0.6, 1.4), rot: a,
          });
        }
        break;
      case 'confetti':
        for (let i = 0; i < f.n; i++) {
          this.particles.push({
            kind: 'confetti', x: rand(0, this.maze.w), y: rand(-2, 0), vx: rand(-1, 1), vy: rand(2, 5),
            life: rand(2, 3.5), max: 3.5, color: pick(CONFETTI), size: rand(0.12, 0.22), rot: rand(0, 6),
          });
        }
        break;
      case 'rocket':
        this.particles.push({
          kind: 'rocket', x: rand(1, this.maze.w - 1), y: this.maze.h, vx: rand(-0.6, 0.6), vy: rand(-11, -8),
          life: rand(0.8, 1.3), max: 1.3, color: pick(CONFETTI), size: 0.1, rot: 0,
        });
        audio.play('firework');
        break;
      case 'debris':
        for (let k = 0; k < 12; k++) {
          this.particles.push({
            kind: 'debris', x: f.x + rand(-0.3, 0.3), y: f.y + rand(-0.3, 0.3), vx: rand(-3, 3), vy: rand(-4, -1),
            life: rand(0.5, 0.9), max: 0.9, color: pick(['#8d6e63', '#a1887f', '#6d4c41', '#d7ccc8']), size: rand(0.06, 0.12), rot: rand(0, 6),
          });
        }
        break;
      case 'shock':
        this.shake = 0.45;
        this.particles.push({ kind: 'shock', x: f.x, y: f.y, vx: 0, vy: 0, life: 0.45, max: 0.45, color: '#ffb74d', size: BOMB_RADIUS, rot: 0 });
        break;
      case 'pellet':
        this.pellets[f.i] = -1;
        break;
      case 'crate':
        this.crateHp[f.i] = f.hp;
        if (f.hp === 0) this.maze.walls[f.i] = OPEN;
        break;
    }
  }

  private sfx(s: Sfx) {
    this.fx({ t: 'sfx', s });
  }

  private buzz(k: Buzz) {
    this.fx({ t: 'buzz', k });
  }

  popup(x: number, y: number, m: Msg, c: string, z: number) {
    this.fx({ t: 'pop', x, y, m, c, z });
  }

  burst(x: number, y: number, c: string[], n: number, z: number, k: ParticleKind = 'dot') {
    this.fx({ t: 'burst', x, y, c, n, z, k });
  }

  confetti(n: number) {
    this.fx({ t: 'confetti', n });
  }

  private updateParticles(dt: number) {
    const born: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark' || p.kind === 'debris') p.vy += dt * 9;
      if (p.kind === 'rocket' && p.life <= 0) {
        const n = 36;
        const colors = [p.color, pick(CONFETTI), '#ffffff'];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const v = rand(3, 6);
          born.push({
            kind: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: rand(0.9, 1.5), max: 1.5, color: colors[i % 3], size: rand(0.06, 0.1), rot: 0,
          });
        }
      }
      if (p.kind === 'dot' || p.kind === 'star') {
        p.vx *= 1 - dt * 4;
        p.vy *= 1 - dt * 4;
      }
      if (p.kind === 'confetti') p.rot += dt * 6;
      if (p.kind === 'flame') p.size *= 1 - dt * 1.5;
    }
    this.particles.push(...born);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.popups) {
      t.life -= dt;
      t.y -= dt * 0.9;
    }
    this.popups = this.popups.filter((t) => t.life > 0);
  }
}
