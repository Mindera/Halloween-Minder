import type { ThemeId } from './config';

type G = CanvasRenderingContext2D;

export type Ambient = 'fog' | 'fireflies' | 'leaves' | 'embers' | 'bubbles' | 'bats' | 'leds' | 'confetti' | 'shapes';

/** Visual dressing for a level. Floor/wall decorations are in tile units centred on the tile. */
export interface ThemeArt {
  sky: string[];
  floor: string;
  glow: string;
  body: string;
  highlight: string;
  ambient: Ambient;
  ambientColor: string;
  /** `r` is a stable random number for the tile, `x`/`y` its coordinates. */
  floorDeco?: (g: G, r: number, x: number, y: number) => void;
  wallDeco?: (g: G, r: number) => void;
  /** Background scenery, in CSS pixels. */
  scenery: (g: G, w: number, h: number, rnd: () => number) => void;
}

const TAU = Math.PI * 2;

function dot(g: G, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function moon(g: G, x: number, y: number, r: number, color: string, glow: string) {
  g.save();
  g.shadowColor = glow;
  g.shadowBlur = r * 1.2;
  dot(g, x, y, r, color);
  g.restore();
  g.globalAlpha = 0.25;
  dot(g, x - r * 0.3, y - r * 0.2, r * 0.2, '#000');
  dot(g, x + r * 0.25, y + r * 0.15, r * 0.25, '#000');
  g.globalAlpha = 1;
}

function hills(g: G, w: number, h: number, color: string, height: number, wave: number) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 16) g.lineTo(x, h - height - Math.sin(x / wave) * height * 0.4 - Math.sin(x / (wave * 0.37)) * height * 0.15);
  g.lineTo(w, h);
  g.fill();
}

function tombstone(g: G, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x - s * 0.4, y);
  g.lineTo(x - s * 0.4, y - s * 0.7);
  g.arc(x, y - s * 0.7, s * 0.4, Math.PI, 0);
  g.lineTo(x + s * 0.4, y);
  g.fill();
}

function pine(g: G, x: number, y: number, s: number) {
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const ty = y - s * (0.35 + i * 0.3);
    const tw = s * (0.45 - i * 0.1);
    g.moveTo(x, ty - s * 0.35);
    g.lineTo(x - tw, ty + s * 0.05);
    g.lineTo(x + tw, ty + s * 0.05);
  }
  g.fill();
  g.fillRect(x - s * 0.05, y - s * 0.3, s * 0.1, s * 0.3);
}

/** Circle, triangle or square (the Halloween Game's card symbols), centred on 0,0. */
export function shape(g: G, kind: number, s: number) {
  g.beginPath();
  if (kind === 0) g.arc(0, 0, s, 0, TAU);
  else if (kind === 1) {
    g.moveTo(0, -s * 1.1);
    g.lineTo(s * 1.05, s * 0.75);
    g.lineTo(-s * 1.05, s * 0.75);
    g.closePath();
  } else g.rect(-s * 0.9, -s * 0.9, s * 1.8, s * 1.8);
}

function cloud(g: G, x: number, y: number, s: number) {
  g.beginPath();
  g.ellipse(x, y, s, s * 0.45, 0, 0, TAU);
  g.ellipse(x - s * 0.55, y + s * 0.1, s * 0.55, s * 0.32, 0, 0, TAU);
  g.ellipse(x + s * 0.6, y + s * 0.12, s * 0.5, s * 0.3, 0, 0, TAU);
  g.ellipse(x + s * 0.1, y - s * 0.3, s * 0.5, s * 0.38, 0, 0, TAU);
  g.fill();
}

/** A pink-suited guard with a black mask, seen from far away. */
function guard(g: G, x: number, y: number, s: number, kind: number) {
  g.fillStyle = '#c2185b';
  g.beginPath();
  g.roundRect(x - s * 0.32, y - s * 1.1, s * 0.64, s * 1.1, s * 0.18);
  g.fill();
  g.beginPath();
  g.arc(x, y - s * 1.32, s * 0.3, 0, TAU);
  g.fill();
  dot(g, x, y - s * 1.3, s * 0.22, '#111');
  g.save();
  g.translate(x, y - s * 1.3);
  g.strokeStyle = '#fff';
  g.lineWidth = s * 0.05;
  shape(g, kind, s * 0.09);
  g.stroke();
  g.restore();
}

