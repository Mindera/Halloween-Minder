import { ENEMIES, ITEMS, type EnemyKind, type ItemKind } from '../config';
import type { Bomb, Emote, Enemy, Eye, Fx, Game, Item, LevelInfo, Light, Pet, PetShot, Phase, Player, SpawnWarning, Umbrella, Zap } from '../game';
import type { Msg } from '../i18n';
import type { GameEvent } from '../progress';

/** Bumped whenever the messages change, so two different builds refuse to play together. */
export const VERSION = 3;

/** Reliable, ordered messages (JSON on the 'ctl' channel). */
export type Ctl =
  | { t: 'hello'; v: number; minder: string }
  | { t: 'minder'; id: string }
  | { t: 'lobby' }
  | { t: 'start'; minders: [string, string] }
  | { t: 'level'; epoch: number; info: LevelInfo }
  | { t: 'fx'; list: Fx[] }
  | { t: 'toast'; m: Msg; c?: string }
  | { t: 'clear'; level: number; bonus: number }
  | { t: 'event'; e: GameEvent }
  | { t: 'over'; reason: Msg; won: boolean }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'bye' };

// Binary messages on the fast 'state' channel, which may drop or reorder them.
export const SNAPSHOT = 1;
export const INPUT = 2;

const ENEMY_KINDS = Object.keys(ENEMIES) as EnemyKind[];
const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];
const PHASES: Phase[] = ['intro', 'play', 'clear', 'dying', 'over', 'won'];
const EMOTES: Emote[] = ['none', 'cheer', 'cry'];
const LIGHTS: Light[] = ['green', 'turn', 'red'];
/** Positions travel in 1/500ths of a tile. */
const POS = 500;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

class Writer {
  private view = new DataView(new ArrayBuffer(16384));
  private o = 0;

  u8(v: number) {
    this.view.setUint8(this.o, clamp(v, 0, 255));
    this.o += 1;
  }

  i8(v: number) {
    this.view.setInt8(this.o, clamp(v, -128, 127));
    this.o += 1;
  }

  u16(v: number) {
    this.view.setUint16(this.o, clamp(v, 0, 65535));
    this.o += 2;
  }

  i16(v: number) {
    this.view.setInt16(this.o, clamp(v, -32768, 32767));
    this.o += 2;
  }

  u32(v: number) {
    this.view.setUint32(this.o, v >>> 0);
    this.o += 4;
  }

  pos(v: number) {
    this.i16(v * POS);
  }

  /** A count byte followed by up to 255 entries. */
  list<T>(items: readonly T[], each: (item: T) => void) {
    const n = Math.min(255, items.length);
    this.u8(n);
    for (let i = 0; i < n; i++) each(items[i]);
  }

  bytes(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(this.view.buffer.slice(0, this.o));
  }
}

class Reader {
  private view: DataView;
  private o = 0;

  constructor(buf: ArrayBuffer) {
    this.view = new DataView(buf);
  }

  u8() {
    return this.view.getUint8(this.o++);
  }

  i8() {
    return this.view.getInt8(this.o++);
  }

  u16() {
    const v = this.view.getUint16(this.o);
    this.o += 2;
    return v;
  }

  i16() {
    const v = this.view.getInt16(this.o);
    this.o += 2;
    return v;
  }

  u32() {
    const v = this.view.getUint32(this.o);
    this.o += 4;
    return v;
  }

  pos() {
    return this.i16() / POS;
  }

  list<T>(each: () => T): T[] {
    const n = this.u8();
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(each());
    return out;
  }
}

