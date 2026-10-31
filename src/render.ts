import { BOSS_PHOTO, ENEMIES } from './config';
import type { Enemy, Game, Player } from './game';
import { CRATE, DIRS, WALL, type Maze } from './maze';
import { MONSTER_ART, SpriteBank, bake, drawBomb, drawEyeball, drawGooglyEye, drawTombstone, type Sprite } from './sprites';
import { THEMES, type ThemeArt } from './themes';
import { isRtl, t as tr, uiFont } from './i18n';
import { outfit, settings } from './progress';

const PLAYER_TAGS = ['#ffd400', '#18ffff'];

export interface MinderLook {
  img: HTMLImageElement;
  iris: string;
  /** Eye position in the picture, 0..1. */
  eye: [number, number];
}

interface MinderArt extends MinderLook {
  red: HTMLCanvasElement;
}

const RAINBOW = ['#ff4081', '#ffd400', '#69f0ae', '#40c4ff', '#e040fb'];
const PORTAL_COLORS = ['#18ffff', '#ea80fc'];
/** Okabe-Ito colours, distinguishable with the common colour-vision deficiencies. */
const PORTAL_COLORS_CB = ['#0072B2', '#E69F00'];
const MATRIX_GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789Z:.=*+-<>';
const MATRIX: ThemeArt = {
  sky: ['#000'],
  floor: 'rgba(0,6,0,0.94)',
  glow: '#00ff41',
  body: '#001a06',
  highlight: '#00802a',
  ambient: 'fog',
  ambientColor: '0,255,65',
  scenery: () => {},
};
const ERRORS = ['', 'undefined is not a function', '404', 'NaN', 'Segmentation fault', 'NullPointerException', 'it works on my machine', ':(){ :|:& };:', 'Error: monster.exe'];

