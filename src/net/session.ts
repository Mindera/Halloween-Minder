import type { Ball, Emote, Enemy, Eye, Fx, Game, Pet, PetShot, Player } from '../game';
import type { Msg } from '../i18n';
import type { Input } from '../input';
import type { GameEvent } from '../progress';
import { INPUT, SNAPSHOT, VERSION, decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, type Ctl, type Snapshot } from './protocol';
import type { Transport } from './transport';

/** What the app does when the other phone says something. */
export interface NetHooks {
  hello(minder: string): void;
  minder(id: string): void;
  lobby(): void;
  /** Guest: the host started a game with these minders (P1, P2). */
  start(minders: [string, string]): void;
  levelIntro(level: number): void;
  levelClear(level: number, bonus: number): void;
  toast(m: Msg, color?: string): void;
  event(e: GameEvent): void;
  over(reason: Msg, won: boolean): void;
  pause(): void;
  resume(): void;
  /** The other phone left, or the link dropped. */
  lost(): void;
  /** The other phone runs a different version of the game. */
  mismatch(): void;
}

const SNAPSHOT_MS = 50;
const INPUT_MS = 100;
/** Further than this (in tiles) between two snapshots is a teleport: jump instead of sliding. */
const JUMP = 2;

type Pos = { x: number; y: number };

/**
 * Networked co-op over a `Transport`. The host phone runs the game: it streams snapshots and effects and
 * plays P2 with the guest's controls. The guest phone only shows the game, smoothing positions between snapshots.
 */
export class NetSession {
  private fx: Fx[] = [];
  private epoch = 0;
  private seq = 0;
  private lastSnap = 0;
  private closed = false;
  // Host: the guest's last press counts.
  private padSeq = -1;
  private turns = -1;
  private shots = -1;
  private drops = -1;
  // Guest
  private cur: Snapshot | null = null;
  private curAt = 0;
  /** Where each thing was drawn when the latest snapshot came in (we slide from there to the snapshot). */
  private from = new Map<string, Pos>();
  private players = new Map<number, Player>();
  private enemies = new Map<number, Enemy>();
  private eyes = new Map<number, Eye>();
  private ballsShown = new Map<number, Ball>();
  private shotsShown = new Map<number, PetShot>();
  private pets = new Map<number, Pet>();
  private pendingStart: [string, string] | null = null;
  private sentPad = '';
  private sentAt = 0;
  private inputSeq = 0;

  constructor(
    readonly isHost: boolean,
    private link: Transport,
    private game: Game,
    private input: Input,
    private hooks: NetHooks,
  ) {
    link.onMessage = (_ch, data) => (typeof data === 'string' ? this.onCtl(JSON.parse(data) as Ctl) : this.onState(data));
    link.onClose = () => {
      if (this.closed) return;
      this.closed = true;
      this.detach();
      this.hooks.lost();
    };
    game.remote = !isHost;
    if (isHost) game.onFx = (f) => this.fx.push(f);
  }

  hello(minder: string) {
    this.send({ t: 'hello', v: VERSION, minder });
  }

  send(msg: Ctl) {
    // Effects queued this frame go first, so the other phone sees everything in the same order.
    this.flushFx();
    this.link.send('ctl', JSON.stringify(msg));
  }

  /** Host: tells the other phone about the level that just started. */
  sendLevel() {
    this.epoch = (this.epoch + 1) & 0xffff;
    this.send({ t: 'level', epoch: this.epoch, info: this.game.levelInfo() });
  }

  /** Once per animation frame. `live` is true while the game is running (not paused or over). */
  frame(now: number, dt: number, live: boolean) {
    if (this.isHost) {
      this.flushFx();
      if (live && now - this.lastSnap >= SNAPSHOT_MS) {
        this.lastSnap = now;
        this.link.send('state', encodeSnapshot(this.game, this.epoch, ++this.seq));
      }
      return;
    }
    if (live) this.sendPad(now);
    this.show(now, dt);
  }

  close() {
    if (this.closed) return;
    this.send({ t: 'bye' });
    this.closed = true;
    this.detach();
    this.link.close();
  }

  private detach() {
    this.game.onFx = undefined;
    this.game.remote = false;
  }

  private flushFx() {
    if (!this.fx.length) return;
    const list = this.fx;
    this.fx = [];
    this.link.send('ctl', JSON.stringify({ t: 'fx', list } satisfies Ctl));
  }

