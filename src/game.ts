import { audio, type Sfx } from './audio';
import {
  ANNIVERSARY_LEVEL,
  EFFECT_TIME,
  ENEMIES,
  ITEMS,
  KILL_WORDS,
  LEVEL_TIME,
  MAX_LEVEL,
  difficulty,
  type Difficulty,
  type EnemyKind,
  type ItemKind,
} from './config';
import { buzz } from './feedback';
import type { Input } from './input';
import { DIRS, bfs, generateAnniversaryMaze, generateMaze, isWall, makeRng, opposite, type Maze } from './maze';
import { PARTY_PELLET_KINDS, PELLET_KINDS } from './sprites';

export interface Mover {
  x: number;
  y: number;
  dir: number;
}

export interface Player extends Mover {
  next: number;
  face: number;
  recoil: number;
  invuln: number;
  walk: number;
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
}

export interface Eye {
  x: number;
  y: number;
  dir: number;
  spin: number;
}

export interface Item {
  kind: ItemKind;
  x: number;
  y: number;
  life: number;
  max: number;
}

export type ParticleKind = 'dot' | 'confetti' | 'note' | 'flame' | 'star';

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

export interface GameCallbacks {
  toast(text: string, color?: string): void;
  levelIntro(level: number): void;
  levelClear(level: number, bonus: number): void;
  gameOver(reason: string): void;
  victory(): void;
}