/** What the other phone needs each tick to draw the game (positions, timers, score). */
export interface Snapshot {
  epoch: number;
  seq: number;
  phase: Phase;
  timeLeft: number;
  score: number;
  bombStock: number;
  pelletCount: number;
  queued: number;
  scare: number;
  reverse: number;
  light: Light;
  lightLeft: number;
  lightLen: number;
  zaps: Zap[];
  effects: [ItemKind, number][];
  players: Pick<Player, 'id' | 'x' | 'y' | 'dir' | 'face' | 'alive' | 'invuln' | 'recoil' | 'emote'>[];
  enemies: Pick<Enemy, 'id' | 'kind' | 'x' | 'y' | 'hp' | 'rising' | 'stun' | 'mad' | 'flash' | 'face' | 'dir'>[];
  warnings: SpawnWarning[];
  eyes: Pick<Eye, 'id' | 'x' | 'y' | 'dir' | 'owner' | 'fire'>[];
  bombs: Bomb[];
  item: Pick<Item, 'kind' | 'x' | 'y' | 'life' | 'max'> | null;
  pets: Pick<Pet, 'owner' | 'kind' | 'x' | 'y' | 'life'>[];
  shots: Pick<PetShot, 'id' | 'x' | 'y' | 'owner'>[];
  umbrellas: Pick<Umbrella, 'open' | 'anim'>[];
  doors: boolean[];
}