/** Stable pseudo-random number per tile, so decorations don't flicker between rebuilds. */
const hash = (x: number, y: number, salt = 0) => {
  const v = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

function drawCrate(g: CanvasRenderingContext2D, hp: number) {
  g.fillStyle = '#8d5a2b';
  g.beginPath();
  g.roundRect(-0.42, -0.42, 0.84, 0.84, 0.07);
  g.fill();
  g.strokeStyle = '#5d3a1a';
  g.lineWidth = 0.06;
  g.strokeRect(-0.36, -0.36, 0.72, 0.72);
  g.lineWidth = 0.025;
  g.beginPath();
  g.moveTo(-0.36, -0.12);
  g.lineTo(0.36, -0.12);
  g.moveTo(-0.36, 0.12);
  g.lineTo(0.36, 0.12);
  g.stroke();
  g.strokeStyle = '#6d4320';
  g.lineWidth = 0.08;
  g.beginPath();
  g.moveTo(-0.33, -0.33);
  g.lineTo(0.33, 0.33);
  g.stroke();
  g.fillStyle = '#c0a080';
  for (const [x, y] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) {
    g.beginPath();
    g.arc(x, y, 0.035, 0, Math.PI * 2);
    g.fill();
  }
  if (hp <= 1) {
    g.strokeStyle = '#1a0f08';
    g.lineWidth = 0.045;
    g.beginPath();
    g.moveTo(-0.3, -0.4);
    g.lineTo(-0.05, -0.12);
    g.lineTo(-0.18, 0.08);
    g.lineTo(0.08, 0.38);
    g.moveTo(-0.05, -0.12);
    g.lineTo(0.25, -0.2);
    g.stroke();
  }
}

/** Top-down Halloween umbrella with bat-wing edges, radius 1.6 tiles. */
function drawCanopy(g: CanvasRenderingContext2D, party: boolean) {
  const R = 1.6;
  const n = 8;
  const colors = party ? RAINBOW : ['#1a0b2e', '#ff7b00'];
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 0.3;
  g.shadowOffsetY = 0.12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    g.fillStyle = colors[i % colors.length];
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, R, a0, a1);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    g.beginPath();
    g.arc(Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12, R * 0.28, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 0.04;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    g.stroke();
  }
  g.fillStyle = party ? '#ffd400' : '#9e9e9e';
  g.beginPath();
  g.arc(0, 0, 0.12, 0, Math.PI * 2);
  g.fill();
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Costumes are drawn in the minder's own coordinates (w × h picture centred on 0,0). */
function drawHat(g: CanvasRenderingContext2D, hat: 'witchHat' | 'partyHat', w: number, h: number) {
  const top = -h / 2;
  if (hat === 'witchHat') {
    g.fillStyle = '#2a1145';
    g.beginPath();
    g.ellipse(0, top + h * 0.06, w * 0.48, h * 0.07, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-w * 0.26, top + h * 0.05);
    g.lineTo(w * 0.26, top + h * 0.05);
    g.quadraticCurveTo(w * 0.05, top - h * 0.25, -w * 0.18, top - h * 0.42);
    g.quadraticCurveTo(-w * 0.12, top - h * 0.15, -w * 0.26, top + h * 0.05);
    g.fill();
    g.fillStyle = '#ff9800';
    g.fillRect(-w * 0.24, top - h * 0.02, w * 0.48, h * 0.06);
    g.fillStyle = '#ffd54f';
    g.fillRect(-w * 0.04, top - h * 0.025, w * 0.08, h * 0.07);
  } else {
    const colors = ['#ff4081', '#40c4ff', '#ffd400'];
    g.save();
    g.beginPath();
    g.moveTo(-w * 0.2, top + h * 0.08);
    g.lineTo(w * 0.2, top + h * 0.08);
    g.lineTo(w * 0.02, top - h * 0.36);
    g.closePath();
    g.clip();
    for (let i = 0; i < 6; i++) {
      g.fillStyle = colors[i % 3];
      g.fillRect(-w * 0.3, top - h * 0.38 + i * h * 0.08, w * 0.6, h * 0.08);
    }
    g.restore();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(w * 0.02, top - h * 0.37, w * 0.07, 0, Math.PI * 2);
    g.fill();
  }
}

function drawCape(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const sway = Math.sin(t * 5) * w * 0.05;
  g.fillStyle = '#14081f';
  g.beginPath();
  g.moveTo(-w * 0.32, -h * 0.05);
  g.lineTo(w * 0.32, -h * 0.05);
  g.lineTo(w * 0.52 + sway, h * 0.5);
  g.lineTo(-w * 0.52 + sway, h * 0.5);
  g.closePath();
  g.fill();
  g.fillStyle = '#b3123a';
  g.beginPath();
  g.moveTo(-w * 0.26, -h * 0.02);
  g.lineTo(w * 0.26, -h * 0.02);
  g.lineTo(w * 0.42 + sway, h * 0.47);
  g.lineTo(-w * 0.42 + sway, h * 0.47);
  g.closePath();
  g.fill();
  g.fillStyle = '#14081f';
  g.beginPath();
  g.moveTo(-w * 0.34, -h * 0.08);
  g.lineTo(-w * 0.52, -h * 0.3);
  g.lineTo(-w * 0.18, -h * 0.02);
  g.moveTo(w * 0.34, -h * 0.08);
  g.lineTo(w * 0.52, -h * 0.3);
  g.lineTo(w * 0.18, -h * 0.02);
  g.fill();
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cw = 0;
  private ch = 0;
  /** Tile size in CSS pixels and the maze's top-left corner. */
  tile = 24;
  ox = 0;
  oy = 0;
  private field: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private bank = new SpriteBank();
  private bg?: HTMLCanvasElement;
  private bgTheme = '';
  private mazeLayer?: HTMLCanvasElement;
  private matrixLayer?: HTMLCanvasElement;
  private crates: Sprite[] = [];
  private canopy?: Sprite;
  private canopyParty?: Sprite;
  private leds: { x: number; y: number; phase: number; speed: number; color: string }[] = [];
  private scan?: CanvasPattern | null;
  private mazeKey = '';
  private tomb?: Sprite;
  private blurOn = false;
  private minders: MinderArt[] = [];
  private bombSprites: Sprite[] = [];
  private bossPhoto?: HTMLImageElement;
  private ghostImg?: HTMLImageElement;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    if (BOSS_PHOTO) {
      const img = new Image();
      img.onload = () => (this.bossPhoto = img);
      img.src = `${import.meta.env.BASE_URL}${BOSS_PHOTO}`;
    }
  }

  setGhostImage(img: HTMLImageElement | undefined) {
    this.ghostImg = img;
  }

  /** One look per player (images must already be loaded). */
  setMinders(looks: MinderLook[]) {
    this.minders = looks.map((look) => {
      const img = look.img;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 256;
      c.height = img.naturalHeight || 256;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(255,20,0,0.6)';
      g.fillRect(0, 0, c.width, c.height);
      return { ...look, red: c };
    });
  }

  /** `field` is the area (in canvas CSS pixels) the maze may occupy. */
  resize(width: number, height: number, field: Rect) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = width;
    this.ch = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.field = field;
    this.bg = undefined;
    this.mazeKey = '';
  }

  private layout(m: Maze) {
    const f = this.field;
    this.tile = Math.max(8, Math.min(f.w / m.w, f.h / m.h, 64));
    this.ox = Math.round(f.x + (f.w - this.tile * m.w) / 2);
    this.oy = Math.round(f.y + (f.h - this.tile * m.h) / 2);
    const px = this.tile * this.dpr;
    this.bank.build(px);
    this.tomb = bake(px, drawTombstone, 1);
    this.crates = [1, 2].map((hp) => bake(px, (g) => drawCrate(g, hp), 1.1, 'rgba(255,170,60,0.55)'));
    this.canopy = bake(px, (g) => drawCanopy(g, false), 3.8);
    this.bombSprites = [0, 1].map((f) => bake(px, (g) => drawBomb(g, f), 1.3, 'rgba(255,140,0,0.6)'));
    this.canopyParty = bake(px, (g) => drawCanopy(g, true), 3.8);
  }

  render(game: Game) {
    const ctx = this.ctx;
    const m = game.maze;
    if (!m) return;
    const theme = THEMES[game.theme];
    const key = `${m.w}x${m.h}:${this.field.w}x${this.field.h}:${game.level}:${this.dpr}`;
    if (key !== this.mazeKey) {
      this.layout(m);
      this.mazeLayer = this.buildMazeLayer(game, theme);
      this.matrixLayer = undefined;
      this.mazeKey = key;
    }
    const matrix = game.has('rabbit');
    if (matrix && !this.matrixLayer) this.matrixLayer = this.buildMazeLayer(game, MATRIX, true);
    if (!this.bg || this.bgTheme !== game.theme) this.bg = this.buildBackground(game.theme, theme);

    const blur = game.has('beer');
    if (blur !== this.blurOn) {
      this.blurOn = blur;
      this.canvas.style.filter = blur ? 'blur(1.6px) saturate(1.3)' : '';
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.direction = isRtl() ? 'rtl' : 'ltr';
    if (matrix) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.cw, this.ch);
    } else ctx.drawImage(this.bg, 0, 0, this.cw, this.ch);

    const T = this.tile;
    ctx.save();
    if (game.shake > 0) ctx.translate((Math.random() - 0.5) * T * game.shake, (Math.random() - 0.5) * T * game.shake);
    if (blur) {
      const cx = this.ox + (m.w * T) / 2;
      const cy = this.oy + (m.h * T) / 2;
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(game.time * 1.7) * 0.035);
      ctx.scale(1 + Math.sin(game.time * 2.3) * 0.02, 1 + Math.cos(game.time * 1.9) * 0.02);
      ctx.translate(-cx, -cy);
    }
    ctx.drawImage((matrix ? this.matrixLayer : this.mazeLayer)!, this.ox, this.oy, m.w * T, m.h * T);
    ctx.translate(this.ox, this.oy);

    this.drawPortals(game);
    this.drawDoors(game);
    this.drawCrates(game);
    if (matrix) {
      this.drawMatrixPellets(game);
      this.drawRain(game);
    } else {
      this.drawPellets(game);
      this.drawAmbient(game, theme);
    }
    this.drawItem(game);
    this.drawBombs(game);
    for (const e of game.enemies) this.drawEnemy(game, e);
    this.drawUmbrellas(game);
    if (matrix) {
      // Everything so far turns Matrix green; the minder (drawn next) keeps its colours.
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = '#00ff41';
      ctx.fillRect(0, 0, m.w * T, m.h * T);
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const e of game.eyes) {
      const d = DIRS[e.dir];
      drawEyeball(ctx, e.x * T, e.y * T, T * 0.21, d.x, d.y, this.minders[e.owner]?.iris ?? '#3a7bd5', e.spin);
    }
    this.drawCricketWaves(game);
    this.drawGhostRunner(game);
    for (const p of game.players) this.drawPlayer(game, p);
    this.drawPets(game);
    this.drawParticles(game);
    this.drawPopups(game);
    ctx.restore();

    if (game.has('spice')) {
      const pulse = 0.16 + Math.sin(game.time * 8) * 0.04;
      ctx.fillStyle = `rgba(255,30,0,${pulse})`;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    if (game.has('computer')) {
      ctx.fillStyle = 'rgba(30,80,255,0.08)';
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    if (game.has('roach')) this.glitch(game.time);
    if (game.scare > 0) this.drawScare(game.scare);
  }

  // ------------------------------------------------------------ static layers

  private buildBackground(id: string, theme: ThemeArt): HTMLCanvasElement {
    this.bgTheme = id;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.cw * this.dpr));
    c.height = Math.max(1, Math.round(this.ch * this.dpr));
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const w = this.cw;
    const h = this.ch;
    const grad = g.createLinearGradient(0, 0, 0, h);
    theme.sky.forEach((col, i, a) => grad.addColorStop(i / Math.max(1, a.length - 1), col));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.55})`;
      g.fillRect(rnd() * w, rnd() * h * 0.7, rnd() < 0.9 ? 1 : 2, rnd() < 0.9 ? 1 : 2);
    }
    theme.scenery(g, w, h, rnd);
    return c;
  }

  private buildMazeLayer(game: Game, theme: ThemeArt, plain = false): HTMLCanvasElement {
    const m = game.maze;
    const T = this.tile * this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.ceil(m.w * T);
    c.height = Math.ceil(m.h * T);
    const g = c.getContext('2d')!;
    const wall = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.walls[y * m.w + x] === WALL;

    g.fillStyle = theme.floor;
    g.beginPath();
    g.roundRect(T * 0.2, T * 0.2, c.width - T * 0.4, c.height - T * 0.4, T * 0.4);
    g.fill();
    if (theme.floorDeco) {
      for (let y = 1; y < m.h - 1; y++) {
        for (let x = 1; x < m.w - 1; x++) {
          if (wall(x, y)) continue;
          g.save();
          g.translate((x + 0.5) * T, (y + 0.5) * T);
          g.scale(T, T);
          theme.floorDeco(g, hash(x, y), x, y);
          g.restore();
        }
      }
    }

    const tubes = new Path2D();
    const blocks = new Path2D();
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!wall(x, y)) continue;
        const cx = (x + 0.5) * T;
        const cy = (y + 0.5) * T;
        tubes.moveTo(cx, cy);
        tubes.lineTo(cx + 0.01, cy);
        if (wall(x + 1, y)) {
          tubes.moveTo(cx, cy);
          tubes.lineTo(cx + T, cy);
        }
        if (wall(x, y + 1)) {
          tubes.moveTo(cx, cy);
          tubes.lineTo(cx, cy + T);
        }
        if (wall(x + 1, y) && wall(x, y + 1) && wall(x + 1, y + 1)) blocks.rect(cx, cy, T, T);
        // Diagonal neighbours can't be squeezed between, so join them (this is what draws the "2" on level 12).
        for (const dx of [-1, 1]) {
          if (wall(x + dx, y + 1) && !wall(x + dx, y) && !wall(x, y + 1)) {
            tubes.moveTo(cx, cy);
            tubes.lineTo(cx + dx * T, cy + T);
          }
        }
      }
    }
    let glow: string | CanvasGradient = theme.glow;
    if (game.party && !plain) {
      const lg = g.createLinearGradient(0, 0, c.width, c.height);
      RAINBOW.forEach((col, i, a) => lg.addColorStop(i / (a.length - 1), col));
      glow = lg;
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const pass = (width: number, color: string | CanvasGradient, blur = 0, dy = 0) => {
      g.save();
      g.translate(0, dy);
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = width;
      if (blur) {
        g.shadowColor = typeof color === 'string' ? color : '#ffd400';
        g.shadowBlur = blur;
      }
      g.stroke(tubes);
      g.fill(blocks);
      g.restore();
    };
    pass(T * 0.62, glow, T * 0.45);
    pass(T * 0.5, theme.body);
    pass(T * 0.16, theme.highlight, 0, -T * 0.07);

    if (!plain) this.leds = [];
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!wall(x, y)) continue;
        const r = hash(x, y, 1);
        if (theme.wallDeco) {
          g.save();
          g.translate((x + 0.5) * T, (y + 0.5) * T);
          g.scale(T, T);
          theme.wallDeco(g, r);
          g.restore();
        }
        if (!plain && theme.ambient === 'leds' && r < 0.5) {
          this.leds.push({
            x: x + 0.5 + (hash(x, y, 2) - 0.5) * 0.3,
            y: y + 0.5 + (hash(x, y, 3) - 0.5) * 0.2,
            phase: r * 20,
            speed: 1 + hash(x, y, 4) * 5,
            color: r < 0.3 ? '#00e676' : r < 0.42 ? '#ffab00' : '#ff1744',
          });
        }
      }
    }

    if (this.tomb) for (const sp of m.spawns) g.drawImage(this.tomb.canvas, sp.x * T, sp.y * T, T, T);
    return c;
  }

  // ------------------------------------------------------------ dynamic layers

  private sprite(s: Sprite, x: number, y: number, scaleX = 1, scaleY = scaleX) {
    const w = (s.canvas.width / this.dpr) * scaleX;
    const h = (s.canvas.height / this.dpr) * scaleY;
    this.ctx.drawImage(s.canvas, x - w / 2, y - h / 2, w, h);
  }

  private drawPortals(game: Game) {
    const ctx = this.ctx;
    const T = this.tile;
    game.maze.portals.forEach((pair, k) => {
      const color = (settings.colorBlind ? PORTAL_COLORS_CB : PORTAL_COLORS)[k % PORTAL_COLORS.length];
      pair.forEach((pt, end) => {
        const x = (pt.x + 0.5) * T;
        const y = (pt.y + 0.5) * T;
        const g = ctx.createRadialGradient(x, y, 0, x, y, T * 0.6);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.55 + Math.sin(game.time * 4 + end) * 0.15;
        ctx.fillStyle = g;
        ctx.fillRect(x - T * 0.6, y - T * 0.6, T * 1.2, T * 1.2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        const rot = game.time * 4 * (end ? 1 : -1);
        for (let j = 0; j < 3; j++) {
          ctx.lineWidth = T * (0.07 - j * 0.015);
          ctx.beginPath();
          ctx.arc(x, y, T * (0.14 + j * 0.11), rot + j * 2, rot + j * 2 + 3.6);
          ctx.stroke();
        }
        if (settings.colorBlind) {
          // A shape per pair, so colour isn't the only clue.
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = T * 0.04;
          ctx.beginPath();
          if (k % 2 === 0) ctx.arc(x, y, T * 0.12, 0, Math.PI * 2);
          else {
            ctx.moveTo(x, y - T * 0.14);
            ctx.lineTo(x + T * 0.13, y + T * 0.1);
            ctx.lineTo(x - T * 0.13, y + T * 0.1);
            ctx.closePath();
          }
          ctx.fill();
          ctx.stroke();
        }
      });
    });
  }

  private drawCrates(game: Game) {
    const m = game.maze;
    const T = this.tile;
    for (let i = 0; i < m.walls.length; i++) {
      if (m.walls[i] !== CRATE) continue;
      const x = i % m.w;
      const y = (i - x) / m.w;
      this.sprite(this.crates[game.crateHp[i] >= 2 ? 1 : 0], (x + 0.5) * T, (y + 0.5) * T);
    }
  }

  private drawUmbrellas(game: Game) {
    const ctx = this.ctx;
    const T = this.tile;
    const canopy = game.party ? this.canopyParty : this.canopy;
    for (const u of game.umbrellas) {
      const x = u.x * T;
      const y = u.y * T;
      if (u.anim <= 0.01) {
        // Folded umbrella lying in the corridor.
        ctx.save();
        ctx.translate(x + T * 0.18, y - T * 0.05);
        ctx.rotate(0.5);
        ctx.fillStyle = game.party ? '#e040fb' : '#2a1145';
        ctx.strokeStyle = '#ff7b00';
        ctx.lineWidth = T * 0.03;
        ctx.beginPath();
        ctx.moveTo(0, -T * 0.32);
        ctx.lineTo(T * 0.09, T * 0.12);
        ctx.lineTo(-T * 0.09, T * 0.12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#bdbdbd';
        ctx.lineWidth = T * 0.04;
        ctx.beginPath();
        ctx.moveTo(0, T * 0.12);
        ctx.lineTo(0, T * 0.3);
        ctx.arc(-T * 0.06, T * 0.3, T * 0.06, 0, Math.PI);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (!canopy) continue;
      const a = u.anim;
      const pop = a < 1 ? a * (1.15 - 0.15 * a) : 1 + Math.sin(game.time * 3 + u.x) * 0.015;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(game.time * 0.4 + u.y);
      ctx.scale(pop, pop);
      this.sprite(canopy, 0, 0);
      ctx.restore();
    }
  }

  private drawAmbient(game: Game, theme: ThemeArt) {
    const ctx = this.ctx;
    const T = this.tile;
    const t = game.time;
    const { w, h } = game.maze;
    const col = theme.ambientColor;
    const dot = (x: number, y: number, r: number, style: string) => {
      ctx.fillStyle = style;
      ctx.beginPath();
      ctx.arc(x * T, y * T, r * T, 0, Math.PI * 2);
      ctx.fill();
    };
    switch (theme.ambient) {
      case 'fog':
        for (let i = 0; i < 5; i++) {
          const x = (((i * 7.3 + t * 0.25 * (1 + (i % 2))) % (w + 6)) - 3) * T;
          const y = (((i * 5.1) % h) + 1) * T;
          const g = ctx.createRadialGradient(x, y, 0, x, y, T * 3);
          g.addColorStop(0, `rgba(${col},0.09)`);
          g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(x - T * 3, y - T * 3, T * 6, T * 6);
        }
        break;
      case 'fireflies':
        for (let i = 0; i < 14; i++) {
          const a = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
          dot(((i * 3.7) % w) + Math.sin(t * 0.7 + i) * 1.5, ((i * 5.3) % h) + Math.cos(t * 0.5 + i * 2) * 1.2, 0.06, `rgba(${col},${a})`);
        }
        break;
      case 'leaves':
        for (let i = 0; i < 12; i++) {
          const y = ((t * 0.9 + i * 2.3) % (h + 2)) - 1;
          const x = ((i * 4.1) % w) + Math.sin(t + i) * 0.8;
          ctx.save();
          ctx.translate(x * T, y * T);
          ctx.rotate(t * 2 + i);
          ctx.fillStyle = i % 2 ? `rgba(${col},0.7)` : 'rgba(200,70,30,0.7)';
          ctx.beginPath();
          ctx.ellipse(0, 0, T * 0.1, T * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        break;
      case 'embers':
        for (let i = 0; i < 18; i++) {
          const y = h + 1 - ((t * 1.1 + i * 1.7) % (h + 2));
          dot(((i * 2.9) % w) + Math.sin(t * 2 + i) * 0.3, y, 0.04, `rgba(${col},${Math.min(1, y / h)})`);
        }
        break;
      case 'bubbles':
        ctx.lineWidth = T * 0.025;
        for (let i = 0; i < 12; i++) {
          const y = h - ((t * 0.8 + i * 2.1) % (h + 1));
          const x = ((i * 3.3) % w) + Math.sin(t * 1.5 + i) * 0.2;
          ctx.strokeStyle = `rgba(${col},0.45)`;
          ctx.beginPath();
          ctx.arc(x * T, y * T, T * (0.05 + (i % 3) * 0.03), 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case 'bats':
        for (let i = 0; i < 3; i++) {
          const x = (((t * 2.2 + i * 9) % (w + 6)) - 3) * T;
          const y = (1.5 + i * 2 + Math.sin(t * 4 + i) * 0.4) * T;
          const flap = Math.sin(t * 18 + i) * T * 0.15;
          ctx.fillStyle = 'rgba(10,0,15,0.85)';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - T * 0.3, y - flap);
          ctx.lineTo(x - T * 0.12, y + T * 0.05);
          ctx.lineTo(x, y + T * 0.08);
          ctx.lineTo(x + T * 0.12, y + T * 0.05);
          ctx.lineTo(x + T * 0.3, y - flap);
          ctx.fill();
        }
        break;
      case 'confetti':
        for (let i = 0; i < 20; i++) {
          const y = ((t * 1.5 + i * 1.3) % (h + 2)) - 1;
          const x = ((i * 1.9) % w) + Math.sin(t + i) * 0.5;
          ctx.save();
          ctx.translate(x * T, y * T);
          ctx.rotate(t * 4 + i);
          ctx.fillStyle = RAINBOW[i % RAINBOW.length];
          ctx.fillRect(-T * 0.06, -T * 0.025, T * 0.12, T * 0.05);
          ctx.restore();
        }
        break;
      case 'leds':
        for (const l of this.leds) {
          if (Math.sin(t * l.speed + l.phase) < 0) continue;
          dot(l.x, l.y, 0.045, l.color);
        }
        break;
    }
  }

  private drawMatrixPellets(game: Game) {
    const ctx = this.ctx;
    const m = game.maze;
    const T = this.tile;
    ctx.font = `bold ${Math.round(T * 0.42)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7dff9a';
    const flick = Math.floor(game.time * 4);
    for (let i = 0; i < m.walls.length; i++) {
      if (game.pellets[i] < 0) continue;
      const x = i % m.w;
      const y = (i - x) / m.w;
      ctx.fillText(MATRIX_GLYPHS[Math.floor(hash(x, y, flick % 5) * MATRIX_GLYPHS.length)], (x + 0.5) * T, (y + 0.5) * T);
    }
  }

  /** Falling green code. */
  private drawRain(game: Game) {
    const ctx = this.ctx;
    const T = this.tile;
    const t = game.time;
    const { w, h } = game.maze;
    ctx.font = `bold ${Math.round(T * 0.45)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cols = w * 2;
    for (let c = 0; c < cols; c++) {
      const speed = 3 + hash(c, 0, 9) * 5;
      const head = ((t * speed + hash(c, 1, 9) * (h + 10)) % (h + 10)) - 2;
      const x = ((c + 0.5) * T) / 2;
      for (let k = 0; k < 7; k++) {
        const y = head - k * 0.55;
        if (y < -0.5 || y > h + 0.5) continue;
        const ch = MATRIX_GLYPHS[Math.floor(hash(c, Math.floor(y * 2) + (Math.floor(t * 8) % 7), 3) * MATRIX_GLYPHS.length)];
        ctx.fillStyle = k === 0 ? 'rgba(220,255,220,0.95)' : `rgba(0,255,65,${0.6 - k * 0.075})`;
        ctx.fillText(ch, x, y * T);
      }
    }
  }

  /** The cockroach "bug": shifted slices, colour bands, scanlines and error messages. */
  private glitch(t: number) {
    const ctx = this.ctx;
    const W = this.cw;
    const H = this.ch;
    const d = this.dpr;
    if (Math.random() < 0.75) {
      const n = 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const sh = 4 + Math.random() * 36;
        const sy = Math.random() * (H - sh);
        ctx.drawImage(this.canvas, 0, sy * d, W * d, sh * d, (Math.random() - 0.5) * 40, sy, W, sh);
      }
    }
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,0,90,0.14)' : 'rgba(0,255,200,0.12)';
    ctx.fillRect(0, Math.random() * H, W, 3 + Math.random() * 24);
    if (this.scan === undefined) {
      const p = document.createElement('canvas');
      p.width = 1;
      p.height = 3;
      const pg = p.getContext('2d')!;
      pg.fillStyle = 'rgba(0,0,0,0.22)';
      pg.fillRect(0, 0, 1, 1);
      this.scan = ctx.createPattern(p, 'repeat');
    }
    if (this.scan) {
      ctx.fillStyle = this.scan;
      ctx.fillRect(0, 0, W, H);
    }
    const tick = Math.floor(t * 5);
    if (tick % 2 === 0) {
      ctx.font = `bold ${Math.round(Math.max(12, W * 0.035))}px monospace`;
      ctx.textAlign = 'left';
      for (let i = 0; i < 2; i++) {
        const r1 = hash(tick, i, 5);
        const r2 = hash(tick, i, 6);
        ctx.fillStyle = i ? '#ff1744' : '#69f0ae';
        ctx.fillText(ERRORS[Math.floor(hash(tick, i, 7) * ERRORS.length)] || tr('pop.bugMessage'), r1 * W * 0.5, 40 + r2 * (H - 80));
      }
    }
  }

  private drawPellets(game: Game) {
    const m = game.maze;
    const T = this.tile;
    const set = game.party ? this.bank.party : this.bank.pellets;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const p = game.pellets[y * m.w + x];
        if (p < 0) continue;
        const bob = Math.sin(game.time * 3 + x * 0.7 + y * 1.3) * T * 0.04;
        this.sprite(set[p], (x + 0.5) * T, (y + 0.5) * T + bob, 1.3);
      }
    }
  }

  private drawItem(game: Game) {
    const it = game.item;
    if (!it) return;
    if (it.life < 3 && Math.floor(it.life * 8) % 2 === 0) return;
    const ctx = this.ctx;
    const T = this.tile;
    const x = it.x * T;
    const y = it.y * T + Math.sin(game.time * 4) * T * 0.08;
    const ring = (game.time * 1.5) % 1;
    if (settings.colorBlind) {
      // High-contrast double ring that doesn't rely on colour.
      for (const [c, wdt] of [['#000', 5], ['#fff', 2.5]] as const) {
        ctx.strokeStyle = c;
        ctx.lineWidth = wdt;
        ctx.setLineDash([T * 0.12, T * 0.08]);
        ctx.beginPath();
        ctx.arc(x, y, T * 0.55, game.time, game.time + Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = `rgba(255,240,150,${1 - ring})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, T * (0.4 + ring * 0.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    const frames = this.bank.items.get(it.kind)!;
    this.sprite(frames[Math.floor(game.time * 3) % 2], x, y, 1.15);
  }

  private drawEnemy(game: Game, e: Enemy) {
    const ctx = this.ctx;
    const T = this.tile;
    const art = MONSTER_ART[e.kind];
    let x = e.x * T;
    let y = e.y * T;
    ctx.save();
    if (e.rising > 0) {
      const t = 1 - e.rising / 0.9;
      ctx.globalAlpha = Math.max(0.1, t);
      ctx.translate(x, y + (1 - t) * T * 0.4);
      ctx.scale(t, t);
      x = 0;
      y = 0;
    } else {
      ctx.translate(x, y);
      x = 0;
      y = 0;
    }
    if (e.mad > 0) {
      ctx.translate(Math.sin(e.wobble) * T * 0.08, Math.cos(e.wobble * 1.3) * T * 0.05);
      ctx.rotate(Math.sin(e.wobble * 0.5) * 0.4);
    }
    if (game.has('computer') && e.rising <= 0) {
      this.drawBsod(T);
      ctx.restore();
      return;
    }
    let sx = 1;
    let sy = 1;
    if (game.has('eclair')) {
      sx = 1.4 + Math.sin(game.time * 6 + e.id) * 0.05;
      sy = 1.2;
    }
    if (ENEMIES[e.kind].phases) ctx.globalAlpha *= 0.85 + Math.sin(game.time * 3 + e.id) * 0.1;
    if (e.flash > 0 && Math.floor(e.flash * 40) % 2 === 0) ctx.globalAlpha *= 0.4;
    const bob = ENEMIES[e.kind].phases ? Math.sin(game.time * 3 + e.id) * T * 0.06 : 0;
    ctx.translate(0, bob);
    ctx.scale(e.face * sx, sy);
    const frame = Math.floor(e.walk * 2.5) % 2;
    if (e.kind === 'cousin' && this.bossPhoto) {
      const ph = T * 1.6;
      const pw = (ph * this.bossPhoto.naturalWidth) / this.bossPhoto.naturalHeight;
      ctx.drawImage(this.bossPhoto, -pw / 2, -ph / 2 + Math.sin(e.walk * 8) * T * 0.04, pw, ph);
      ctx.restore();
      this.drawBossHud(e, T);
      return;
    }
    const s = this.bank.monsters.get(`${e.kind}${frame}`)!;
    this.sprite(s, 0, 0);
    const target = game.nearestPlayer(e.x, e.y);
    const lookX = (target.x - e.x) * e.face;
    const lookY = target.y - e.y;
    const k = art.scale * T;
    for (const eye of art.eyes) {
      drawGooglyEye(ctx, eye.x * k, eye.y * k, eye.r * k, lookX, lookY, e.wobble + eye.x * 10);
    }
    ctx.restore();
    if (e.kind === 'cousin') this.drawBossHud(e, T);
    if (e.stun > 0) this.drawDizzy(e.x * T, e.y * T - T * 0.5, game.time);
    if (e.mad > 0) this.drawDizzy(e.x * T, e.y * T - T * 0.5, game.time * 3, '#b2ff59');
  }

  /** Name tag and a 10-segment health bar over Palos' cousin. */
  private drawBossHud(e: Enemy, T: number) {
    if (e.rising > 0) return;
    const ctx = this.ctx;
    const x = e.x * T;
    const y = e.y * T - T * 1.05;
    const max = ENEMIES.cousin.hp;
    const w = T * 1.4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, T * 0.16 + 4);
    for (let i = 0; i < max; i++) {
      ctx.fillStyle = i < e.hp ? (e.hp <= 3 ? '#ff5252' : '#69f0ae') : 'rgba(255,255,255,0.15)';
      ctx.fillRect(x - w / 2 + (i * w) / max + 1, y, w / max - 2, T * 0.16);
    }
    ctx.font = `bold ${Math.max(10, Math.round(T * 0.32))}px ${uiFont()}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(2, T * 0.08);
    ctx.strokeStyle = '#1a0b2e';
    const name = tr('pop.bossName');
    ctx.strokeText(name, x, y - 3);
    ctx.fillStyle = '#ffd400';
    ctx.fillText(name, x, y - 3);
    ctx.textBaseline = 'middle';
  }

  private drawBsod(T: number) {
    const ctx = this.ctx;
    ctx.fillStyle = '#333';
    ctx.fillRect(-T * 0.08, T * 0.22, T * 0.16, T * 0.12);
    ctx.fillRect(-T * 0.2, T * 0.32, T * 0.4, T * 0.05);
    ctx.fillStyle = '#1565c0';
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = T * 0.05;
    ctx.beginPath();
    ctx.roundRect(-T * 0.38, -T * 0.32, T * 0.76, T * 0.56, T * 0.06);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(T * 0.32)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(':(', 0, -T * 0.04);
  }

  private drawDizzy(x: number, y: number, t: number, color = '#ffeb3b') {
    const ctx = this.ctx;
    const T = this.tile;
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * T * 0.3;
      const sy = y + Math.sin(a) * T * 0.1;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const aa = (j * Math.PI) / 5;
        const r = j % 2 ? T * 0.04 : T * 0.09;
        ctx.lineTo(sx + Math.cos(aa) * r, sy + Math.sin(aa) * r);
      }
      ctx.fill();
    }
  }

  private drawCricketWaves(game: Game) {
    if (!game.has('cricket')) return;
    const ctx = this.ctx;
    const T = this.tile;
    for (const p of game.players) {
      if (!p.alive) continue;
      for (let i = 0; i < 3; i++) {
        const t = (game.time * 1.2 + i / 3) % 1;
        ctx.strokeStyle = `rgba(178,255,89,${0.6 * (1 - t)})`;
        ctx.lineWidth = T * 0.08;
        ctx.beginPath();
        ctx.arc(p.x * T, p.y * T, t * 3.5 * T, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawPlayer(game: Game, p: Player) {
    const art = this.minders[p.id] ?? this.minders[0];
    if (!art || !art.img.complete) return;
    if (!p.alive && p.emoteTime > 2.6) return;
    const img = art.img;
    const ctx = this.ctx;
    const T = this.tile;
    const t = p.emoteTime;
    const pig = game.has('pig') && p.alive;
    const spice = game.has('spice') && p.alive;
    ctx.save();
    ctx.translate(p.x * T, p.y * T);
    let sx = 1;
    let sy = 1;
    if (p.emote === 'cheer') {
      // Jump for joy.
      ctx.translate(0, -Math.abs(Math.sin(t * 9)) * T * 0.38);
      ctx.rotate(Math.sin(t * 14) * 0.18);
      const squash = Math.max(0, Math.cos(t * 9)) * 0.12;
      sx = 1 + squash;
      sy = 1 - squash;
    } else if (p.emote === 'cry') {
      // Sobbing wobble, slowly sinking into a puddle of tears.
      ctx.translate(Math.sin(t * 30) * T * 0.04, Math.min(t, 2) * T * 0.04 - T * 0.15);
      sx = 1.35 + Math.sin(t * 8) * 0.05;
      sy = 1.35 - Math.min(t, 2) * 0.06;
      if (!p.alive) ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1.8) / 0.8);
    } else {
      if (p.invuln > 0 && game.phase === 'play' && Math.floor(p.invuln * 10) % 2 === 0) ctx.globalAlpha = 0.45;
      const moving = p.dir >= 0 && game.phase === 'play';
      const bounce = moving ? Math.sin(p.walk * 9) * 0.06 : Math.sin(game.time * 3) * 0.03;
      sx = 1 - bounce * 0.5;
      sy = 1 + bounce;
      sx *= 1 - p.recoil * 0.12;
      sy *= 1 + p.recoil * 0.08;
      if (pig) {
        sx *= 1.55 + Math.sin(game.time * 5) * 0.05;
        sy *= 1.3;
      }
    }
    const h = T * 1.12;
    const w = (h * img.naturalWidth) / img.naturalHeight;
    if (p.emote === 'cry') {
      ctx.fillStyle = 'rgba(100,181,246,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.48, Math.min(t, 2) * T * 0.35 + T * 0.1, T * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (spice) {
      ctx.shadowColor = '#ff1a00';
      ctx.shadowBlur = T * 0.6;
    }
    const flip = p.face === 3 ? -1 : 1;
    ctx.scale(sx * flip, sy);
    if (outfit.cape) drawCape(ctx, w, h, game.time + p.id);
    ctx.drawImage(spice ? art.red : img, -w / 2, -h / 2, w, h);
    if (outfit.hat) drawHat(ctx, outfit.hat, w, h);
    ctx.shadowBlur = 0;
    if (pig) {
      ctx.fillStyle = '#f48fb1';
      ctx.beginPath();
      ctx.ellipse(w * 0.05, h * 0.2, T * 0.14, T * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ad1457';
      ctx.beginPath();
      ctx.ellipse(w * 0.05 - T * 0.05, h * 0.2, T * 0.025, T * 0.04, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.05 + T * 0.05, h * 0.2, T * 0.025, T * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.emote === 'cry') {
      // Two streams of tears from the eye.
      const ex = (art.eye[0] - 0.5) * w;
      const ey = (art.eye[1] - 0.5) * h + h * 0.06;
      for (let k = 0; k < 8; k++) {
        const side = k % 2 ? 1 : -1;
        const f = (t * 2.2 + k / 8) % 1;
        const tx = ex + side * (T * 0.14 + f * T * 0.3);
        const ty = ey + f * h * 0.6;
        ctx.fillStyle = `rgba(79,195,247,${1 - f * 0.55})`;
        ctx.beginPath();
        ctx.ellipse(tx, ty, T * 0.08, T * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.8 - f * 0.5})`;
        ctx.beginPath();
        ctx.arc(tx - T * 0.025, ty - T * 0.04, T * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    if (p.emote !== 'none' && t < 1.6) {
      const text = p.emote === 'cheer' ? tr(p.id ? 'pop.woohoo' : 'pop.yay') : tr('pop.waah');
      this.bubble(p.x * T, p.y * T - T * 1.05, text, p.emote === 'cheer' ? '#ffd400' : '#81d4fa');
    }
    if (game.reverse > 0 && p.alive) this.bubble(p.x * T, p.y * T - T * 1.05, '⇄', '#ce93d8');
    if (game.coop && p.alive && p.emote === 'none') {
      const tag = `P${p.id + 1}`;
      ctx.font = `bold ${Math.max(9, Math.round(T * 0.32))}px ${uiFont()}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, T * 0.08);
      ctx.strokeStyle = '#1a0b2e';
      ctx.strokeText(tag, p.x * T, p.y * T - T * 0.78);
      ctx.fillStyle = PLAYER_TAGS[p.id];
      ctx.fillText(tag, p.x * T, p.y * T - T * 0.78);
    }
  }

  private drawDoors(game: Game) {
    const ctx = this.ctx;
    const T = this.tile;
    for (const d of game.doors) {
      const x = d.x * T;
      const y = d.y * T;
      ctx.save();
      ctx.translate(x + T / 2, y + T / 2);
      if (d.open) {
        ctx.fillStyle = '#120618';
        ctx.beginPath();
        ctx.roundRect(-T * 0.32, -T * 0.4, T * 0.64, T * 0.8, [T * 0.3, T * 0.3, 2, 2]);
        ctx.fill();
        ctx.strokeStyle = '#6d4c41';
        ctx.lineWidth = T * 0.06;
        ctx.stroke();
      } else {
        const glow = 0.5 + Math.sin(game.time * 3 + d.x) * 0.25;
        ctx.shadowColor = `rgba(255,170,0,${glow})`;
        ctx.shadowBlur = T * 0.4;
        ctx.fillStyle = '#7b3fa0';
        ctx.beginPath();
        ctx.roundRect(-T * 0.32, -T * 0.4, T * 0.64, T * 0.8, [T * 0.3, T * 0.3, 2, 2]);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = T * 0.05;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -T * 0.32);
        ctx.lineTo(0, T * 0.38);
        ctx.stroke();
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath();
        ctx.arc(T * 0.16, T * 0.05, T * 0.05, 0, Math.PI * 2);
        ctx.arc(-T * 0.16, T * 0.05, T * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `bold ${Math.round(T * 0.28)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎃', 0, -T * 0.15);
      }
      ctx.restore();
    }
  }

  private drawPets(game: Game) {
    const ctx = this.ctx;
    const T = this.tile;
    for (const s of game.petShots) {
      ctx.fillStyle = '#ff80ab';
      ctx.font = `bold ${Math.round(T * 0.32)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', s.x * T, s.y * T);
    }
    for (const pet of game.pets) {
      if (pet.life < 2 && Math.floor(pet.life * 8) % 2 === 0) continue;
      const art = MONSTER_ART[pet.kind];
      const sprite = this.bank.monsters.get(`${pet.kind}${Math.floor(game.time * 6) % 2}`);
      if (!sprite) continue;
      const k = 0.55;
      ctx.save();
      ctx.translate(pet.x * T, pet.y * T);
      ctx.scale(k, k);
      this.sprite(sprite, 0, 0);
      const target = game.enemies[0];
      const lx = target ? target.x - pet.x : 1;
      const ly = target ? target.y - pet.y : 0;
      for (const e of art.eyes) drawGooglyEye(ctx, e.x * T * art.scale, e.y * T * art.scale, e.r * T * art.scale, lx, ly, game.time * 3);
      ctx.restore();
      ctx.fillStyle = '#ff4081';
      ctx.font = `bold ${Math.round(T * 0.26)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('♥', pet.x * T, pet.y * T - T * 0.42);
    }
  }

  /** The Daily Challenge "ghost": your best run of the day, replayed see-through. */
  private drawGhostRunner(game: Game) {
    const data = game.ghost;
    const img = this.ghostImg;
    if (!data || !img || !img.complete || game.phase === 'intro') return;
    const i = Math.min(Math.floor(game.stageClock / 0.1), data.length / 3 - 1) * 3;
    if (i < 0) return;
    const ctx = this.ctx;
    const T = this.tile;
    const x = (data[i] / 20) * T;
    const y = (data[i + 1] / 20) * T;
    const h = T * 1.12;
    const w = (h * img.naturalWidth) / img.naturalHeight;
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.translate(x, y + Math.sin(game.time * 4) * T * 0.04);
    ctx.scale(data[i + 2] === 3 ? -1 : 1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.font = `bold ${Math.max(9, Math.round(T * 0.28))}px ${uiFont()}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e1f5fe';
    ctx.fillText(`👻 ${tr('pop.ghostBest')}`, x, y - T * 0.75);
    ctx.restore();
  }

  /** Trick door jump-scare: a big (friendly) ghost pops out. */
  private drawScare(left: number) {
    const ctx = this.ctx;
    const k = 1 - left / 1.1;
    const size = Math.min(this.cw, this.ch) * (0.45 + k * 0.35);
    ctx.save();
    ctx.globalAlpha = Math.min(1, left * 2);
    ctx.fillStyle = 'rgba(10,0,20,0.55)';
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.translate(this.cw / 2, this.ch / 2);
    ctx.scale(size, size);
    MONSTER_ART.ghost.draw(ctx, Math.floor(left * 10) % 2);
    for (const e of MONSTER_ART.ghost.eyes) drawGooglyEye(ctx, e.x, e.y, e.r * 1.2, Math.sin(left * 20), 0.2, left * 30);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = Math.min(1, left * 2);
    ctx.font = `bold ${Math.round(size * 0.3)}px ${uiFont()}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1a0b2e';
    ctx.strokeText(tr('pop.boo'), this.cw / 2, this.ch / 2 + size * 0.55);
    ctx.fillStyle = '#fff';
    ctx.fillText(tr('pop.boo'), this.cw / 2, this.ch / 2 + size * 0.55);
    ctx.restore();
  }

  private bubble(x: number, y: number, text: string, color: string) {
    const ctx = this.ctx;
    const T = this.tile;
    ctx.font = `bold ${Math.max(10, Math.round(T * 0.36))}px ${uiFont()}`;
    const w = ctx.measureText(text).width + T * 0.4;
    const h = T * 0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.moveTo(x - T * 0.08, y + h / 2 - 1);
    ctx.lineTo(x, y + h / 2 + T * 0.14);
    ctx.lineTo(x + T * 0.08, y + h / 2 - 1);
    ctx.fill();
    ctx.fillStyle = '#1a0b2e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.stroke();
  }

  private drawBombs(game: Game) {
    const ctx = this.ctx;
    const T = this.tile;
    for (const b of game.bombs) {
      const urgent = b.fuse < 0.7;
      const pulse = 1 + Math.sin(game.time * (urgent ? 40 : 14)) * (urgent ? 0.12 : 0.05);
      this.sprite(this.bombSprites[Math.floor(game.time * 12) % 2], b.x * T, b.y * T, pulse);
      if (urgent && Math.floor(game.time * 16) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,60,0,0.35)';
        ctx.beginPath();
        ctx.arc(b.x * T, b.y * T, T * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawParticles(game: Game) {
    const ctx = this.ctx;
    const T = this.tile;
    for (const p of game.particles) {
      const a = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const x = p.x * T;
      const y = p.y * T;
      const s = p.size * T;
      switch (p.kind) {
        case 'confetti':
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.fillRect(-s / 2, -s / 4, s, s / 2);
          ctx.restore();
          break;
        case 'rocket':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, s * 0.5);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - p.vx * T * 0.06, y - p.vy * T * 0.06);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x, y, s, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'shock': {
          const k = 1 - p.life / p.max;
          ctx.globalAlpha = Math.max(0, 1 - k);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = T * 0.25 * (1 - k) + 1;
          ctx.beginPath();
          ctx.arc(x, y, p.size * T * (0.3 + k * 0.8), 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,200,80,${0.3 * (1 - k)})`;
          ctx.fill();
          break;
        }
        case 'debris':
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot + p.life * 8);
          ctx.fillRect(-s / 2, -s / 2, s, s);
          ctx.restore();
          break;
        case 'note':
          ctx.font = `bold ${Math.round(s)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('♪', x, y);
          break;
        case 'star':
          ctx.beginPath();
          for (let j = 0; j < 8; j++) {
            const aa = (j * Math.PI) / 4 + p.rot;
            const r = j % 2 ? s * 0.35 : s;
            ctx.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
          }
          ctx.fill();
          break;
        default:
          ctx.beginPath();
          ctx.arc(x, y, s, 0, Math.PI * 2);
          ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPopups(game: Game) {
    const ctx = this.ctx;
    const T = this.tile;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of game.popups) {
      const a = Math.min(1, t.life * 2);
      const pop = 1 + Math.max(0, t.life - 0.9) * 3;
      ctx.globalAlpha = a;
      ctx.font = `bold ${Math.round(t.size * T * pop)}px ${uiFont()}`;
      ctx.strokeStyle = '#1a0b2e';
      ctx.lineWidth = Math.max(2, T * 0.1);
      ctx.strokeText(t.text, t.x * T, t.y * T);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x * T, t.y * T);
    }
    ctx.globalAlpha = 1;
  }
}
