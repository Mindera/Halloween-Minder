/**
 * 🤫 The title screen's secret. Throw the Minder three times and, as it springs home after the third,
 * a plank appears under its feet and it starts bouncing up into the night sky:
 *
 * - Steer left and right (arrows / A-D, or hold a finger or the mouse to either side); it bounces on its own.
 *   It wraps around the sides.
 * - Planks: wood, ghost planks (dashed: they vanish after one bounce) and bat-carried planks that fly sideways.
 *   A pumpkin on a plank is a trampoline, and a broom flies you straight up for a moment.
 * - Grab IT bits and candy. Bats and ghosts get in the way: land on their heads or shoot them with an eyeball
 *   (tap / Space). Bump into one and the Minder cries and falls.
 * - Fall off the bottom and the page scrolls back down to the title, where the Minder drops back into its spot
 *   and shows its score. The best score and height are kept on the device.
 *
 * Everything runs in its own full-screen overlay on top of the title screen, which scrolls away underneath.
 * It is dressed in Mindera's colours (from mindera.com): brand yellow on black. The climber is the selected
 * Minder, wearing whatever it has on from the Wardrobe, and finding the game earns the 🥚 secret sticker.
 */
import { audio } from './audio';
import { buzz } from './feedback';
import { t, ta, uiFont } from './i18n';
import { outfit, settings } from './progress';
import { drawCape, drawHat } from './render';
import { MONSTER_ART, bake, drawEyeball, drawGooglyEye, textU } from './sprites';

type G = CanvasRenderingContext2D;

// Base values for a ~420px wide column; everything is scaled by `S`.
const GRAVITY = 2100; // px/s²
const JUMP = 930; // px/s: a normal bounce rises JUMP² / 2g ≈ 206px
const SPRING = 1.6; // pumpkin trampoline: 2.5× higher
const RUN = 430; // px/s sideways
const ACCEL = 2800; // px/s²
const BROOM_TIME = 1.6; // s
const BROOM_SPEED = 1350; // px/s
const SHOT_SPEED = 1150; // px/s
const SHOT_COOLDOWN = 0.28; // s
const POINT = 24; // px climbed per point
const MAX_GAP = 0.86 * ((JUMP * JUMP) / (2 * GRAVITY));
const CAMERA_LINE = 0.42; // the camera follows once the Minder rises above this fraction of the screen
const KEY = 'hm.climb';

/** Mindera's colours, from mindera.com: brand yellow, black and their greys. */
const M = {
  yellow: '#ffc700',
  gold: '#d9a900',
  black: '#0a0a0b',
  ink: '#232326',
  grey: '#3d3d42',
  stone: '#57575f',
  mist: '#eaeaeb',
  cream: '#fff9e5',
};
const SPARK_COLORS = [M.yellow, M.cream, '#ffffff', M.gold];
/** The IT bits to collect, in yellow code. */
const BITS: [string, number][] = [
  ['0', 0.34],
  ['1', 0.34],
  ['{}', 0.26],
  ['</>', 0.21],
  ['01', 0.26],
];

export interface ClimbStart {
  /** The title Minder: the game starts from its spot, and the climber lands back there at the end. */
  home: HTMLImageElement;
  /** The title panel, which scrolls away underneath. */
  panel: HTMLElement;
  /** The selected Minder (its id, kept with the best score), its picture, the colour of its eyeballs and where its eye is (0..1). */
  minder: string;
  src: string;
  iris: string;
  eye: [number, number];
  /** Shown as the game opens, e.g. the sticker for finding it. */
  announce?: string;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

export interface ClimbBest {
  score: number;
  /** Highest point reached, in unscaled px. */
  height: number;
  /** Who set the best score, and when (records from before these were kept have neither). */
  minder?: string;
  date?: number;
}
type Best = ClimbBest;

function loadBest(): Best {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Best> | null;
    if (raw && typeof raw.score === 'number') {
      return {
        score: raw.score,
        height: Number(raw.height) || 0,
        minder: typeof raw.minder === 'string' ? raw.minder : undefined,
        date: typeof raw.date === 'number' ? raw.date : undefined,
      };
    }
  } catch {
    /* ignore */
  }
  return { score: 0, height: 0 };
}

/** The best climb on this device, or null if the secret climb was never played (for the High scores screen). */
export function climbRecord(): ClimbBest | null {
  const b = loadBest();
  return b.score > 0 || b.height > 0 ? b : null;
}