export const THEMES: Record<ThemeId, ThemeArt> = {
  graveyard: {
    sky: ['#0d0221', '#1a0b2e', '#2d0f3f'],
    floor: 'rgba(22,16,32,0.8)',
    glow: '#76ff6b',
    body: '#3e3a4a',
    highlight: '#7a7290',
    ambient: 'fog',
    ambientColor: '220,230,255',
    floorDeco: (g, r) => {
      g.fillStyle = 'rgba(160,150,190,0.12)';
      g.beginPath();
      g.ellipse(-0.2 + r * 0.1, -0.15, 0.17, 0.12, 0, 0, TAU);
      g.ellipse(0.18, 0.05 - r * 0.1, 0.15, 0.11, 0, 0, TAU);
      g.ellipse(-0.1, 0.25, 0.16, 0.1, 0, 0, TAU);
      g.fill();
      if (r < 0.05) {
        g.strokeStyle = 'rgba(240,235,220,0.5)';
        g.lineWidth = 0.05;
        g.beginPath();
        g.moveTo(-0.15, 0.3);
        g.lineTo(0.15, 0.2);
        g.stroke();
      }
    },
    wallDeco: (g, r) => {
      if (r > 0.3) return;
      g.fillStyle = 'rgba(100,200,80,0.55)';
      g.beginPath();
      g.ellipse(r * 0.6 - 0.1, -0.12, 0.12, 0.06, r * 3, 0, TAU);
      g.fill();
    },
    scenery: (g, w, h, rnd) => {
      moon(g, w * 0.85, Math.min(h * 0.12, 90), Math.min(w, h) * 0.08 + 12, '#fff3c4', '#fff5c0');
      hills(g, w, h, '#120620', 40, 80);
      g.fillStyle = '#0a0215';
      for (let i = 0; i < 12; i++) tombstone(g, rnd() * w, h - 10 - rnd() * 20, 14 + rnd() * 14);
    },
  },
  pumpkins: {
    sky: ['#140803', '#3d1a06', '#7a3410'],
    floor: 'rgba(42,24,10,0.82)',
    glow: '#ff9100',
    body: '#2e5d1e',
    highlight: '#62b33f',
    ambient: 'leaves',
    ambientColor: '255,140,40',
    floorDeco: (g, r) => {
      if (r < 0.45) {
        g.strokeStyle = 'rgba(110,170,60,0.4)';
        g.lineWidth = 0.035;
        g.beginPath();
        for (const dx of [-0.06, 0, 0.06]) {
          g.moveTo(r - 0.2 + dx, 0.25);
          g.lineTo(r - 0.2 + dx * 2, 0.1);
        }
        g.stroke();
      }
      if (r > 0.96) dot(g, 0.2, -0.2, 0.09, 'rgba(255,140,26,0.6)');
    },
    wallDeco: (g, r) => {
      if (r > 0.4) return;
      g.fillStyle = '#7ccf4f';
      g.beginPath();
      g.ellipse(r - 0.2, -0.16, 0.1, 0.05, r * 4, 0, TAU);
      g.fill();
    },
    scenery: (g, w, h, rnd) => {
      moon(g, w * 0.2, h * 0.75, Math.min(w, h) * 0.18, '#ffb74d', '#ff9100');
      hills(g, w, h, '#1c0d03', 50, 120);
      for (let i = 0; i < 10; i++) {
        const x = rnd() * w;
        const y = h - 12 - rnd() * 22;
        const s = 10 + rnd() * 12;
        g.fillStyle = '#e65100';
        g.beginPath();
        g.ellipse(x, y, s, s * 0.75, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#ffea00';
        g.fillRect(x - s * 0.4, y - s * 0.2, s * 0.22, s * 0.2);
        g.fillRect(x + s * 0.18, y - s * 0.2, s * 0.22, s * 0.2);
        g.fillRect(x - s * 0.35, y + s * 0.15, s * 0.7, s * 0.14);
      }
    },
  },
  haunted: {
    sky: ['#0d0214', '#25082f', '#3d0f47'],
    floor: 'rgba(48,28,20,0.85)',
    glow: '#d500f9',
    body: '#4a2c1a',
    highlight: '#8a5a32',
    ambient: 'bats',
    ambientColor: '20,5,30',
    floorDeco: (g, r, _x, y) => {
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.03;
      g.beginPath();
      g.moveTo(-0.5, -0.17);
      g.lineTo(0.5, -0.17);
      g.moveTo(-0.5, 0.17);
      g.lineTo(0.5, 0.17);
      const sx = ((y % 3) - 1) * 0.3 + r * 0.1;
      g.moveTo(sx, -0.5);
      g.lineTo(sx, -0.17);
      g.moveTo(-sx, 0.17);
      g.lineTo(-sx, 0.5);
      g.stroke();
    },
    wallDeco: (g, r) => {
      if (r > 0.12) return;
      g.strokeStyle = 'rgba(230,230,240,0.45)';
      g.lineWidth = 0.015;
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 3) * (Math.PI / 2);
        g.moveTo(-0.3, -0.3);
        g.lineTo(-0.3 + Math.cos(a) * 0.45, -0.3 + Math.sin(a) * 0.45);
      }
      for (const rr of [0.15, 0.3]) g.arc(-0.3, -0.3, rr, 0, Math.PI / 2);
      g.stroke();
    },
    scenery: (g, w, h) => {
      moon(g, w * 0.82, Math.min(h * 0.14, 100), Math.min(w, h) * 0.07 + 10, '#e1bee7', '#d500f9');
      hills(g, w, h, '#14041a', 30, 90);
      const hx = w * 0.15;
      const hy = h - 30;
      const s = Math.min(w, h) * 0.18 + 30;
      g.fillStyle = '#0a020e';
      g.fillRect(hx, hy - s, s, s);
      g.beginPath();
      g.moveTo(hx - s * 0.1, hy - s);
      g.lineTo(hx + s * 0.5, hy - s * 1.5);
      g.lineTo(hx + s * 1.1, hy - s);
      g.fill();
      g.fillRect(hx + s * 0.7, hy - s * 1.6, s * 0.15, s * 0.4);
      g.fillStyle = '#ffd54f';
      for (const [wx, wy] of [[0.15, 0.3], [0.6, 0.3], [0.15, 0.65], [0.6, 0.65]]) g.fillRect(hx + s * wx, hy - s + s * wy, s * 0.2, s * 0.2);
    },
  },
  forest: {
    sky: ['#020b14', '#05192b', '#0b2b3d'],
    floor: 'rgba(10,28,20,0.8)',
    glow: '#1de9b6',
    body: '#3b2a1a',
    highlight: '#6b4f36',
    ambient: 'fireflies',
    ambientColor: '230,255,120',
    floorDeco: (g, r) => {
      if (r < 0.35) {
        g.fillStyle = r < 0.17 ? 'rgba(230,120,40,0.45)' : 'rgba(200,60,40,0.4)';
        g.beginPath();
        g.ellipse(r * 1.2 - 0.2, 0.15, 0.08, 0.04, r * 9, 0, TAU);
        g.fill();
      }
      if (r > 0.95) {
        g.fillStyle = '#f5f5f5';
        g.fillRect(0.12, -0.05, 0.05, 0.12);
        g.fillStyle = '#e53935';
        g.beginPath();
        g.arc(0.145, -0.05, 0.09, Math.PI, 0);
        g.fill();
      }
    },
    scenery: (g, w, h, rnd) => {
      moon(g, w * 0.5, Math.min(h * 0.1, 80), Math.min(w, h) * 0.05 + 10, '#e0f7fa', '#80deea');
      g.fillStyle = '#031019';
      for (let i = 0; i < 18; i++) pine(g, rnd() * w, h, 60 + rnd() * 80);
      for (let i = 0; i < 4; i++) {
        const x = rnd() * w;
        const y = h * 0.5 + rnd() * h * 0.3;
        dot(g, x, y, 3, '#ffeb3b');
        dot(g, x + 9, y, 3, '#ffeb3b');
      }
    },
  },
  lab: {
    sky: ['#020c0b', '#062420', '#0b3a33'],
    floor: 'rgba(18,30,32,0.88)',
    glow: '#76ff03',
    body: '#56636b',
    highlight: '#c5d3da',
    ambient: 'bubbles',
    ambientColor: '160,255,120',
    floorDeco: (g, _r, x, y) => {
      if ((x + y) % 2) {
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(-0.5, -0.5, 1, 1);
      }
    },
    wallDeco: (g, r) => {
      if (r > 0.5) return;
      dot(g, -0.15, -0.15, 0.035, '#90a4ae');
      dot(g, 0.15, -0.15, 0.035, '#90a4ae');
    },
    scenery: (g, w, h, rnd) => {
      g.fillStyle = '#04120f';
      g.fillRect(0, h * 0.62, w, 6);
      g.fillRect(0, h * 0.82, w, 6);
      const colors = ['#76ff03', '#00e5ff', '#ff4081', '#ffea00'];
      for (let i = 0; i < 16; i++) {
        const x = rnd() * w;
        const y = (i % 2 ? h * 0.82 : h * 0.62) - 2;
        const s = 10 + rnd() * 10;
        g.fillStyle = 'rgba(200,230,230,0.25)';
        g.beginPath();
        g.moveTo(x - s * 0.15, y - s * 1.4);
        g.lineTo(x + s * 0.15, y - s * 1.4);
        g.lineTo(x + s * 0.6, y);
        g.lineTo(x - s * 0.6, y);
        g.fill();
        g.fillStyle = colors[i % colors.length];
        g.globalAlpha = 0.7;
        g.beginPath();
        g.moveTo(x - s * 0.35, y - s * 0.55);
        g.lineTo(x + s * 0.35, y - s * 0.55);
        g.lineTo(x + s * 0.6, y);
        g.lineTo(x - s * 0.6, y);
        g.fill();
        g.globalAlpha = 1;
      }
    },
  },
  servers: {
    sky: ['#000610', '#001d3d', '#002a52'],
    floor: 'rgba(8,14,26,0.9)',
    glow: '#00b0ff',
    body: '#1c1f26',
    highlight: '#455a64',
    ambient: 'leds',
    ambientColor: '0,230,118',
    floorDeco: (g) => {
      g.strokeStyle = 'rgba(80,140,200,0.18)';
      g.lineWidth = 0.025;
      g.strokeRect(-0.47, -0.47, 0.94, 0.94);
      g.fillStyle = 'rgba(80,140,200,0.2)';
      for (const [dx, dy] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.fillRect(dx - 0.02, dy - 0.02, 0.04, 0.04);
    },
    scenery: (g, w, h, rnd) => {
      const rw = 46;
      for (let x = 6; x < w; x += rw + 10) {
        g.fillStyle = '#020a14';
        g.fillRect(x, h * 0.3, rw, h * 0.7);
        for (let y = h * 0.32; y < h; y += 12) {
          g.fillStyle = '#0a1a2a';
          g.fillRect(x + 4, y, rw - 8, 8);
          dot(g, x + rw - 10, y + 4, 1.6, rnd() < 0.6 ? '#00e676' : rnd() < 0.5 ? '#ffab00' : '#ff1744');
        }
      }
    },
  },
  swamp: {
    sky: ['#020a04', '#0a2410', '#183d12'],
    floor: 'rgba(16,40,24,0.82)',
    glow: '#c6ff00',
    body: '#3d2a4f',
    highlight: '#7a5a9a',
    ambient: 'bubbles',
    ambientColor: '200,255,120',
    floorDeco: (g, r) => {
      if (r < 0.3) {
        g.strokeStyle = 'rgba(180,255,180,0.18)';
        g.lineWidth = 0.025;
        g.beginPath();
        g.ellipse(r - 0.15, 0.1, 0.18, 0.07, 0, 0, TAU);
        g.stroke();
      } else if (r > 0.93) {
        g.fillStyle = 'rgba(76,175,80,0.6)';
        g.beginPath();
        g.arc(0.1, -0.1, 0.14, 0.4, TAU - 0.1);
        g.lineTo(0.1, -0.1);
        g.fill();
      }
    },
    scenery: (g, w, h, rnd) => {
      moon(g, w * 0.75, Math.min(h * 0.13, 90), Math.min(w, h) * 0.06 + 10, '#f0f4c3', '#c6ff00');
      hills(g, w, h, '#06140a', 24, 60);
      g.strokeStyle = '#04100a';
      g.lineWidth = 3;
      for (let i = 0; i < 30; i++) {
        const x = rnd() * w;
        const top = h - 30 - rnd() * 60;
        g.beginPath();
        g.moveTo(x, h);
        g.quadraticCurveTo(x + 6, (h + top) / 2, x + rnd() * 10 - 5, top);
        g.stroke();
        if (rnd() < 0.5) {
          g.fillStyle = '#3e2723';
          g.fillRect(x - 2, top, 5, 14);
        }
      }
    },
  },
  castle: {
    sky: ['#120003', '#3d0010', '#5c0018'],
    floor: 'rgba(32,8,14,0.85)',
    glow: '#ff1744',
    body: '#4a1a1a',
    highlight: '#8a3a3a',
    ambient: 'embers',
    ambientColor: '255,110,40',
    floorDeco: (g, r) => {
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.03;
      g.strokeRect(-0.45, -0.45, 0.9, 0.9);
      if (r > 0.96) {
        g.fillStyle = '#efebe9';
        g.fillRect(-0.04, -0.05, 0.08, 0.2);
        dot(g, 0, -0.1, 0.05, '#ffca28');
      }
    },
    wallDeco: (g) => {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-0.16, -0.06, 0.02, 0.12);
      g.fillRect(0.14, -0.06, 0.02, 0.12);
    },
    scenery: (g, w, h) => {
      moon(g, w * 0.8, Math.min(h * 0.15, 110), Math.min(w, h) * 0.09 + 12, '#ff8a80', '#ff1744');
      const s = Math.min(w, h) * 0.22 + 30;
      const x = w * 0.12;
      const base = h - 10;
      g.fillStyle = '#0d0003';
      g.fillRect(x, base - s, s * 1.6, s);
      for (const tx of [0, 0.6, 1.3]) {
        g.fillRect(x + s * tx, base - s * 1.6, s * 0.3, s * 1.6);
        g.beginPath();
        g.moveTo(x + s * tx - s * 0.05, base - s * 1.6);
        g.lineTo(x + s * tx + s * 0.15, base - s * 2);
        g.lineTo(x + s * tx + s * 0.35, base - s * 1.6);
        g.fill();
      }
      g.fillStyle = '#ffca28';
      g.fillRect(x + s * 0.68, base - s * 1.3, s * 0.12, s * 0.18);
    },
  },
  party: {
    sky: ['#2b0a4a', '#5a1a5e'],
    floor: 'rgba(30,6,40,0.72)',
    glow: '#ffd400',
    body: '#3a1060',
    highlight: '#7a3aa8',
    ambient: 'confetti',
    ambientColor: '255,255,255',
    floorDeco: (g, r) => {
      if (r > 0.45) return;
      const colors = ['#ff4081', '#40c4ff', '#ffd400', '#69f0ae'];
      for (let i = 0; i < 3; i++) {
        g.fillStyle = colors[(i + Math.floor(r * 10)) % 4];
        g.save();
        g.translate(-0.3 + i * 0.25, 0.2 - r * 0.4);
        g.rotate(r * 10 + i);
        g.fillRect(-0.04, -0.012, 0.08, 0.025);
        g.restore();
      }
    },
    scenery: (g, w, h, rnd) => {
      const colors = ['#ff4081', '#40c4ff', '#ffd400', '#69f0ae', '#e040fb'];
      for (let i = 0; i < 14; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const s = 10 + rnd() * 14;
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y + s);
        g.quadraticCurveTo(x + 6, y + s * 2, x, y + s * 3);
        g.stroke();
        g.fillStyle = colors[i % colors.length];
        g.globalAlpha = 0.7;
        g.beginPath();
        g.ellipse(x, y, s * 0.8, s, 0, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
      }
      for (let x = 0; x < w; x += 26) {
        g.fillStyle = colors[(x / 26) % colors.length | 0];
        g.beginPath();
        g.moveTo(x, 4);
        g.lineTo(x + 22, 4);
        g.lineTo(x + 11, 24);
        g.fill();
      }
    },
  },
  /** Level 6, the Halloween Game: a painted-sky playground, pink guards and dalgona candy. */
  squid: {
    sky: ['#071f2c', '#0f4a63', '#1d7088'],
    floor: 'rgba(8,38,42,0.86)',
    glow: '#ff2d87',
    body: '#b0145e',
    highlight: '#ff7fb5',
    ambient: 'shapes',
    ambientColor: '255,120,180',
    floorDeco: (g, r) => {
      if (r < 0.07) {
        // Chalk lines from the playground.
        g.strokeStyle = 'rgba(235,245,240,0.16)';
        g.lineWidth = 0.035;
        g.save();
        g.rotate(r * 40);
        shape(g, Math.floor(r * 43) % 3, 0.2);
        g.stroke();
        g.restore();
      } else if (r > 0.965) {
        // Dalgona candy with a shape pressed in.
        dot(g, 0.16, 0.16, 0.15, '#c98a2e');
        dot(g, 0.16, 0.16, 0.12, '#e0a849');
        g.strokeStyle = '#9a5f17';
        g.lineWidth = 0.02;
        g.save();
        g.translate(0.16, 0.16);
        shape(g, Math.floor(r * 1000) % 3, 0.05);
        g.stroke();
        g.restore();
      }
    },
    wallDeco: (g, r) => {
      if (r > 0.14) return;
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 0.035;
      shape(g, Math.floor(r * 100) % 3, 0.09);
      g.stroke();
    },
    scenery: (g, w, h, rnd) => {
      // The painted sky of the playground wall.
      g.fillStyle = 'rgba(230,245,255,0.16)';
      for (let i = 0; i < 7; i++) cloud(g, rnd() * w, h * (0.1 + rnd() * 0.55), 22 + rnd() * 30);
      const s = Math.min(w, h) * 0.2 + 30;
      const tx = w * 0.84;
      g.fillStyle = '#04141c';
      g.fillRect(tx - s * 0.06, h - s * 1.2, s * 0.12, s * 1.2);
      for (const [dx, dy, r] of [[0, -1.35, 0.42], [-0.32, -1.1, 0.32], [0.34, -1.12, 0.3], [0.05, -1.62, 0.28]]) dot(g, tx + dx * s, h + dy * s, r * s, '#04141c');
      hills(g, w, h, '#06161d', 18, 70);
      for (let i = 0; i < 9; i++) guard(g, ((i + 0.5) / 9) * w + (rnd() - 0.5) * 20, h - 4, 16 + rnd() * 8, i % 3);
      // Glowing circle, triangle and square sign.
      g.save();
      g.shadowColor = '#ff2d87';
      g.shadowBlur = 12;
      g.strokeStyle = '#ff5ca8';
      g.lineWidth = 3;
      const sz = Math.min(w, h) * 0.03 + 6;
      for (let k = 0; k < 3; k++) {
        g.save();
        g.translate(w * 0.12 + k * sz * 2.8, Math.min(h * 0.08, 60));
        shape(g, k, sz);
        g.stroke();
        g.restore();
      }
      g.restore();
    },
  },
};
