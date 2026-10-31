import { ENEMIES } from './config';
import type { Enemy, Game } from './game';
import { DIRS, isWall, type Maze } from './maze';
import { MONSTER_ART, SpriteBank, bake, drawEyeball, drawGooglyEye, drawTombstone, type Sprite } from './sprites';

const GLOWS = ['#ff7b00', '#39ff14', '#b388ff', '#00e5ff', '#ff4081', '#ffd400'];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  private bgParty = false;
  private mazeLayer?: HTMLCanvasElement;
  private mazeKey = '';
  private tomb?: Sprite;
  private blurOn = false;
  private minder?: HTMLImageElement;
  private minderRed?: HTMLCanvasElement;
  iris = '#3a7bd5';

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  setMinder(img: HTMLImageElement, iris: string) {
    this.minder = img;
    this.iris = iris;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || 256;
    c.height = img.naturalHeight || 256;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,20,0,0.6)';
    g.fillRect(0, 0, c.width, c.height);
    this.minderRed = c;
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
    this.bank.build(this.tile * this.dpr);
    this.tomb = bake(this.tile * this.dpr, drawTombstone, 1);
  }

  render(game: Game) {
    const ctx = this.ctx;
    const m = game.maze;
    if (!m) return;
    const key = `${m.w}x${m.h}:${this.field.w}x${this.field.h}:${game.level}:${this.dpr}`;
    if (key !== this.mazeKey) {
      this.layout(m);
      this.mazeLayer = this.buildMazeLayer(game);
      this.mazeKey = key;
    }
    if (!this.bg || this.bgParty !== game.party) this.bg = this.buildBackground(game.party);

    const blur = game.has('beer');
    if (blur !== this.blurOn) {
      this.blurOn = blur;
      this.canvas.style.filter = blur ? 'blur(1.6px) saturate(1.3)' : '';
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.bg, 0, 0, this.cw, this.ch);

    const T = this.tile;
    ctx.save();
    if (blur) {
      const cx = this.ox + (m.w * T) / 2;
      const cy = this.oy + (m.h * T) / 2;
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(game.time * 1.7) * 0.035);
      ctx.scale(1 + Math.sin(game.time * 2.3) * 0.02, 1 + Math.cos(game.time * 1.9) * 0.02);
      ctx.translate(-cx, -cy);
    }
    ctx.drawImage(this.mazeLayer!, this.ox, this.oy, m.w * T, m.h * T);
    ctx.translate(this.ox, this.oy);

    this.drawPellets(game);
    this.drawItem(game);
    for (const e of game.enemies) this.drawEnemy(game, e);
    for (const e of game.eyes) {
      const d = DIRS[e.dir];
      drawEyeball(ctx, e.x * T, e.y * T, T * 0.21, d.x, d.y, this.iris, e.spin);
    }
    this.drawCricketWaves(game);
    this.drawPlayer(game);
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
  }

  // ------------------------------------------------------------ static layers

  private buildBackground(party: boolean): HTMLCanvasElement {
    this.bgParty = party;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.cw * this.dpr));
    c.height = Math.max(1, Math.round(this.ch * this.dpr));
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const w = this.cw;
    const h = this.ch;
    const grad = g.createLinearGradient(0, 0, 0, h);
    if (party) {
      grad.addColorStop(0, '#2b0a4a');
      grad.addColorStop(1, '#5a1a5e');
    } else {
      grad.addColorStop(0, '#0d0221');
      grad.addColorStop(0.6, '#1a0b2e');
      grad.addColorStop(1, '#2d0f3f');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    let seed = 42;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
      g.fillRect(r() * w, r() * h, r() < 0.9 ? 1 : 2, r() < 0.9 ? 1 : 2);
    }
    if (party) {
      const colors = ['#ff4081', '#40c4ff', '#ffd400', '#69f0ae', '#e040fb'];
      for (let i = 0; i < 14; i++) {
        const x = r() * w;
        const y = r() * h;
        const s = 10 + r() * 14;
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y + s);
        g.quadraticCurveTo(x + 6, y + s * 2, x, y + s * 3);
        g.stroke();
        g.fillStyle = colors[i % colors.length];
        g.globalAlpha = 0.7;
        g.beginPath();
        g.ellipse(x, y, s * 0.8, s, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    } else {
      const mx = w * 0.85;
      const my = Math.min(h * 0.12, 90);
      const mr = Math.min(w, h) * 0.08 + 12;
      g.shadowColor = '#fff5c0';
      g.shadowBlur = 40;
      g.fillStyle = '#fff3c4';
      g.beginPath();
      g.arc(mx, my, mr, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(200,180,120,0.35)';
      for (const [dx, dy, rr] of [
        [-0.3, -0.2, 0.18],
        [0.25, 0.1, 0.22],
        [-0.1, 0.35, 0.12],
      ]) {
        g.beginPath();
        g.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#0a0215';
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) g.lineTo(x, h - 30 - Math.sin(x / 70) * 14 - Math.sin(x / 23) * 6);
      g.lineTo(w, h);
      g.fill();
    }
    return c;
  }

  private buildMazeLayer(game: Game): HTMLCanvasElement {
    const m = game.maze;
    const T = this.tile * this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.ceil(m.w * T);
    c.height = Math.ceil(m.h * T);
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(8,0,18,0.6)';
    g.beginPath();
    g.roundRect(T * 0.2, T * 0.2, c.width - T * 0.4, c.height - T * 0.4, T * 0.4);
    g.fill();

    const tubes = new Path2D();
    const blocks = new Path2D();
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!isWall(m, x, y)) continue;
        const cx = (x + 0.5) * T;
        const cy = (y + 0.5) * T;
        tubes.moveTo(cx, cy);
        tubes.lineTo(cx + 0.01, cy);
        if (x + 1 < m.w && isWall(m, x + 1, y)) {
          tubes.moveTo(cx, cy);
          tubes.lineTo(cx + T, cy);
        }
        if (y + 1 < m.h && isWall(m, x, y + 1)) {
          tubes.moveTo(cx, cy);
          tubes.lineTo(cx, cy + T);
        }
        if (x + 1 < m.w && y + 1 < m.h && isWall(m, x + 1, y) && isWall(m, x, y + 1) && isWall(m, x + 1, y + 1)) {
          blocks.rect(cx, cy, T, T);
        }
        // Diagonal neighbours can't be squeezed between, so join them (this is what draws the "2" on level 12).
        for (const dx of [-1, 1]) {
          const nx = x + dx;
          if (y + 1 < m.h && nx >= 0 && nx < m.w && isWall(m, nx, y + 1) && !isWall(m, nx, y) && !isWall(m, x, y + 1)) {
            tubes.moveTo(cx, cy);
            tubes.lineTo(cx + dx * T, cy + T);
          }
        }
      }
    }
    let glow: string | CanvasGradient = GLOWS[(game.level - 1) % GLOWS.length];
    if (game.party) {
      const lg = g.createLinearGradient(0, 0, c.width, c.height);
      ['#ff4081', '#ffd400', '#69f0ae', '#40c4ff', '#e040fb'].forEach((col, i, a) => lg.addColorStop(i / (a.length - 1), col));
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
    pass(T * 0.5, game.party ? '#3a1060' : '#2a1145');
    pass(T * 0.16, game.party ? '#7a3aa8' : '#5b2f8f', 0, -T * 0.07);

    if (this.tomb) {
      for (const s of m.spawns) {
        g.drawImage(this.tomb.canvas, s.x * T, s.y * T, T, T);
      }
    }
    return c;
  }

  // ------------------------------------------------------------ dynamic layers

  private sprite(s: Sprite, x: number, y: number, scaleX = 1, scaleY = scaleX) {
    const w = (s.canvas.width / this.dpr) * scaleX;
    const h = (s.canvas.height / this.dpr) * scaleY;
    this.ctx.drawImage(s.canvas, x - w / 2, y - h / 2, w, h);
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
    ctx.strokeStyle = `rgba(255,240,150,${1 - ring})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, T * (0.4 + ring * 0.4), 0, Math.PI * 2);
    ctx.stroke();
    const frames = this.bank.items.get(it.kind)!;
    this.sprite(frames[Math.floor(game.time * 3) % 2], x, y, 1.15);
  }

  private drawEnemy(game: Game, e: Enemy) {
    const ctx = this.ctx;
    const T = this.tile;
    const art = MONSTER_ART[e.kind];
    const p = game.player;
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
    const s = this.bank.monsters.get(`${e.kind}${frame}`)!;
    this.sprite(s, 0, 0);
    const lookX = (p.x - e.x) * e.face;
    const lookY = p.y - e.y;
    const k = art.scale * T;
    for (const eye of art.eyes) {
      drawGooglyEye(ctx, eye.x * k, eye.y * k, eye.r * k, lookX, lookY, e.wobble + eye.x * 10);
    }
    ctx.restore();
    if (e.stun > 0) this.drawDizzy(e.x * T, e.y * T - T * 0.5, game.time);
    if (e.mad > 0) this.drawDizzy(e.x * T, e.y * T - T * 0.5, game.time * 3, '#b2ff59');
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
    const p = game.player;
    for (let i = 0; i < 3; i++) {
      const t = (game.time * 1.2 + i / 3) % 1;
      ctx.strokeStyle = `rgba(178,255,89,${0.6 * (1 - t)})`;
      ctx.lineWidth = T * 0.08;
      ctx.beginPath();
      ctx.arc(p.x * T, p.y * T, t * 3.5 * T, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawPlayer(game: Game) {
    const img = this.minder;
    if (!img || !img.complete) return;
    const ctx = this.ctx;
    const T = this.tile;
    const p = game.player;
    const pig = game.has('pig');
    const spice = game.has('spice');
    ctx.save();
    ctx.translate(p.x * T, p.y * T);
    let sx = 1;
    let sy = 1;
    if (game.phase === 'dying' || game.phase === 'over') {
      const t = game.phase === 'over' ? 0 : Math.max(0, game.phaseTime / 2.4);
      ctx.rotate((1 - t) * 12);
      sx = sy = 0.2 + t * 0.8;
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
    if (spice) {
      ctx.shadowColor = '#ff1a00';
      ctx.shadowBlur = T * 0.6;
    }
    ctx.scale(sx * (p.face === 3 ? -1 : 1), sy);
    ctx.drawImage(spice && this.minderRed ? this.minderRed : img, -w / 2, -h / 2, w, h);
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
    ctx.restore();
    if (game.phase === 'dying') {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(T * 0.5)}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('x_x', p.x * T, p.y * T - T * 0.8);
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
      ctx.font = `bold ${Math.round(t.size * T * pop)}px Fredoka, sans-serif`;
      ctx.strokeStyle = '#1a0b2e';
      ctx.lineWidth = Math.max(2, T * 0.1);
      ctx.strokeText(t.text, t.x * T, t.y * T);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x * T, t.y * T);
    }
    ctx.globalAlpha = 1;
  }
}