function saveBest(b: Best) {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

type Phase = 'intro' | 'play' | 'dead' | 'return' | 'land' | 'settle';
type PlankKind = 'wood' | 'ghost' | 'bat';

interface Plank {
  /** Centre, in column coordinates. */
  x: number;
  /** Top surface, in world coordinates (screen y when the camera is at the bottom). */
  y: number;
  w: number;
  kind: PlankKind;
  vx: number;
  /** Seconds since a ghost plank was used up (it fades away), or -1 while it is solid. */
  gone: number;
  /** Springy wobble after a bounce (1 → 0). */
  bob: number;
  pumpkin: boolean;
  squash: number;
  seed: number;
}

interface Pickup {
  kind: 'bit' | 'candy' | 'broom';
  x: number;
  y: number;
  art: number;
  phase: number;
}

interface Foe {
  kind: 'bat' | 'ghost';
  x: number;
  y: number;
  /** Ghosts sway around here. */
  baseX: number;
  vx: number;
  phase: number;
  dead: boolean;
  vy: number;
  spin: number;
  angle: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
  text?: string;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

export class Climb {
  active = false;
  private root?: HTMLDivElement;
  private canvas?: HTMLCanvasElement;
  private g?: G;
  private scoreEl?: HTMLElement;
  private bestEl?: HTMLElement;
  private hintEl?: HTMLElement;
  private bubble?: HTMLElement;
  private bubbleTimer = 0;
  /** The title Minder (where it starts and lands) and the picture drawn while climbing. */
  private home!: HTMLImageElement;
  private sprite!: HTMLImageElement;
  private panel!: HTMLElement;
  private iris = '#3a7bd5';
  private eye: [number, number] = [0.5, 0.35];
  private frame = 0;
  private prev = 0;
  private dpr = 1;
  private W = 0;
  private H = 0;
  /** The playing column: the whole screen on phones, a centred strip on wide screens. */
  private colX = 0;
  private colW = 0;
  private S = 1;

  private phase: Phase = 'intro';
  private phaseT = 0;
  private time = 0;
  private cam = 0;
  private returnFrom = 0;
  private returnTime = 1;
  private fade = 1;

  // The Minder: x is its centre in column coordinates, y its feet in world coordinates.
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private size = 0;
  private aspect = 1;
  private facing = 1;
  private squash = 0;
  private angle = 0;
  private spin = 0;
  private broom = 0;
  private homeX = 0;
  private homeY = 0;
  private homeSize = 0;
  private gameSize = 0;

  private planks: Plank[] = [];
  private pickups: Pickup[] = [];
  private foes: Foe[] = [];
  private shots: { x: number; y: number; spin: number }[] = [];
  private sparks: Spark[] = [];
  private stars: Star[] = [];
  private top = 0;
  private lastFoe = 0;
  private lastBroom = 0;
  private cooldown = 0;

  private startY = 0;
  private climbed = 0;
  private bonus = 0;
  private best: Best = { score: 0, height: 0 };
  private minder = '';
  private passedBest = false;
  private shown = { score: '', best: '' };

  private left = false;
  private right = false;
  private pointer: number | null = null;
  private pointerX = 0;
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private moved = 0;

  private plankFill?: CanvasGradient;
  private art = {
    bits: [] as HTMLCanvasElement[],
    candy: null as HTMLCanvasElement | null,
    bat: [] as HTMLCanvasElement[],
    ghost: [] as HTMLCanvasElement[],
  };

  private onKey = (e: KeyboardEvent) => this.key(e, e.type === 'keydown');
  private onBlur = () => {
    this.left = this.right = false;
    this.pointer = null;
  };
  private onResize = () => this.resize();
  private onBubbleTap = () => this.dismissBubble(true);

  /** Starts from the title Minder's spot. Returns false when it can't (image hidden or not loaded). */
  start({ home, panel, minder, src, iris, eye, announce }: ClimbStart): boolean {
    if (this.active || !home.offsetWidth || !home.naturalWidth) return false;
    this.dismissBubble();
    this.active = true;
    this.minder = minder;
    this.home = home;
    this.panel = panel;
    this.iris = iris;
    this.eye = eye;
    // Always the selected Minder (the title shows the same picture, so it is normally already loaded).
    const sprite = new Image();
    sprite.src = src;
    this.sprite = sprite.complete && sprite.naturalWidth ? sprite : home;
    if (this.sprite !== sprite) {
      void sprite
        .decode()
        .then(() => {
          this.sprite = sprite;
          this.aspect = sprite.naturalWidth / sprite.naturalHeight;
        })
        .catch(() => undefined);
    }
    const img = home;
    img.classList.add('climbing');
    // Space and Enter steer the game now, not whatever button underneath had focus.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const r = img.getBoundingClientRect();

    const root = document.createElement('div');
    root.className = 'climb';
    root.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    root.innerHTML = `<div class="climb-hud"><span>${t('hud.score')}<b></b></span><span>${t('climb.best')}<b></b></span></div><p class="climb-badge" hidden></p><p class="climb-hint"></p>`;
    root.prepend(canvas);
    document.body.appendChild(root);
    this.root = root;
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    [this.scoreEl, this.bestEl] = [...root.querySelectorAll<HTMLElement>('.climb-hud b')];
    this.hintEl = root.querySelector<HTMLElement>('.climb-hint')!;
    this.hintEl.textContent = t(touch ? 'climb.hintTouch' : 'climb.hintKeys');
    this.shown = { score: '', best: '' };
    if (announce) {
      const badge = root.querySelector<HTMLElement>('.climb-badge')!;
      badge.textContent = `🥚 ${announce}`;
      badge.hidden = false;
      window.setTimeout(() => badge.classList.add('gone'), 3600);
      window.setTimeout(() => this.root === root && audio.play('item'), 450);
    }

    this.resize();
    this.S = clamp(this.colW / 420, 0.8, 1.2);
    this.bakeArt();
    this.plankFill = undefined;
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.6, 1.8), phase: rand(0, 6.3) }));

    this.aspect = this.sprite.naturalWidth / this.sprite.naturalHeight;
    this.homeSize = r.height;
    this.gameSize = clamp(this.colW * 0.17, 54, 74);
    this.homeX = r.left + r.width / 2 - this.colX;
    this.homeY = r.bottom;
    this.x = this.homeX;
    this.y = this.homeY;
    this.vx = this.vy = this.squash = this.angle = this.spin = this.broom = 0;
    this.size = this.homeSize;
    this.facing = 1;

    this.phase = 'intro';
    this.phaseT = 0;
    this.time = 0;
    this.cam = 0;
    this.fade = 1;
    this.startY = this.homeY;
    this.climbed = 0;
    this.bonus = 0;
    this.cooldown = 0;
    this.best = loadBest();
    this.passedBest = this.best.score === 0;
    this.planks = [];
    this.pickups = [];
    this.foes = [];
    this.shots = [];
    this.sparks = [];
    this.left = this.right = false;
    this.pointer = null;
    // The plank that appears under its feet.
    this.planks.push(this.plank(this.homeX, this.homeY, 96 * this.S, 'wood'));
    this.top = this.homeY;
    this.lastFoe = this.homeY;
    this.lastBroom = this.homeY;
    this.generate(-this.H);

    panel.classList.add('climbing');
    root.addEventListener('pointerdown', (e) => this.down(e));
    root.addEventListener('pointermove', (e) => this.move(e));
    root.addEventListener('pointerup', (e) => this.up(e));
    root.addEventListener('pointercancel', (e) => this.up(e, true));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    audio.play('appear');
    buzz('light');
    this.prev = performance.now();
    const loop = (now: number) => {
      if (!this.active) return;
      const dt = Math.min(1 / 30, Math.max(0, (now - this.prev) / 1000));
      this.prev = now;
      this.update(dt);
      if (!this.active) return;
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
    return true;
  }

  /** Tears it all down at once (e.g. when leaving the title screen). */
  stop() {
    this.dismissBubble();
    if (!this.active) return;
    this.cleanup();
  }

  private cleanup() {
    this.active = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    this.root?.remove();
    this.root = this.canvas = this.g = undefined;
    this.home.classList.remove('climbing');
    this.panel.classList.remove('climbing');
    this.panel.style.transform = '';
  }

  // ------------------------------------------------------------ input

  private key(e: KeyboardEvent, down: boolean) {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.left = down;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.right = down;
        break;
      case 'Space':
      case 'Enter':
      case 'ArrowUp':
      case 'KeyW':
      case 'KeyJ':
      case 'KeyK':
        if (down && !e.repeat) this.shoot();
        break;
      case 'Escape':
        if (down && (this.phase === 'play' || this.phase === 'intro')) this.die(false);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  private down(e: PointerEvent) {
    e.preventDefault();
    if (this.pointer !== null) {
      // A second finger: shoot.
      this.shoot();
      return;
    }
    try {
      this.root?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.pointer = e.pointerId;
    this.pointerX = this.downX = e.clientX;
    this.downY = e.clientY;
    this.downAt = performance.now();
    this.moved = 0;
  }

  private move(e: PointerEvent) {
    if (e.pointerId !== this.pointer) return;
    this.pointerX = e.clientX;
    this.moved = Math.max(this.moved, Math.hypot(e.clientX - this.downX, e.clientY - this.downY));
  }

  private up(e: PointerEvent, cancel = false) {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    // A quick tap shoots; holding steers.
    if (!cancel && this.moved < 14 && performance.now() - this.downAt < 220) this.shoot();
  }

  private shoot() {
    if (this.phase !== 'play' || this.cooldown > 0 || this.shots.length >= 4) return;
    this.cooldown = SHOT_COOLDOWN;
    this.shots.push({ x: this.x, y: this.y - this.size * (1 - this.eye[1]), spin: 0 });
    audio.play('shoot');
  }

  // ------------------------------------------------------------ world

  private resize() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const oldW = this.colW;
    this.W = W;
    this.H = H;
    this.colW = Math.min(W, 520);
    this.colX = (W - this.colW) / 2;
    if (oldW && oldW !== this.colW) {
      // Keep everything in the same place relative to the column.
      const k = this.colW / oldW;
      for (const o of [...this.planks, ...this.pickups, ...this.foes, ...this.shots, ...this.sparks]) o.x *= k;
      for (const f of this.foes) f.baseX *= k;
      this.x *= k;
      this.homeX *= k;
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas) {
      this.canvas.width = Math.round(W * this.dpr);
      this.canvas.height = Math.round(H * this.dpr);
    }
  }

  private bakeArt() {
    const k = this.S * this.dpr;
    this.art.bits = BITS.map(([glyph, size]) => bake(70 * k, (g) => textU(g, glyph, 0, 0.01, size, M.yellow), 1, 'rgba(255,199,0,0.75)').canvas);
    this.art.candy = bake(46 * k, drawCandy, 1.6, 'rgba(255,199,0,0.8)').canvas;
    // A yellow glow keeps the dark bats visible on Mindera black.
    this.art.bat = [0, 1].map((f) => bake(44 * MONSTER_ART.bat.scale * k, (g) => MONSTER_ART.bat.draw(g, f), 1.6, 'rgba(255,199,0,0.9)').canvas);
    this.art.ghost = [0, 1].map((f) => bake(50 * MONSTER_ART.ghost.scale * k, (g) => MONSTER_ART.ghost.draw(g, f), 1.6, 'rgba(255,249,229,0.5)').canvas);
  }

  private plank(x: number, y: number, w: number, kind: PlankKind): Plank {
    return { x, y, w, kind, vx: 0, gone: -1, bob: 0, pumpkin: false, squash: 0, seed: Math.random() };
  }

  private randX(margin: number) {
    return rand(margin, Math.max(margin, this.colW - margin));
  }

  /** Adds planks, goodies and monsters up to world height `toY`. Harder the higher it gets. */
  private generate(toY: number) {
    const S = this.S;
    while (this.top > toY) {
      const h = (this.startY - this.top) / S;
      const d = clamp(h / 14000, 0, 1);
      const gap = Math.min(MAX_GAP, lerp(58, 165, d) * rand(0.75, 1.1)) * S;
      const y = this.top - gap;
      const w = lerp(86, 60, d) * S;
      const flying = h > 1800 && Math.random() < lerp(0.08, 0.38, d);
      const p = this.plank(this.randX(w / 2 + 4), y, w, flying ? 'bat' : 'wood');
      if (flying) p.vx = rand(55, 70 + 120 * d) * S * (Math.random() < 0.5 ? -1 : 1);
      this.planks.push(p);
      // Early on, rows often have a twin plank (sometimes a ghost one higher up).
      if (!flying && Math.random() < lerp(0.42, 0.05, d)) {
        for (let i = 0; i < 4; i++) {
          const x2 = this.randX(w / 2 + 4);
          if (Math.abs(x2 - p.x) < w * 1.3) continue;
          this.planks.push(this.plank(x2, y + rand(-10, 10) * S, w, h > 1200 && Math.random() < 0.5 ? 'ghost' : 'wood'));
          break;
        }
      }
      // Ghost planks in between: a bonus step, never the only way up.
      if (h > 1200 && Math.random() < 0.3) this.planks.push(this.plank(this.randX(w / 2 + 4), y + gap * 0.5, w, 'ghost'));
      if (h > 500 && !flying && Math.random() < 0.07) p.pumpkin = true;
      // Goodies.
      if (Math.random() < 0.45) {
        this.pickups.push({ kind: 'bit', x: clamp(p.x + rand(-w / 3, w / 3), 16, this.colW - 16), y: y - rand(36, 64) * S, art: (Math.random() * BITS.length) | 0, phase: rand(0, 6.3) });
      } else if (Math.random() < 0.12) {
        // A little arc of bits.
        const cx = this.randX(60 * S);
        for (let i = -1; i <= 1; i++) {
          this.pickups.push({ kind: 'bit', x: cx + i * 30 * S, y: y + gap * 0.5 + Math.abs(i) * 14 * S, art: (Math.random() * BITS.length) | 0, phase: i });
        }
      }
      if (h > 900 && Math.random() < 0.035) this.pickups.push({ kind: 'candy', x: this.randX(24 * S), y: y - rand(50, 90) * S, art: 0, phase: 0 });
      if (h > 2600 && this.lastBroom - y > 3200 * S && Math.random() < 0.06) {
        this.lastBroom = y;
        this.pickups.push({ kind: 'broom', x: this.randX(30 * S), y: y - 70 * S, art: 0, phase: 0 });
      }
      // Monsters, spaced out.
      if (h > 1100 && this.lastFoe - y > lerp(950, 380, d) * S && Math.random() < lerp(0.2, 0.45, d)) {
        this.lastFoe = y;
        const bat = Math.random() < 0.6;
        const fx = this.randX(30 * S);
        this.foes.push({
          kind: bat ? 'bat' : 'ghost',
          x: fx,
          y: y + gap * 0.5,
          baseX: fx,
          vx: bat ? rand(60, 90 + 110 * d) * S * (Math.random() < 0.5 ? -1 : 1) : 0,
          phase: rand(0, 6.3),
          dead: false,
          vy: 0,
          spin: 0,
          angle: 0,
        });
      }
      this.top = y;
    }
  }

  get score() {
    return Math.floor(this.climbed / (POINT * this.S)) + this.bonus;
  }

  // ------------------------------------------------------------ update

  private update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    const S = this.S;
    if (this.phase === 'intro' || this.phase === 'play') {
      if (settings.slow) dt *= 0.8;
      this.cooldown = Math.max(0, this.cooldown - dt);
      // Shrink from title size to game size as it starts.
      this.size = lerp(this.homeSize, this.gameSize, easeOut(clamp(this.time / 0.7, 0, 1)));
    }
    if (this.time > 4 && this.hintEl && !this.hintEl.classList.contains('gone')) this.hintEl.classList.add('gone');

    switch (this.phase) {
      case 'intro':
        // The plank grows under its feet, the Minder crouches, then off it goes.
        this.squash = clamp((this.phaseT - 0.2) / 0.25, 0, 1) * 0.6;
        if (this.phaseT >= 0.45) {
          this.phase = 'play';
          this.phaseT = 0;
          this.vy = -JUMP * S;
          this.squash = 0;
          this.planks[0].bob = 1;
          audio.play('hop');
        }
        break;
      case 'play':
        this.play(dt);
        break;
      case 'dead':
        this.vy += GRAVITY * S * dt;
        this.y += this.vy * dt;
        this.angle += this.spin * dt;
        if (this.y - this.size + this.cam > this.H) this.goHome();
        break;
      case 'return': {
        const k = easeInOut(clamp(this.phaseT / this.returnTime, 0, 1));
        this.cam = this.returnFrom * (1 - k);
        this.fade = 1 - k;
        if (this.phaseT >= this.returnTime) {
          // Drop back in from the top of the screen.
          this.phase = 'land';
          this.phaseT = 0;
          this.cam = 0;
          this.fade = 0;
          this.x = this.homeX;
          this.size = this.homeSize;
          this.y = -8;
          this.vy = 0;
          this.vx = 0;
          this.angle = 0;
          this.spin = 0;
          this.broom = 0;
          this.facing = 1;
        }
        break;
      }
      case 'land':
        this.vy += GRAVITY * S * dt;
        this.y += this.vy * dt;
        if (this.y >= this.homeY) {
          this.y = this.homeY;
          this.vy = 0;
          this.squash = 1;
          this.phase = 'settle';
          this.phaseT = 0;
          audio.play('boing');
          buzz('medium');
        }
        break;
      case 'settle':
        if (this.phaseT >= 0.5) {
          this.finish();
          return;
        }
        break;
    }

    this.squash = this.phase === 'intro' ? this.squash : Math.max(0, this.squash - dt * 4.5);
    for (const p of this.planks) {
      p.bob = Math.max(0, p.bob - dt * 3);
      p.squash = Math.max(0, p.squash - dt * 4);
      if (p.gone >= 0) p.gone += dt;
    }
    this.planks = this.planks.filter((p) => p.gone < 0.4);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (!s.text) s.vy += 900 * S * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const f of this.foes) {
      if (!f.dead) continue;
      f.vy += GRAVITY * S * dt;
      f.y += f.vy * dt;
      f.angle += f.spin * dt;
    }
    if (this.panel) this.panel.style.transform = this.cam > 0.5 ? `translateY(${this.cam}px)` : '';
    this.updateHud();
  }

  private play(dt: number) {
    const S = this.S;
    // Steering: keys, or towards a held finger / mouse.
    const dir = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    let target = dir * RUN * S;
    if (!dir && this.pointer !== null) target = clamp((this.pointerX - this.colX - this.x) * 7, -RUN * S, RUN * S);
    const accel = (dir || this.pointer !== null ? ACCEL : ACCEL * 0.6) * S * dt;
    this.vx += clamp(target - this.vx, -accel, accel);
    if (Math.abs(this.vx) > 40 * S) this.facing = Math.sign(this.vx);
    this.x += this.vx * dt;
    if (this.x < 0) this.x += this.colW;
    if (this.x >= this.colW) this.x -= this.colW;
    this.angle = (this.vx / (RUN * S)) * 0.16;

    const prevY = this.y;
    if (this.broom > 0) {
      this.broom -= dt;
      this.vy = -BROOM_SPEED * S;
      for (let i = 0; i < 2; i++) {
        this.spark(this.x + rand(-10, 10) * S, this.y + 4 * S, rand(-60, 60) * S, rand(150, 320) * S, SPARK_COLORS[(Math.random() * 4) | 0], rand(2, 4) * S, 0.5);
      }
      if (this.broom <= 0) this.vy = -JUMP * 0.55 * S;
    } else this.vy += GRAVITY * S * dt;
    this.y += this.vy * dt;

    // Land on planks (only from above, only while falling).
    const half = this.size * this.aspect * 0.5;
    if (this.vy > 0 && this.broom <= 0) {
      for (const p of this.planks) {
        if (p.gone >= 0 || prevY > p.y + 1 || this.y < p.y) continue;
        if (Math.abs(this.x - p.x) > p.w / 2 + half * 0.45) continue;
        this.bounce(p);
        break;
      }
    }

    for (const p of this.planks) {
      if (p.kind !== 'bat') continue;
      p.x += p.vx * dt;
      if ((p.x < p.w / 2 && p.vx < 0) || (p.x > this.colW - p.w / 2 && p.vx > 0)) p.vx = -p.vx;
    }

    // The camera only goes up.
    const line = this.H * CAMERA_LINE;
    if (this.y - this.size + this.cam < line) this.cam = line - (this.y - this.size);
    this.climbed = Math.max(this.climbed, this.startY - this.y);

    // Goodies.
    const cy = this.y - this.size * 0.5;
    this.pickups = this.pickups.filter((it) => {
      const r = (it.kind === 'bit' ? 16 : 24) * S;
      if (Math.abs(it.x - this.x) > half * 0.7 + r || Math.abs(it.y - cy) > this.size * 0.45 + r) return true;
      if (it.kind === 'bit') {
        this.bonus += 5;
        this.pop(it.x, it.y, '+5', M.yellow, 15);
        audio.play('pellet');
      } else if (it.kind === 'candy') {
        this.bonus += 25;
        this.pop(it.x, it.y, '+25', M.yellow, 18);
        audio.play('candy');
      } else {
        this.broom = BROOM_TIME;
        this.pop(it.x, it.y, t('pop.woohoo'), M.cream, 20);
        audio.play('warp');
        buzz('medium');
      }
      for (let i = 0; i < 6; i++) this.spark(it.x, it.y, rand(-120, 120) * S, rand(-220, 0) * S, it.kind === 'bit' ? M.yellow : M.cream, rand(1.5, 3) * S, 0.45);
      return false;
    });

    // Monsters.
    for (const f of this.foes) {
      if (f.dead) continue;
      if (f.kind === 'bat') {
        f.x += f.vx * dt;
        if ((f.x < 26 * S && f.vx < 0) || (f.x > this.colW - 26 * S && f.vx > 0)) f.vx = -f.vx;
      } else {
        f.x = f.baseX + Math.sin(this.time * 1.1 + f.phase) * Math.min(70 * S, this.colW * 0.22);
      }
      const fy = this.foeY(f);
      const r = (f.kind === 'bat' ? 19 : 17) * S;
      const nx = clamp(f.x, this.x - half * 0.55, this.x + half * 0.55);
      const ny = clamp(fy, this.y - this.size * 0.85, this.y);
      if (Math.hypot(f.x - nx, fy - ny) > r) continue;
      if (this.broom > 0) this.bonk(f);
      else if (this.vy > 0 && this.y <= fy) {
        this.bonk(f);
        this.vy = -JUMP * S;
        this.squash = 1;
      } else {
        this.die(true);
        return;
      }
    }

    // Eyeballs.
    for (const s of this.shots) {
      s.y -= SHOT_SPEED * S * dt;
      s.spin += dt * 12;
      for (const f of this.foes) {
        if (f.dead || Math.hypot(f.x - s.x, this.foeY(f) - s.y) > 26 * S) continue;
        this.bonk(f);
        s.y = -Infinity;
        break;
      }
    }
    this.shots = this.shots.filter((s) => s.y + this.cam > -40);

    if (!this.passedBest && this.score > this.best.score) {
      this.passedBest = true;
      this.pop(this.x, this.y - this.size - 10 * S, t('climb.newBest'), M.yellow, 20);
      audio.play('item');
    }

    // Build ahead, forget what fell off the bottom.
    this.generate(-this.cam - this.H);
    const bottom = this.H - this.cam + 120 * S;
    this.planks = this.planks.filter((p) => p.y < bottom);
    this.pickups = this.pickups.filter((p) => p.y < bottom);
    this.foes = this.foes.filter((f) => f.y < bottom + (f.dead ? this.H : 0));

    if (this.y - this.size + this.cam > this.H) {
      audio.play('fall');
      this.goHome();
    }
  }

  /** Monsters bob up and down as they fly. */
  private foeY(f: Foe) {
    return f.dead ? f.y : f.y + Math.sin(this.time * (f.kind === 'bat' ? 4 : 2) + f.phase) * 8 * this.S;
  }

  private bounce(p: Plank) {
    const S = this.S;
    this.y = p.y;
    this.squash = 1;
    p.bob = 1;
    if (p.pumpkin) {
      this.vy = -JUMP * SPRING * S;
      p.squash = 1;
      this.pop(p.x, p.y - 30 * S, t('pop.boing'), M.yellow, 18);
      audio.play('boing');
      buzz('light');
    } else {
      this.vy = -JUMP * S;
      audio.play('hop');
    }
    if (p.kind === 'ghost') {
      p.gone = 0;
      for (let i = 0; i < 8; i++) this.spark(p.x + rand(-p.w / 2, p.w / 2), p.y, rand(-40, 40) * S, rand(-140, -40) * S, 'rgba(255,199,0,0.6)', rand(3, 6) * S, 0.5);
    }
  }

  private bonk(f: Foe) {
    const S = this.S;
    f.dead = true;
    f.vy = -260 * S;
    f.spin = rand(-9, 9);
    this.bonus += 20;
    const words = ta('killWords');
    this.pop(f.x, f.y - 22 * S, words[(Math.random() * words.length) | 0] ?? 'BONK!', M.yellow, 18);
    for (let i = 0; i < 10; i++) this.spark(f.x, f.y, rand(-200, 200) * S, rand(-260, 40) * S, f.kind === 'bat' ? M.yellow : M.cream, rand(2, 4) * S, 0.5);
    audio.play('kill');
    buzz('light');
  }

  private die(hit: boolean) {
    this.phase = 'dead';
    this.phaseT = 0;
    this.broom = 0;
    this.vx = 0;
    this.vy = -420 * this.S;
    this.spin = (this.facing || 1) * 7;
    this.pop(this.x, this.y - this.size - 8 * this.S, t('pop.waah'), '#81d4fa', 22);
    // Tears.
    for (let i = 0; i < 6; i++) {
      this.spark(this.x + (i % 2 ? 1 : -1) * this.size * 0.15, this.y - this.size * (1 - this.eye[1]), (i % 2 ? 1 : -1) * rand(60, 160) * this.S, rand(-260, -120) * this.S, '#81d4fa', rand(2.5, 4) * this.S, 0.7);
    }
    if (hit) audio.play('hit');
    audio.play('cry');
    buzz(hit ? 'heavy' : 'medium');
  }

  /** The page scrolls back down to the title screen. */
  private goHome() {
    this.phase = 'return';
    this.phaseT = 0;
    this.returnFrom = this.cam;
    this.returnTime = clamp(0.55 + this.cam / 5000, 0.6, 1.5);
    this.root?.classList.add('ending');
    this.panel.classList.remove('climbing');
    const best = this.best;
    const score = this.score;
    const height = this.climbed / this.S;
    if (score > best.score) saveBest({ score, height: Math.max(height, best.height), minder: this.minder, date: Date.now() });
    else if (height > best.height) saveBest({ ...best, height });
  }

  private finish() {
    const score = this.score;
    const isBest = score > this.best.score && score > 0;
    const best = Math.max(score, this.best.score);
    this.cleanup();
    this.showBubble(score, isBest, best);
    if (isBest) audio.play('clear');
  }

  /** "SCORE 41 · New best!" above the Minder's head, like a speech bubble. */
  private showBubble(score: number, isBest: boolean, best: number) {
    this.dismissBubble();
    const r = this.home.getBoundingClientRect();
    if (!r.width) return;
    const b = document.createElement('div');
    b.className = `climb-bubble${isBest ? ' new' : ''}`;
    b.innerHTML = `<small>${t('hud.score')}</small><b>${score.toLocaleString('en-US')}</b><em></em>`;
    b.querySelector('em')!.textContent = isBest ? t('climb.newBest') : t('climb.bestWas', { n: best.toLocaleString('en-US') });
    b.style.left = `${r.left + r.width / 2}px`;
    b.style.top = `${r.top - 6}px`;
    document.body.appendChild(b);
    this.bubble = b;
    this.bubbleTimer = window.setTimeout(this.onBubbleTap, 5000);
    window.setTimeout(() => this.bubble === b && window.addEventListener('pointerdown', this.onBubbleTap), 300);
  }

  private dismissBubble(animate = false) {
    window.clearTimeout(this.bubbleTimer);
    window.removeEventListener('pointerdown', this.onBubbleTap);
    const b = this.bubble;
    if (!b) return;
    this.bubble = undefined;
    if (!animate) {
      b.remove();
      return;
    }
    b.classList.add('out');
    window.setTimeout(() => b.remove(), 400);
  }

  private spark(x: number, y: number, vx: number, vy: number, color: string, r: number, life: number) {
    if (this.sparks.length > 220) return;
    this.sparks.push({ x, y, vx, vy, color, r, life, max: life });
  }

  private pop(x: number, y: number, text: string, color: string, size: number) {
    this.sparks.push({ x, y, vx: 0, vy: -70 * this.S, color, r: size * this.S, life: 0.9, max: 0.9, text });
  }

  private updateHud() {
    const score = this.score.toLocaleString('en-US');
    const best = Math.max(this.best.score, this.score).toLocaleString('en-US');
    if (this.scoreEl && score !== this.shown.score) this.scoreEl.textContent = this.shown.score = score;
    if (this.bestEl && best !== this.shown.best) this.bestEl.textContent = this.shown.best = best;
  }

  // ------------------------------------------------------------ drawing

  private draw() {
    const g = this.g;
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    this.drawSky(g);
    const wide = this.colW < this.W - 2;
    if (this.fade > 0) {
      g.save();
      g.globalAlpha = this.fade;
      if (wide) this.drawEdges(g);
      g.beginPath();
      g.rect(this.colX, 0, this.colW, this.H);
      g.clip();
      this.drawBestLine(g);
      for (const p of this.planks) this.drawPlank(g, p);
      for (const it of this.pickups) this.drawPickup(g, it);
      for (const f of this.foes) this.drawFoe(g, f);
      for (const s of this.shots) drawEyeball(g, this.colX + s.x, s.y + this.cam, 8 * this.S, 0, -1, this.iris, s.spin);
      this.drawSparks(g);
      g.restore();
    }
    // While the page scrolls home the Minder is out of sight; it drops back in from the top afterwards.
    if (this.phase === 'return') return;
    if (this.phase === 'land' || this.phase === 'settle') this.drawMinder(g, this.colX + this.x);
    else {
      g.save();
      g.beginPath();
      g.rect(this.colX, 0, this.colW, this.H);
      g.clip();
      // Drawn twice near a side, so it slides through one edge and out of the other.
      this.drawMinder(g, this.colX + this.x);
      const half = this.size * this.aspect * 0.6;
      if (this.x < half) this.drawMinder(g, this.colX + this.x + this.colW);
      if (this.x > this.colW - half) this.drawMinder(g, this.colX + this.x - this.colW);
      g.restore();
    }
  }

  /** Mindera black closes in over the title, then grey clouds, a big yellow moon and more stars as it climbs. */
  private drawSky(g: G) {
    const { W, H, cam } = this;
    const veil = lerp(0.62, 1, clamp(cam / (H * 0.8), 0, 1)) * clamp(this.time / 0.5, 0, 1) * this.fade;
    if (veil > 0) {
      g.globalAlpha = veil;
      g.fillStyle = M.black;
      g.fillRect(0, 0, W, H);
    }
    const sky = clamp(cam / (H * 0.9), 0, 1);
    if (sky <= 0) {
      g.globalAlpha = 1;
      return;
    }
    const stars = clamp((cam - H * 0.4) / (H * 3), 0, 1);
    if (stars > 0) {
      for (const [i, s] of this.stars.entries()) {
        const y = (((s.y * H + cam * 0.2) % H) + H) % H;
        g.globalAlpha = stars * (0.4 + 0.6 * Math.abs(Math.sin(this.time * 1.5 + s.phase)));
        g.fillStyle = i % 5 ? M.cream : M.yellow;
        g.beginPath();
        g.arc(s.x * W, y, s.r, 0, Math.PI * 2);
        g.fill();
      }
    }
    // The moon slides past slowly.
    const my = -H * 0.3 + cam * 0.1;
    const mr = Math.min(W, H) * 0.12;
    if (my > -mr * 2 && my < H + mr * 2) {
      const mx = W * 0.8;
      g.globalAlpha = sky;
      const glow = g.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.6);
      glow.addColorStop(0, 'rgba(255,199,0,0.32)');
      glow.addColorStop(1, 'rgba(255,199,0,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(mx, my, mr * 2.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = M.yellow;
      g.beginPath();
      g.arc(mx, my, mr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(160,110,0,0.35)';
      for (const [cx, cy, cr] of [
        [-0.3, -0.2, 0.18],
        [0.25, 0.1, 0.24],
        [-0.1, 0.4, 0.12],
        [0.35, -0.4, 0.1],
      ]) {
        g.beginPath();
        g.arc(mx + cx * mr, my + cy * mr, cr * mr, 0, Math.PI * 2);
        g.fill();
      }
      // A witch flies across it now and then, in black.
      const k = (this.time % 14) / 14;
      if (k < 0.35) {
        const wx = mx - mr * 1.6 + (k / 0.35) * mr * 3.2;
        const wy = my + Math.sin(k * 30) * mr * 0.06 - mr * 0.1;
        this.drawWitch(g, wx, wy, mr * 0.45);
      }
    }
    // Drifting grey clouds, in two layers.
    for (let layer = 0; layer < 2; layer++) {
      const span = H * 1.4;
      const size = (layer ? 1.2 : 0.8) * Math.min(W, 520) * 0.004;
      g.globalAlpha = sky * (layer ? 0.75 : 0.5);
      for (let i = 0; i < 3; i++) {
        const y = ((((i + 0.2 + layer * 0.45) / 3) * span + cam * (layer ? 0.5 : 0.3)) % span) - H * 0.2;
        const x = ((((i * 0.618 + layer * 0.3) % 1) * (W + 300) + this.time * (8 + layer * 6)) % (W + 300)) - 150;
        this.drawCloud(g, x, y, size);
      }
    }
    g.globalAlpha = 1;
  }

  private drawCloud(g: G, x: number, y: number, s: number) {
    g.fillStyle = M.ink;
    g.beginPath();
    g.arc(x, y, 34 * s, 0, Math.PI * 2);
    g.arc(x + 40 * s, y - 14 * s, 42 * s, 0, Math.PI * 2);
    g.arc(x + 86 * s, y, 32 * s, 0, Math.PI * 2);
    g.arc(x + 44 * s, y + 14 * s, 36 * s, 0, Math.PI * 2);
    g.fill();
  }

  private drawWitch(g: G, x: number, y: number, s: number) {
    g.save();
    g.translate(x, y);
    g.fillStyle = M.black;
    g.strokeStyle = M.black;
    g.lineWidth = s * 0.08;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-s * 0.9, s * 0.1);
    g.lineTo(s * 0.8, -s * 0.05);
    g.stroke();
    g.beginPath();
    g.moveTo(-s * 0.9, s * 0.1);
    g.lineTo(-s * 1.3, -s * 0.12);
    g.lineTo(-s * 1.3, s * 0.32);
    g.fill();
    g.beginPath();
    g.arc(0, -s * 0.18, s * 0.22, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-s * 0.25, -s * 0.3);
    g.lineTo(s * 0.25, -s * 0.3);
    g.lineTo(-s * 0.05, -s * 0.85);
    g.fill();
    g.restore();
  }

  /** On wide screens the column's sides glow yellow: off one side, back in on the other. */
  private drawEdges(g: G) {
    for (const [x, dir] of [
      [this.colX, 1],
      [this.colX + this.colW, -1],
    ]) {
      const grad = g.createLinearGradient(x, 0, x + dir * 18, 0);
      grad.addColorStop(0, 'rgba(255,199,0,0.28)');
      grad.addColorStop(1, 'rgba(255,199,0,0)');
      g.fillStyle = grad;
      g.fillRect(Math.min(x, x + dir * 18), 0, 18, this.H);
    }
  }

  private drawBestLine(g: G) {
    if (this.best.height <= 0) return;
    const y = this.startY - this.best.height * this.S + this.cam;
    if (y < -10 || y > this.H + 10) return;
    g.save();
    g.strokeStyle = M.yellow;
    g.globalAlpha *= 0.8;
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.beginPath();
    g.moveTo(this.colX, y);
    g.lineTo(this.colX + this.colW, y);
    g.stroke();
    g.setLineDash([]);
    g.font = `700 ${Math.round(12 * this.S)}px ${uiFont()}`;
    g.fillStyle = M.cream;
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.fillText(`🏆 ${t('climb.best')}`, this.colX + this.colW - 8, y - 4);
    g.restore();
  }

  /** Planks are Mindera-yellow bars; ghost ones are a dashed outline; bat-carried ones are cream. */
  private drawPlank(g: G, p: Plank) {
    const S = this.S;
    const intro = this.phase === 'intro' && p === this.planks[0] ? easeOut(clamp(this.phaseT / 0.25, 0, 1)) : 1;
    const w = p.w * intro;
    const h = 12 * S;
    const x = this.colX + p.x;
    const y = p.y + this.cam + Math.sin(p.bob * 9) * p.bob * 5 * S;
    if (y < -40 || y > this.H + 40) return;
    g.save();
    // Drawn from the plank's top centre, so the cached gradient lines up.
    g.translate(x, y);
    if (p.kind === 'ghost') {
      g.globalAlpha *= p.gone >= 0 ? Math.max(0, 1 - p.gone / 0.4) : 0.9;
      g.fillStyle = 'rgba(255,199,0,0.08)';
      g.strokeStyle = 'rgba(255,199,0,0.75)';
      g.lineWidth = 2;
      g.setLineDash([6, 5]);
      g.beginPath();
      g.roundRect(-w / 2, 0, w, h, h / 2);
      g.fill();
      g.stroke();
      g.restore();
      return;
    }
    if (p.kind === 'bat') {
      // Two little grey bats with yellow eyes carry it.
      const flap = Math.sin(this.time * 18 + p.seed * 6) * 0.5 + 0.5;
      for (const s of [-1, 1]) {
        const bx = s * (w / 2 - 4 * S);
        g.fillStyle = M.stone;
        g.beginPath();
        g.moveTo(bx, 2 * S);
        g.quadraticCurveTo(bx + s * 10 * S, -(6 + flap * 10) * S, bx + s * 20 * S, -(2 + flap * 8) * S);
        g.quadraticCurveTo(bx + s * 12 * S, 2 * S, bx, 4 * S);
        g.fill();
        g.beginPath();
        g.ellipse(bx, S, 5 * S, 6 * S, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = M.yellow;
        g.fillRect(bx - 2.6 * S, -1.5 * S, 1.6 * S, 1.6 * S);
        g.fillRect(bx + 1 * S, -1.5 * S, 1.6 * S, 1.6 * S);
      }
    }
    g.fillStyle = p.kind === 'bat' ? M.cream : this.yellowFill(g);
    g.strokeStyle = M.black;
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(-w / 2, 0, w, h, h / 2);
    g.fill();
    g.stroke();
    // A soft highlight along the top.
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-w / 2 + h / 2, 2.5 * S);
    g.lineTo(w / 2 - h / 2, 2.5 * S);
    g.stroke();
    g.restore();
    if (p.pumpkin) this.drawPumpkin(g, x, y, p.squash);
  }

  /** Made once per game: it only depends on the plank height. */
  private yellowFill(g: G): CanvasGradient {
    if (!this.plankFill) {
      this.plankFill = g.createLinearGradient(0, 0, 0, 12 * this.S);
      this.plankFill.addColorStop(0, '#ffd84d');
      this.plankFill.addColorStop(0.5, M.yellow);
      this.plankFill.addColorStop(1, M.gold);
    }
    return this.plankFill;
  }

  /** The trampoline: a yellow pumpkin with a black grin that squashes when you land on it. */
  private drawPumpkin(g: G, x: number, y: number, squash: number) {
    const S = this.S;
    const sy = 1 - squash * 0.45;
    const sx = 1 + squash * 0.25;
    const rx = 15 * S * sx;
    const ry = 12 * S * sy;
    const cy = y - ry;
    g.save();
    g.fillStyle = M.yellow;
    g.strokeStyle = M.black;
    g.lineWidth = 1.5;
    for (const [dx, k] of [
      [-0.45, 0.62],
      [0.45, 0.62],
      [0, 0.7],
    ]) {
      g.beginPath();
      g.ellipse(x + dx * rx, cy, rx * k, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.fillStyle = M.black;
    g.fillRect(x - 2 * S, cy - ry - 5 * S * sy, 4 * S, 6 * S * sy);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + s * rx * 0.2, cy - ry * 0.15);
      g.lineTo(x + s * rx * 0.55, cy - ry * 0.15);
      g.lineTo(x + s * rx * 0.38, cy - ry * 0.5);
      g.fill();
    }
    g.beginPath();
    g.ellipse(x, cy + ry * 0.3, rx * 0.4, ry * 0.18, 0, 0, Math.PI);
    g.fill();
    g.restore();
  }

  private drawPickup(g: G, it: Pickup) {
    const x = this.colX + it.x;
    const y = it.y + this.cam + Math.sin(this.time * 3 + it.phase) * 4 * this.S;
    if (y < -60 || y > this.H + 60) return;
    if (it.kind === 'broom') {
      this.drawBroom(g, x, y, -0.5 + Math.sin(this.time * 3) * 0.12, 1);
      return;
    }
    const c = it.kind === 'bit' ? this.art.bits[it.art] : this.art.candy;
    if (!c) return;
    const w = c.width / this.dpr;
    g.drawImage(c, x - w / 2, y - w / 2, w, w);
  }

  private drawBroom(g: G, x: number, y: number, angle: number, scale: number) {
    const S = this.S * scale;
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.strokeStyle = M.cream;
    g.lineWidth = 4 * S;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-26 * S, 0);
    g.lineTo(20 * S, 0);
    g.stroke();
    g.fillStyle = M.yellow;
    g.beginPath();
    g.moveTo(18 * S, -3 * S);
    g.lineTo(38 * S, -11 * S);
    g.lineTo(40 * S, 0);
    g.lineTo(38 * S, 11 * S);
    g.lineTo(18 * S, 3 * S);
    g.fill();
    g.strokeStyle = M.gold;
    g.lineWidth = 1.2 * S;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(20 * S, i * 0.8 * S);
      g.lineTo(38 * S, i * 4 * S);
      g.stroke();
    }
    g.fillStyle = M.black;
    g.fillRect(16 * S, -4 * S, 4 * S, 8 * S);
    g.restore();
  }

  private drawFoe(g: G, f: Foe) {
    const sx = this.colX + f.x;
    const sy = this.foeY(f) + this.cam;
    if (sy < -60 || sy > this.H + 60) return;
    const art = MONSTER_ART[f.kind];
    const frames = f.kind === 'bat' ? this.art.bat : this.art.ghost;
    const c = frames[Math.floor(this.time * (f.kind === 'bat' ? 8 : 3) + f.phase) % 2];
    const w = c.width / this.dpr;
    const tile = w / 1.6;
    g.save();
    g.translate(sx, sy);
    if (f.dead) {
      g.rotate(f.angle);
      g.globalAlpha *= 0.85;
    } else if (f.kind === 'ghost') g.globalAlpha *= 0.82 + Math.sin(this.time * 4 + f.phase) * 0.1;
    g.drawImage(c, -w / 2, -w / 2, w, w);
    // Googly eyes that watch the Minder.
    g.scale(tile, tile);
    const lx = this.colX + this.x - sx;
    const ly = this.y - this.size * 0.6 + this.cam - sy;
    for (const e of art.eyes) drawGooglyEye(g, e.x, e.y, e.r, f.dead ? 0.3 : lx, f.dead ? -1 : ly, this.time * 3);
    g.restore();
  }

  private drawSparks(g: G) {
    for (const s of this.sparks) {
      const k = s.life / s.max;
      const x = this.colX + s.x;
      const y = s.y + this.cam;
      if (s.text) {
        g.save();
        g.globalAlpha = this.fade * Math.min(1, k * 2);
        g.font = `700 ${Math.round(s.r * (1.15 - k * 0.15))}px ${uiFont()}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        // Keep "+5" the right way round in right-to-left languages.
        if (/^[+\d]/.test(s.text)) g.direction = 'ltr';
        g.lineWidth = 4;
        g.strokeStyle = M.black;
        g.lineJoin = 'round';
        g.strokeText(s.text, x, y);
        g.fillStyle = s.color;
        g.fillText(s.text, x, y);
        g.restore();
        continue;
      }
      g.globalAlpha = k * this.fade;
      g.fillStyle = s.color;
      g.beginPath();
      g.arc(x, y, s.r * (0.5 + k * 0.5), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = this.fade;
  }

  /** The selected Minder, in its Wardrobe hat and cape. */
  private drawMinder(g: G, sx: number) {
    const h = this.size;
    const w = h * this.aspect;
    const sy = this.y + this.cam;
    if (sy - h > this.H + 10 || sy < -h * 2) return;
    const q = this.squash;
    // Squashed when landing, stretched while shooting up.
    const stretch = this.phase === 'play' && this.vy < 0 ? clamp(-this.vy / (JUMP * this.S), 0, 1.4) * 0.06 : 0;
    const scaleX = (1 + q * 0.22 - stretch) * (this.phase === 'play' || this.phase === 'dead' ? this.facing : 1);
    const scaleY = 1 - q * 0.22 + stretch;
    g.save();
    g.translate(sx, sy);
    if (this.broom > 0) this.drawBroom(g, 0, 2 * this.S, Math.sin(this.time * 20) * 0.04, 1.3);
    if (this.phase === 'dead') {
      g.translate(0, -h / 2);
      g.rotate(this.angle);
      g.translate(0, h / 2);
    } else g.rotate(this.angle);
    g.scale(scaleX, scaleY);
    // Costumes are drawn around the picture's centre.
    g.translate(0, -h / 2);
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 10;
    g.shadowOffsetY = 4;
    if (outfit.cape) drawCape(g, w, h, this.time);
    g.drawImage(this.sprite, -w / 2, -h / 2, w, h);
    if (outfit.hat) drawHat(g, outfit.hat, w, h);
    g.restore();
  }
}

/** A Mindera candy: yellow with black stripes, in cream wrappers (tile units, like the game's sprites). */
function drawCandy(g: G) {
  g.fillStyle = M.cream;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.16, 0);
    g.lineTo(s * 0.4, -0.16);
    g.lineTo(s * 0.36, 0);
    g.lineTo(s * 0.4, 0.16);
    g.closePath();
    g.fill();
  }
  g.fillStyle = M.yellow;
  g.beginPath();
  g.arc(0, 0, 0.2, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(0, 0, 0.2, 0, Math.PI * 2);
  g.clip();
  g.strokeStyle = M.black;
  g.lineWidth = 0.05;
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(i * 0.1 - 0.2, -0.25);
    g.lineTo(i * 0.1 + 0.2, 0.25);
    g.stroke();
  }
  g.restore();
}