  private onCtl(m: Ctl) {
    const h = this.hooks;
    switch (m.t) {
      case 'hello':
        if (m.v !== VERSION) {
          h.mismatch();
          this.close();
          return;
        }
        h.hello(m.minder);
        break;
      case 'minder':
        h.minder(m.id);
        break;
      case 'lobby':
        h.lobby();
        break;
      case 'start':
        this.pendingStart = m.minders;
        break;
      case 'level':
        this.epoch = m.epoch;
        this.cur = null;
        this.from.clear();
        for (const map of [this.players, this.enemies, this.eyes, this.ballsShown, this.shotsShown, this.pets]) map.clear();
        if (this.pendingStart) {
          h.start(this.pendingStart);
          this.pendingStart = null;
        }
        // A new level starts with nobody walking, like on the host.
        this.input.reset();
        this.game.loadLevel(m.info);
        h.levelIntro(m.info.level);
        break;
      case 'fx':
        if (this.game.maze) for (const f of m.list) this.game.playFx(f);
        break;
      case 'toast':
        h.toast(m.m, m.c);
        break;
      case 'clear':
        h.levelClear(m.level, m.bonus);
        break;
      case 'event':
        h.event(m.e);
        break;
      case 'over':
        h.over(m.reason, m.won);
        break;
      case 'pause':
        h.pause();
        break;
      case 'resume':
        h.resume();
        break;
      case 'bye':
        this.link.close();
        break;
    }
  }

  private onState(buf: ArrayBuffer) {
    const type = new Uint8Array(buf)[0];
    if (this.isHost && type === INPUT) {
      const p = decodeInput(buf);
      // Drop input from an older level, and late arrivals (the state channel may reorder).
      if (p.epoch !== this.epoch || (this.padSeq >= 0 && ((p.seq - this.padSeq) & 0xffff) > 0x8000)) return;
      this.padSeq = p.seq;
      const pad = this.input.pads[1];
      // Only a new steer sets the direction, as on the host's own pad: the game may have cleared it since
      // (the doll's red light does), and the guest's last direction must not come back on its own.
      if (this.turns >= 0 && p.turns !== this.turns) pad.dir = p.dir;
      pad.fireHeld = p.held;
      if (this.shots >= 0 && p.shots !== this.shots) pad.tapFire();
      if (this.drops >= 0 && p.drops !== this.drops) pad.pressBomb();
      this.turns = p.turns;
      this.shots = p.shots;
      this.drops = p.drops;
    } else if (!this.isHost && type === SNAPSHOT) {
      const s = decodeSnapshot(buf);
      if (s.epoch !== this.epoch || (this.cur && s.seq <= this.cur.seq)) return;
      this.arrive(s);
    }
  }

  // ------------------------------------------------------------ guest

  private sendPad(now: number) {
    const pad = this.input.pads[0];
    const key = `${this.epoch},${pad.dir},${pad.turns},${pad.fireHeld},${pad.shots},${pad.drops}`;
    if (key === this.sentPad && now - this.sentAt < INPUT_MS) return;
    this.sentPad = key;
    this.sentAt = now;
    this.inputSeq = (this.inputSeq + 1) & 0xffff;
    this.link.send(
      'state',
      encodeInput({
        epoch: this.epoch, seq: this.inputSeq, dir: pad.dir, turns: pad.turns, held: pad.fireHeld, shots: pad.shots, drops: pad.drops,
      }),
    );
  }

  private arrive(s: Snapshot) {
    const g = this.game;
    this.from.clear();
    for (const p of g.players) this.from.set(`p${p.id}`, { x: p.x, y: p.y });
    for (const e of g.enemies) this.from.set(`e${e.id}`, { x: e.x, y: e.y });
    for (const e of g.eyes) this.from.set(`y${e.id}`, { x: e.x, y: e.y });
    for (const b of g.balls) this.from.set(`b${b.id}`, { x: b.x, y: b.y });
    for (const p of g.petShots) this.from.set(`s${p.id}`, { x: p.x, y: p.y });
    for (const p of g.pets) this.from.set(`t${p.owner}`, { x: p.x, y: p.y });
    if (g.item) this.from.set('i', { x: g.item.x, y: g.item.y });
    prune(this.players, s.players.map((p) => p.id));
    prune(this.enemies, s.enemies.map((e) => e.id));
    prune(this.eyes, s.eyes.map((e) => e.id));
    prune(this.ballsShown, s.balls.map((b) => b.id));
    prune(this.shotsShown, s.shots.map((e) => e.id));
    prune(this.pets, s.pets.map((p) => p.owner));
    this.cur = s;
    this.curAt = performance.now();

    g.phase = s.phase;
    g.timeLeft = s.timeLeft;
    g.score = s.score;
    g.bombStock = s.bombStock;
    g.pelletCount = s.pelletCount;
    g.remoteQueued = s.queued;
    g.warnings = s.warnings;
    g.scare = s.scare;
    g.reverse = s.reverse;
    g.light = s.light;
    g.lightLeft = s.lightLeft;
    g.lightLen = s.lightLen;
    g.zaps = s.zaps;
    g.effects = new Map(s.effects);
    g.bombs = s.bombs;
    s.umbrellas.forEach((u, i) => {
      const o = g.umbrellas[i];
      if (o) Object.assign(o, u);
    });
    s.doors.forEach((open, i) => {
      if (g.doors[i]) g.doors[i].open = open;
    });
  }