const PLAYER_SPEED = 5.2;
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
};
const CONFETTI = ['#ffd400', '#ff4081', '#40c4ff', '#69f0ae', '#ff9100', '#e040fb'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

export class Game {
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
  player!: Player;
  enemies: Enemy[] = [];
  eyes: Eye[] = [];
  item: Item | null = null;
  particles: Particle[] = [];
  popups: Popup[] = [];
  effects = new Map<ItemKind, number>();
  deathReason = '';
  killer: EnemyKind | null = null;
  kills = 0;

  private diff!: Difficulty;
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;
  private itemTimer = 0;
  private fireCooldown = 0;
  private distMap!: Int16Array;
  private distFrom = -1;
  private nextId = 1;
  private lastTick = 0;
  private hintedPellets = false;
  private hintedEnemies = false;
  private cakeGiven = false;
  private seed = Math.floor(Math.random() * 1e9);

  constructor(
    private input: Input,
    private cb: GameCallbacks,
    private dims: () => { w: number; h: number },
  ) {}

  get party() {
    return this.level === ANNIVERSARY_LEVEL;
  }

  get enemiesLeft() {
    return this.queue.length + this.enemies.length;
  }

  has(kind: ItemKind) {
    return (this.effects.get(kind) ?? 0) > 0;
  }

  start(level = 1) {
    this.score = 0;
    this.kills = 0;
    this.startLevel(level);
  }

  startLevel(level: number) {
    this.level = level;
    const { w, h } = this.dims();
    const rng = makeRng(this.seed + level * 7919);
    this.maze = this.party ? generateAnniversaryMaze(w, h, rng) : generateMaze(w, h, rng);
    const m = this.maze;
    this.pellets = new Int8Array(w * h).fill(-1);
    this.pelletCount = 0;
    const kinds = this.party ? PARTY_PELLET_KINDS : PELLET_KINDS;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isWall(m, x, y)) continue;
        if (x === m.start.x && y === m.start.y) continue;
        if (m.spawns.some((s) => s.x === x && s.y === y)) continue;
        this.pellets[y * w + x] = Math.floor(rng() * kinds);
        this.pelletCount++;
      }
    }
    this.player = {
      x: m.start.x + 0.5,
      y: m.start.y + 0.5,
      dir: -1,
      next: -1,
      face: 0,
      recoil: 0,
      invuln: 2.5,
      walk: 0,
    };
    this.enemies = [];
    this.eyes = [];
    this.item = null;
    this.popups = [];
    this.effects.clear();
    this.diff = difficulty(level);
    this.queue = this.buildQueue();
    this.spawnTimer = 1.2;
    this.itemTimer = rand(5, 10);
    this.timeLeft = LEVEL_TIME;
    this.distMap = new Int16Array(w * h);
    this.distFrom = -1;
    this.hintedPellets = false;
    this.hintedEnemies = false;
    this.cakeGiven = false;
    this.input.reset();
    this.phase = 'intro';
    this.phaseTime = 2.4;
    this.cb.levelIntro(level);
  }

  private buildQueue(): EnemyKind[] {
    const pool = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].unlock <= this.level && ENEMIES[k].weight > 0);
    const total = pool.reduce((s, k) => s + ENEMIES[k].weight, 0);
    const q: EnemyKind[] = [];
    // A newly unlocked monster always shows up on its debut level.
    const debut = pool.find((k) => ENEMIES[k].unlock === this.level);
    if (debut) q.push(debut);
    while (q.length < this.diff.total) {
      let r = Math.random() * total;
      for (const k of pool) {
        r -= ENEMIES[k].weight;
        if (r <= 0) {
          q.push(k);
          break;
        }
      }
    }
    return q.sort(() => Math.random() - 0.5);
  }

  // ------------------------------------------------------------ update

  update(dt: number) {
    this.time += dt;
    this.updateParticles(dt);
    switch (this.phase) {
      case 'intro':
        this.phaseTime -= dt;
        if (this.phaseTime <= 0) this.phase = 'play';
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'clear':
        this.phaseTime -= dt;
        if (Math.random() < dt * 30) this.confetti(1);
        if (this.phaseTime <= 0) {
          if (this.level >= MAX_LEVEL) {
            this.phase = 'won';
            this.cb.victory();
          } else this.startLevel(this.level + 1);
        }
        break;
      case 'dying':
        this.phaseTime -= dt;
        if (this.phaseTime <= 0) {
          this.phase = 'over';
          this.cb.gameOver(this.deathReason);
        }
        break;
      default:
        break;
    }
  }

  private updatePlay(dt: number) {
    const p = this.player;
    this.timeLeft -= dt;
    if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== this.lastTick) {
      this.lastTick = Math.ceil(this.timeLeft);
      this.sfx('tick');
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.die("Time's up! The monsters threw a party without you.", null);
      return;
    }

    for (const [k, t] of this.effects) {
      const nt = t - dt;
      if (nt <= 0) this.effects.delete(k);
      else this.effects.set(k, nt);
    }
    p.invuln = Math.max(0, p.invuln - dt);
    p.recoil = Math.max(0, p.recoil - dt * 6);

    // Player
    if (this.input.dir >= 0) p.next = this.input.dir;
    if (p.dir >= 0 && p.next === opposite(p.dir)) p.dir = p.next;
    const speed = PLAYER_SPEED * (this.has('spice') ? 1.55 : 1) * (this.has('pig') ? 0.8 : 1);
    const before = p.x + p.y;
    this.advance(p, speed * dt, () => this.playerDecide());
    if (p.x + p.y !== before) p.walk += dt * speed;
    this.eatPellet();

    // Shooting
    this.fireCooldown -= dt;
    const fire = this.input.consumeFire();
    const maxEyes = this.has('coffee') ? 7 : 3;
    if (fire && this.fireCooldown <= 0 && this.eyes.length < maxEyes) {
      const d = DIRS[p.face];
      this.eyes.push({ x: p.x + d.x * 0.3, y: p.y + d.y * 0.3, dir: p.face, spin: 0 });
      this.fireCooldown = this.has('coffee') ? 0.11 : 0.3;
      p.recoil = 1;
      this.sfx('shoot');
    }
    this.updateEyes(dt);

    // Distance map for chasing monsters.
    const pt = Math.floor(p.y) * this.maze.w + Math.floor(p.x);
    if (pt !== this.distFrom) {
      bfs(this.maze, Math.floor(p.x), Math.floor(p.y), this.distMap);
      this.distFrom = pt;
    }

    this.updateEnemies(dt);
    if (this.phase !== 'play') return;

    // Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.queue.length && this.enemies.length < this.diff.maxActive) {
      this.spawnEnemy(this.queue.pop()!);
      this.spawnTimer = this.diff.spawnEvery;
    }

    this.updateItem(dt);

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

    if (this.pelletCount === 0 && this.enemiesLeft > 0 && !this.hintedPellets) {
      this.hintedPellets = true;
      this.cb.toast('All bits collected! Now bonk the monsters!', '#69f0ae');
    }
    if (this.enemiesLeft === 0 && this.pelletCount > 0 && !this.hintedEnemies) {
      this.hintedEnemies = true;
      this.cb.toast('Monsters gone! Grab the last bits!', '#69f0ae');
    }
    if (this.pelletCount === 0 && this.enemiesLeft === 0) this.levelClear();
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
        decide();
        decided = true;
        continue;
      }
      if (off <= 1e-6) {
        m.x = cx;
        m.y = cy;
        if (!decided) {
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
      decide();
      decided = true;
    }
  }

  private open(x: number, y: number, d: number) {
    return !isWall(this.maze, x + DIRS[d].x, y + DIRS[d].y);
  }

  private playerDecide() {
    const p = this.player;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (p.next >= 0) {
      if (this.open(tx, ty, p.next)) p.dir = p.next;
      else if (p.dir < 0) p.face = p.next;
    }
    if (p.dir >= 0) {
      if (this.open(tx, ty, p.dir)) p.face = p.dir;
      else p.dir = -1;
    }
  }

  private eatPellet() {
    const p = this.player;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (Math.abs(p.x - tx - 0.5) > 0.35 || Math.abs(p.y - ty - 0.5) > 0.35) return;
    const i = ty * this.maze.w + tx;
    if (this.pellets[i] < 0) return;
    this.pellets[i] = -1;
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
        if (isWall(this.maze, Math.floor(e.x + d.x * 0.15), Math.floor(e.y + d.y * 0.15))) {
          this.burst(e.x, e.y, ['#ffffff', '#ffcdd2'], 5, 0.06);
          return false;
        }
        for (const en of this.enemies) {
          if (en.rising > 0) continue;
          const r = fatHit * (en.kind === 'minipumpkin' ? 0.8 : 1);
          if (Math.abs(en.x - e.x) < r && Math.abs(en.y - e.y) < r) {
            this.hitEnemy(en);
            return false;
          }
        }
      }
      return true;
    });
  }

  private hitEnemy(e: Enemy) {
    e.hp--;
    e.flash = 0.15;
    if (e.hp > 0) {
      this.sfx('hit');
      this.popup(e.x, e.y - 0.4, 'OUCH!', '#ffeb3b', 0.35);
      return;
    }
    this.killEnemy(e, pick(KILL_WORDS));
  }

  private killEnemy(e: Enemy, word: string) {
    const idx = this.enemies.indexOf(e);
    if (idx < 0) return;
    this.enemies.splice(idx, 1);
    this.kills++;
    const pts = ENEMIES[e.kind].points;
    this.addScore(pts);
    this.popup(e.x, e.y - 0.3, `${word} +${pts * (this.party ? 2 : 1)}`, '#fff', 0.42);
    this.burst(e.x, e.y, SPLAT[e.kind], 16, 0.1);
    this.sfx('kill');
    buzz('light');
    if (e.kind === 'pumpkin' && this.level >= 5) {
      for (const s of [-1, 1]) this.addEnemy('minipumpkin', e.x, e.y, 0, s > 0 ? e.dir : opposite(e.dir));
      this.popup(e.x, e.y + 0.2, 'Pumpkin split!', '#ff9800', 0.32);
    }
    if (e.kind === 'vampire') {
      for (let i = 0; i < 2; i++) this.addEnemy('bat', e.x, e.y, 0, i ? e.dir : opposite(e.dir));
      this.popup(e.x, e.y + 0.2, 'Bats! Bats everywhere!', '#ce93d8', 0.32);
    }
  }

  private spawnEnemy(kind: EnemyKind) {
    const m = this.maze;
    const options = m.spawns
      .map((s) => ({ s, d: this.distMap[s.y * m.w + s.x] }))
      .filter((o) => o.d < 0 || o.d >= 5);
    const choice = options.length ? pick(options).s : m.spawns.reduce((a, b) => (this.distMap[b.y * m.w + b.x] > this.distMap[a.y * m.w + a.x] ? b : a));
    this.addEnemy(kind, choice.x + 0.5, choice.y + 0.5, 0.9, -1);
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
      hp: def.hp + this.diff.hpBonus,
      rising,
      stun: 0,
      mad: 0,
      flash: 0,
      wobble: Math.random() * 10,
      walk: 0,
      face: 1,
    });
  }

  private enemySpeed(e: Enemy) {
    const base = ENEMIES[e.kind].speed * this.diff.speedMul * (this.party ? 0.9 : 1);
    return Math.min(7.5, base) * (this.has('eclair') ? 0.55 : 1);
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    const frozen = this.has('computer');
    const cricket = this.has('cricket');
    for (const e of [...this.enemies]) {
      e.wobble += dt * 8;
      e.flash = Math.max(0, e.flash - dt);
      if (e.rising > 0) {
        e.rising -= dt;
        continue;
      }
      if (cricket && e.mad <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 3.5) {
        e.mad = 0.9;
        this.popup(e.x, e.y - 0.4, pick(['?!', 'AAAH!', 'TOO LOUD!', 'MY EARS!']), '#b2ff59', 0.3);
      }
      if (e.mad > 0) {
        e.mad -= dt;
        e.wobble += dt * 40;
        if (e.mad <= 0) this.killEnemy(e, 'BONKERS!');
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

      const reach = (this.has('pig') ? 0.75 : 0.6) * (this.has('eclair') ? 1.15 : 1);
      if (Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < reach) {
        if (frozen) {
          this.killEnemy(e, 'Ctrl+Alt+Del!');
        } else if (e.stun > 0) {
          // Dizzy monsters are harmless.
        } else if (this.has('pig')) {
          e.stun = 2.5;
          e.dir = opposite(e.dir);
          this.popup(e.x, e.y - 0.4, 'BOING!', '#f48fb1', 0.4);
          this.sfx('boing');
          this.addScore(50);
        } else if (p.invuln <= 0) {
          this.die(ENEMIES[e.kind].deathLine, e.kind);
          return;
        }
      }
    }
  }

  /** Ghosts and witches drift through walls straight towards the minder. */
  private float(e: Enemy, speed: number, dt: number) {
    const p = this.player;
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
      const p = this.player;
      const w = this.maze.w;
      if (e.kind === 'pumpkin' || e.kind === 'minipumpkin') {
        // Ambush: aim a few tiles ahead of where the minder is heading.
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

  private updateItem(dt: number) {
    const p = this.player;
    if (!this.item) {
      this.itemTimer -= dt;
      if (this.itemTimer <= 0) this.spawnItem();
      return;
    }
    const it = this.item;
    it.life -= dt;
    if (it.life <= 0) {
      this.item = null;
      this.itemTimer = rand(6, 12);
      return;
    }
    if (Math.abs(it.x - p.x) < 0.65 && Math.abs(it.y - p.y) < 0.65) {
      this.item = null;
      this.itemTimer = rand(8, 15);
      this.applyItem(it.kind, it.x, it.y);
    }
  }

  private spawnItem() {
    const m = this.maze;
    const p = this.player;
    const tiles: number[] = [];
    for (let i = 0; i < m.w * m.h; i++) {
      const x = i % m.w;
      const y = (i - x) / m.w;
      if (m.walls[i] || Math.abs(x + 0.5 - p.x) + Math.abs(y + 0.5 - p.y) < 4) continue;
      tiles.push(i);
    }
    if (!tiles.length) return;
    const i = pick(tiles);
    let kind: ItemKind;
    if (this.party && !this.cakeGiven) {
      kind = 'cake';
      this.cakeGiven = true;
    } else {
      const pool = (Object.keys(ITEMS) as ItemKind[]).filter((k) => ITEMS[k].weight > 0);
      const total = pool.reduce((s, k) => s + ITEMS[k].weight, 0);
      let r = Math.random() * total;
      kind = pool.find((k) => (r -= ITEMS[k].weight) <= 0) ?? 'candy';
    }
    const life = rand(10, 15);
    this.item = { kind, x: (i % m.w) + 0.5, y: Math.floor(i / m.w) + 0.5, life, max: life };
    this.sfx('appear');
  }

  private applyItem(kind: ItemKind, x: number, y: number) {
    const def = ITEMS[kind];
    this.cb.toast(def.toast, kind === 'beer' ? '#ffcc80' : '#fff59d');
    this.burst(x, y, ['#fff59d', '#ffffff', '#ffd54f'], 14, 0.08, 'star');
    buzz('medium');
    const sounds: Record<ItemKind, Sfx> = {
      cricket: 'chirp', spice: 'spice', pig: 'oink', eclair: 'nom', beer: 'burp',
      computer: 'bsod', coffee: 'slurp', candy: 'candy', cake: 'candy',
    };
    this.sfx(sounds[kind]);
    if (kind === 'candy') {
      this.addScore(1000);
      this.popup(x, y - 0.3, '+1000', '#ffd54f', 0.5);
      return;
    }
    if (kind === 'cake') {
      this.addScore(1200);
      this.popup(x, y - 0.3, 'HAPPY 12TH! +1200', '#ffd400', 0.5);
      this.confetti(80);
      return;
    }
    this.effects.set(kind, EFFECT_TIME);
    if (kind === 'computer') this.popup(x, y - 0.4, ':(', '#82b1ff', 0.6);
  }

  private addScore(n: number) {
    this.score += n * (this.party ? 2 : 1);
  }

  private die(reason: string, killer: EnemyKind | null) {
    this.phase = 'dying';
    this.phaseTime = 2.4;
    this.deathReason = reason;
    this.killer = killer;
    this.effects.clear();
    audio.stopMusic();
    this.sfx('death');
    buzz('error');
  }

  private levelClear() {
    const mult = this.party ? 2 : 1;
    const bonus = (Math.ceil(this.timeLeft) * 10 + this.level * 100) * mult;
    this.score += bonus;
    this.phase = 'clear';
    this.phaseTime = 3;
    this.effects.clear();
    this.eyes = [];
    this.sfx('clear');
    buzz('medium');
    this.confetti(60);
    this.cb.levelClear(this.level, bonus);
  }

  // ------------------------------------------------------------ effects

  private sfx(s: Sfx) {
    audio.play(s);
  }

  popup(x: number, y: number, text: string, color: string, size: number) {
    this.popups.push({ x, y, text, life: 1.1, color, size });
  }

  burst(x: number, y: number, colors: string[], n: number, size: number, kind: ParticleKind = 'dot') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(1, 4);
      this.particles.push({
        kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: rand(0.4, 0.8), max: 0.8, color: pick(colors), size: size * rand(0.6, 1.4), rot: a,
      });
    }
  }

  confetti(n: number) {
    const m = this.maze;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        kind: 'confetti', x: rand(0, m.w), y: rand(-2, 0), vx: rand(-1, 1), vy: rand(2, 5),
        life: rand(2, 3.5), max: 3.5, color: pick(CONFETTI), size: rand(0.12, 0.22), rot: rand(0, 6),
      });
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'dot' || p.kind === 'star') {
        p.vx *= 1 - dt * 4;
        p.vy *= 1 - dt * 4;
      }
      if (p.kind === 'confetti') p.rot += dt * 6;
      if (p.kind === 'flame') p.size *= 1 - dt * 1.5;
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.popups) {
      t.life -= dt;
      t.y -= dt * 0.9;
    }
    this.popups = this.popups.filter((t) => t.life > 0);
  }
}