export function encodeSnapshot(g: Game, epoch: number, seq: number): Uint8Array<ArrayBuffer> {
  const w = new Writer();
  w.u8(SNAPSHOT);
  w.u16(epoch);
  w.u32(seq);
  w.u8(PHASES.indexOf(g.phase));
  w.u16(g.timeLeft * 100);
  w.u32(g.score);
  w.u8(g.bombStock);
  w.u16(g.pelletCount);
  w.u16(g.enemiesLeft - g.enemies.length);
  w.u8(g.scare * 100);
  w.u8(g.reverse * 50);
  w.u8(LIGHTS.indexOf(g.light));
  w.u16(g.lightLeft * 100);
  w.u16(g.lightLen * 100);
  w.list(g.zaps, (z) => {
    w.pos(z.x);
    w.pos(z.y);
    w.u8(z.life * 100);
  });
  w.list([...g.effects], ([k, t]) => {
    w.u8(ITEM_KINDS.indexOf(k));
    w.u16(t * 100);
  });
  w.list(g.players, (p) => {
    w.u8(p.id);
    w.pos(p.x);
    w.pos(p.y);
    w.i8(p.dir);
    w.u8(p.face);
    w.u8(p.alive ? 1 : 0);
    w.u8(p.invuln * 50);
    w.u8(p.recoil * 200);
    w.u8(EMOTES.indexOf(p.emote));
  });
  w.list(g.enemies, (e) => {
    w.u16(e.id);
    w.u8(ENEMY_KINDS.indexOf(e.kind));
    w.pos(e.x);
    w.pos(e.y);
    w.u8(e.hp);
    w.u8(e.rising * 100);
    w.u8(e.stun * 50);
    w.u8(e.mad * 100);
    w.u8(e.flash * 500);
    w.i8(e.face);
    w.i8(e.dir);
  });
  w.list(g.warnings, (o) => {
    w.u8(o.x);
    w.u8(o.y);
    w.u8(ENEMY_KINDS.indexOf(o.kind));
    w.u8(o.left * 50);
  });
  w.list(g.eyes, (e) => {
    w.u16(e.id);
    w.pos(e.x);
    w.pos(e.y);
    w.u8(e.dir);
    w.u8(e.owner);
    w.u8(e.fire ? 1 : 0);
  });
  w.list(g.bombs, (b) => {
    w.pos(b.x);
    w.pos(b.y);
    w.u8(b.fuse * 100);
  });
  const it = g.item;
  w.u8(it ? 1 : 0);
  if (it) {
    w.u8(ITEM_KINDS.indexOf(it.kind));
    w.pos(it.x);
    w.pos(it.y);
    w.u8(it.life * 10);
    w.u8(it.max * 10);
  }
  w.list(g.pets, (p) => {
    w.u8(p.owner);
    w.u8(p.kind === 'ghost' ? 1 : 0);
    w.pos(p.x);
    w.pos(p.y);
    w.u8(p.life * 10);
  });
  w.list(g.petShots, (s) => {
    w.u16(s.id);
    w.pos(s.x);
    w.pos(s.y);
    w.u8(s.owner);
  });
  w.list(g.umbrellas, (u) => {
    w.u8(u.open * 20);
    w.u8(u.anim * 250);
  });
  w.list(g.doors, (d) => w.u8(d.open ? 1 : 0));
  return w.bytes();
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot {
  const r = new Reader(buf);
  r.u8();
  return {
    epoch: r.u16(),
    seq: r.u32(),
    phase: PHASES[r.u8()] ?? 'play',
    timeLeft: r.u16() / 100,
    score: r.u32(),
    bombStock: r.u8(),
    pelletCount: r.u16(),
    queued: r.u16(),
    scare: r.u8() / 100,
    reverse: r.u8() / 50,
    light: LIGHTS[r.u8()] ?? 'green',
    lightLeft: r.u16() / 100,
    lightLen: r.u16() / 100,
    zaps: r.list(() => ({ x: r.pos(), y: r.pos(), life: r.u8() / 100 })),
    effects: r.list(() => [ITEM_KINDS[r.u8()], r.u16() / 100] as [ItemKind, number]),
    players: r.list(() => ({
      id: r.u8(),
      x: r.pos(),
      y: r.pos(),
      dir: r.i8(),
      face: r.u8(),
      alive: r.u8() === 1,
      invuln: r.u8() / 50,
      recoil: r.u8() / 200,
      emote: EMOTES[r.u8()] ?? 'none',
    })),
    enemies: r.list(() => ({
      id: r.u16(),
      kind: ENEMY_KINDS[r.u8()],
      x: r.pos(),
      y: r.pos(),
      hp: r.u8(),
      rising: r.u8() / 100,
      stun: r.u8() / 50,
      mad: r.u8() / 100,
      flash: r.u8() / 500,
      face: r.i8(),
      dir: r.i8(),
    })),
    warnings: r.list(() => ({ x: r.u8(), y: r.u8(), kind: ENEMY_KINDS[r.u8()], left: r.u8() / 50 })),
    eyes: r.list(() => ({ id: r.u16(), x: r.pos(), y: r.pos(), dir: r.u8(), owner: r.u8(), fire: r.u8() === 1 })),
    bombs: r.list(() => ({ x: r.pos(), y: r.pos(), fuse: r.u8() / 100 })),
    item: r.u8() ? { kind: ITEM_KINDS[r.u8()], x: r.pos(), y: r.pos(), life: r.u8() / 10, max: r.u8() / 10 } : null,
    pets: r.list(() => ({ owner: r.u8(), kind: r.u8() ? ('ghost' as const) : ('bat' as const), x: r.pos(), y: r.pos(), life: r.u8() / 10 })),
    shots: r.list(() => ({ id: r.u16(), x: r.pos(), y: r.pos(), owner: r.u8() })),
    umbrellas: r.list(() => ({ open: r.u8() / 20, anim: r.u8() / 250 })),
    doors: r.list(() => r.u8() === 1),
  };
}

/** The other phone's controls: direction, fire held, and running steer/press counts. */
export interface RemotePad {
  epoch: number;
  seq: number;
  dir: number;
  turns: number;
  held: boolean;
  shots: number;
  drops: number;
}

export function encodeInput(p: RemotePad): Uint8Array<ArrayBuffer> {
  const w = new Writer();
  w.u8(INPUT);
  w.u16(p.epoch);
  w.u16(p.seq);
  w.i8(p.dir);
  w.u8(p.turns & 255);
  w.u8(p.held ? 1 : 0);
  w.u8(p.shots & 255);
  w.u8(p.drops & 255);
  return w.bytes();
}

export function decodeInput(buf: ArrayBuffer): RemotePad {
  const r = new Reader(buf);
  r.u8();
  return { epoch: r.u16(), seq: r.u16(), dir: r.i8(), turns: r.u8(), held: r.u8() === 1, shots: r.u8(), drops: r.u8() };
}