  /** Slides everything from where it was drawn towards the latest snapshot over one snapshot interval. */
  private show(now: number, dt: number) {
    const s = this.cur;
    const g = this.game;
    if (!s || !g.maze) return;
    const k = Math.min(1, (now - this.curAt) / SNAPSHOT_MS);
    /** Moves `o` and returns how far it went (0 after a jump). */
    const place = (key: string, o: Pos, to: Pos) => {
      const f = this.from.get(key);
      let x = to.x;
      let y = to.y;
      if (f && Math.abs(f.x - to.x) + Math.abs(f.y - to.y) < JUMP) {
        x = f.x + (to.x - f.x) * k;
        y = f.y + (to.y - f.y) * k;
      }
      const moved = Math.abs(x - o.x) + Math.abs(y - o.y);
      o.x = x;
      o.y = y;
      return moved < JUMP ? moved : 0;
    };

    g.players = s.players.map((sp) => {
      const p = keep(this.players, sp.id, () => ({
        ...sp, portal: -1, next: -1, walk: 0, cooldown: 0, emote: 'none' as Emote, emoteTime: 0,
      }));
      p.walk += place(`p${sp.id}`, p, sp);
      p.dir = sp.dir;
      p.face = sp.face;
      p.alive = sp.alive;
      p.invuln = sp.invuln;
      p.recoil = sp.recoil;
      if (p.emote !== sp.emote) {
        p.emote = sp.emote;
        p.emoteTime = 0;
      }
      return p;
    });
    g.enemies = s.enemies.map((se) => {
      const e = keep(this.enemies, se.id, () => ({ ...se, portal: -1, wobble: Math.random() * 10, walk: 0, eyeHits: 0 }));
      e.walk += place(`e${se.id}`, e, se);
      e.kind = se.kind;
      e.hp = se.hp;
      e.rising = se.rising;
      e.stun = se.stun;
      e.mad = se.mad;
      e.flash = se.flash;
      e.face = se.face;
      e.dir = se.dir;
      e.wobble += dt * (e.mad > 0 ? 48 : 8);
      return e;
    });
    g.eyes = s.eyes.map((se) => {
      const e = keep(this.eyes, se.id, () => ({ ...se, spin: 0, portal: -1 }));
      place(`y${se.id}`, e, se);
      e.dir = se.dir;
      e.owner = se.owner;
      e.spin += dt * 12;
      return e;
    });
    g.balls = s.balls.map((sb) => {
      const b = keep(this.ballsShown, sb.id, () => ({ ...sb, vx: 0, vy: 0, vz: 0, spin: 0, life: 1, bossCool: 0 }));
      place(`b${sb.id}`, b, sb);
      b.z = sb.z;
      b.spin += dt * 18;
      return b;
    });
    g.petShots = s.shots.map((ss) => {
      const p = keep(this.shotsShown, ss.id, () => ({ ...ss, vx: 0, vy: 0, life: 1 }));
      place(`s${ss.id}`, p, ss);
      return p;
    });
    g.pets = s.pets.map((sp) => {
      const p = keep(this.pets, sp.owner, () => ({ ...sp, cooldown: 0 }));
      place(`t${sp.owner}`, p, sp);
      p.kind = sp.kind;
      p.life = sp.life;
      return p;
    });
    if (s.item) {
      const it = g.item && g.item.kind === s.item.kind ? g.item : { ...s.item, dir: -1, portal: -1 };
      place('i', it, s.item);
      it.life = s.item.life;
      it.max = s.item.max;
      g.item = it;
    } else g.item = null;
  }
}

function keep<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  let v = map.get(key);
  if (!v) {
    v = make();
    map.set(key, v);
  }
  return v;
}

function prune<K, V>(map: Map<K, V>, live: K[]) {
  const set = new Set(live);
  for (const k of map.keys()) if (!set.has(k)) map.delete(k);
}
