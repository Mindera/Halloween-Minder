import type { EnemyKind, ItemKind } from './config';

/** All drawing here is in tile units: (0, 0) is the tile centre and 1 is one tile. */
type G = CanvasRenderingContext2D;
type Draw = (g: G, frame: number) => void;

export interface EyeAnchor {
  x: number;
  y: number;
  r: number;
}

const TAU = Math.PI * 2;

function circle(g: G, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function ellipse(g: G, x: number, y: number, rx: number, ry: number, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fill();
}

function rrect(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

/** fillText in tile units without relying on tiny fractional font sizes (Safari renders those badly). */
export function textU(g: G, s: string, x: number, y: number, size: number, color: string, font = 'bold', family = 'monospace') {
  const t = g.getTransform();
  const k = Math.hypot(t.a, t.b) || 1;
  g.save();
  g.scale(1 / k, 1 / k);
  g.fillStyle = color;
  g.font = `${font} ${Math.max(1, size * k)}px ${family}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s, x * k, y * k);
  g.restore();
}

function line(g: G, pts: number[], width: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
}

// ---------------------------------------------------------------- monsters

const drawZombie: Draw = (g, f) => {
  g.fillStyle = '#3b2f2f';
  g.fillRect(-0.18, 0.26, 0.12, f ? 0.24 : 0.2);
  g.fillRect(0.04, 0.26, 0.12, f ? 0.2 : 0.24);
  g.fillStyle = '#5b7fa3';
  rrect(g, -0.27, 0.0, 0.52, 0.34, 0.08);
  g.fillStyle = '#41607e';
  g.beginPath();
  g.moveTo(-0.27, 0.3);
  for (let i = 0; i <= 6; i++) g.lineTo(-0.27 + i * 0.087, i % 2 ? 0.38 : 0.31);
  g.lineTo(0.25, 0.3);
  g.fill();
  g.fillStyle = '#86c66b';
  rrect(g, 0.08, f ? 0.07 : 0.04, 0.44, 0.11, 0.05);
  rrect(g, 0.08, f ? 0.17 : 0.2, 0.44, 0.11, 0.05);
  g.fillStyle = '#9ad97a';
  circle(g, -0.02, -0.2, 0.28);
  g.fillStyle = '#2d4a22';
  g.beginPath();
  g.moveTo(-0.28, -0.3);
  g.quadraticCurveTo(-0.1, -0.58, 0.2, -0.38);
  g.quadraticCurveTo(0.02, -0.42, -0.08, -0.36);
  g.quadraticCurveTo(-0.18, -0.38, -0.28, -0.3);
  g.fill();
  line(g, [-0.2, -0.04, -0.05, 0.0, 0.1, -0.05], 0.035, '#2d4a22');
  g.fillStyle = '#fff';
  g.fillRect(-0.06, -0.01, 0.05, 0.05);
  line(g, [0.08, -0.4, 0.2, -0.33], 0.02, '#2d4a22');
  line(g, [0.11, -0.41, 0.1, -0.34, 0.15, -0.39, 0.14, -0.32], 0.015, '#2d4a22');
};

const drawPumpkin: Draw = (g, f) => {
  g.save();
  g.rotate(f ? 0.08 : -0.08);
  g.fillStyle = '#d9640a';
  ellipse(g, -0.2, 0.06, 0.24, 0.34);
  ellipse(g, 0.2, 0.06, 0.24, 0.34);
  g.fillStyle = '#ff8c1a';
  ellipse(g, 0, 0.06, 0.26, 0.37);
  g.fillStyle = '#ffa646';
  ellipse(g, -0.06, -0.08, 0.06, 0.15, 0.2);
  g.fillStyle = '#4a7a2a';
  rrect(g, -0.05, -0.44, 0.1, 0.16, 0.03);
  line(g, [0.04, -0.38, 0.16, -0.46, 0.22, -0.38], 0.03, '#6aa83a');
  g.fillStyle = '#4a1a00';
  g.beginPath();
  g.moveTo(-0.24, 0.12);
  g.quadraticCurveTo(0, 0.42, 0.24, 0.12);
  g.lineTo(0.15, 0.17);
  g.lineTo(0.09, 0.12);
  g.lineTo(0.0, 0.19);
  g.lineTo(-0.09, 0.12);
  g.lineTo(-0.15, 0.17);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffd34d';
  g.globalAlpha = 0.6;
  ellipse(g, 0, 0.24, 0.1, 0.03);
  g.restore();
};

const drawSkeleton: Draw = (g, f) => {
  const bone = '#f4f1e8';
  line(g, [0, 0.05, 0, 0.32], 0.06, bone);
  for (let i = 0; i < 3; i++) {
    const y = 0.1 + i * 0.07;
    const w = 0.16 - i * 0.025;
    line(g, [-w, y + 0.03, 0, y, w, y + 0.03], 0.035, bone);
  }
  line(g, [0, 0.32, -0.12, f ? 0.48 : 0.46], 0.05, bone);
  line(g, [0, 0.32, 0.12, f ? 0.46 : 0.48], 0.05, bone);
  line(g, [0, 0.1, 0.3, f ? 0.02 : 0.12], 0.045, bone);
  line(g, [0, 0.1, -0.26, f ? 0.18 : 0.08], 0.045, bone);
  g.fillStyle = bone;
  circle(g, 0, -0.18, 0.27);
  rrect(g, -0.15, -0.02, 0.3, 0.12, 0.04);
  g.fillStyle = '#1a1022';
  circle(g, -0.1, -0.2, 0.1);
  circle(g, 0.1, -0.2, 0.1);
  g.beginPath();
  g.moveTo(0, -0.09);
  g.lineTo(-0.035, -0.03);
  g.lineTo(0.035, -0.03);
  g.fill();
  for (let i = -2; i <= 2; i++) line(g, [i * 0.05, 0.0, i * 0.05, 0.08], 0.015, '#1a1022');
};

const drawBat: Draw = (g, f) => {
  const tip = f ? -0.32 : 0.12;
  g.fillStyle = '#2b1b3d';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(0, -0.05);
    g.quadraticCurveTo(s * 0.25, tip - 0.12, s * 0.52, tip);
    g.quadraticCurveTo(s * 0.44, 0.06, s * 0.36, 0.12);
    g.quadraticCurveTo(s * 0.3, 0.02, s * 0.22, 0.12);
    g.quadraticCurveTo(s * 0.16, 0.04, 0, 0.12);
    g.fill();
  }
  g.fillStyle = '#4a2f6b';
  ellipse(g, 0, 0.02, 0.16, 0.2);
  g.beginPath();
  g.moveTo(-0.13, -0.08);
  g.lineTo(-0.1, -0.28);
  g.lineTo(-0.02, -0.14);
  g.moveTo(0.13, -0.08);
  g.lineTo(0.1, -0.28);
  g.lineTo(0.02, -0.14);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(-0.05, 0.08);
  g.lineTo(-0.03, 0.15);
  g.lineTo(-0.01, 0.08);
  g.moveTo(0.01, 0.08);
  g.lineTo(0.03, 0.15);
  g.lineTo(0.05, 0.08);
  g.fill();
};

const drawGhost: Draw = (g, f) => {
  g.fillStyle = 'rgba(246,246,255,0.92)';
  g.beginPath();
  g.moveTo(-0.32, 0.36);
  g.lineTo(-0.32, -0.08);
  g.arc(0, -0.08, 0.32, Math.PI, 0);
  g.lineTo(0.32, 0.36);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x0 = 0.32 - (i * 0.64) / n;
    const x1 = 0.32 - ((i + 1) * 0.64) / n;
    g.quadraticCurveTo((x0 + x1) / 2, (i + f) % 2 ? 0.48 : 0.26, x1, 0.36);
  }
  g.fill();
  g.fillStyle = '#ffb3c7';
  ellipse(g, -0.2, 0.04, 0.06, 0.035);
  ellipse(g, 0.2, 0.04, 0.06, 0.035);
  g.fillStyle = '#2a1840';
  ellipse(g, 0, 0.1, 0.06, f ? 0.09 : 0.07);
};

const drawWitch: Draw = (g, f) => {
  const bob = f ? 0.02 : -0.02;
  line(g, [-0.5, 0.28 + bob, 0.48, 0.16 + bob], 0.05, '#8b5a2b');
  g.fillStyle = '#e8c15a';
  g.beginPath();
  g.moveTo(-0.38, 0.27 + bob);
  g.lineTo(-0.62, 0.14 + bob);
  g.lineTo(-0.6, 0.42 + bob);
  g.closePath();
  g.fill();
  g.fillStyle = '#5b2a86';
  g.beginPath();
  g.moveTo(-0.2, 0.28 + bob);
  g.lineTo(0.18, 0.24 + bob);
  g.lineTo(0.02, -0.04);
  g.closePath();
  g.fill();
  g.fillStyle = '#ff7b1a';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.12, -0.18);
    g.quadraticCurveTo(s * 0.26, 0.0, s * 0.2, 0.1);
    g.lineTo(s * 0.1, -0.02);
    g.fill();
  }
  g.fillStyle = '#7ccf4f';
  circle(g, 0, -0.08, 0.17);
  g.beginPath();
  g.moveTo(0.12, -0.1);
  g.lineTo(0.3, -0.03);
  g.lineTo(0.12, -0.02);
  g.fill();
  g.fillStyle = '#4c8f2b';
  circle(g, 0.24, -0.04, 0.025);
  line(g, [-0.06, 0.02, 0.0, 0.04, 0.06, 0.02], 0.02, '#2d4a22');
  g.fillStyle = '#2a1145';
  ellipse(g, 0, -0.22, 0.32, 0.06);
  g.beginPath();
  g.moveTo(-0.17, -0.23);
  g.lineTo(0.17, -0.23);
  g.quadraticCurveTo(0.02, -0.5, -0.16, -0.66);
  g.quadraticCurveTo(-0.08, -0.44, -0.17, -0.23);
  g.fill();
  g.fillStyle = '#ff9f1a';
  g.fillRect(-0.15, -0.3, 0.3, 0.05);
};

const drawMummy: Draw = (g, f) => {
  g.fillStyle = '#d9cfb3';
  rrect(g, 0.06, f ? 0.04 : 0.0, 0.42, 0.11, 0.05);
  rrect(g, 0.06, f ? 0.16 : 0.2, 0.42, 0.11, 0.05);
  g.fillStyle = '#e8dfc4';
  rrect(g, -0.25, -0.44, 0.5, 0.92, 0.22);
  g.strokeStyle = '#b8ab8a';
  g.lineWidth = 0.025;
  for (let i = 0; i < 8; i++) {
    const y = -0.38 + i * 0.11;
    g.beginPath();
    g.moveTo(-0.24, y + (i % 2 ? 0.04 : -0.02));
    g.lineTo(0.24, y + (i % 2 ? -0.02 : 0.04));
    g.stroke();
  }
  g.fillStyle = '#2a1a10';
  rrect(g, -0.2, -0.29, 0.4, 0.14, 0.05);
  g.fillStyle = '#e8dfc4';
  g.beginPath();
  g.moveTo(-0.25, 0.42);
  g.lineTo(-0.38, f ? 0.5 : 0.46);
  g.lineTo(-0.22, 0.36);
  g.fill();
};

const drawVampire: Draw = (g, f) => {
  g.fillStyle = '#14081f';
  g.beginPath();
  g.moveTo(-0.08, -0.04);
  g.lineTo(-0.42, f ? 0.46 : 0.42);
  g.lineTo(0.42, f ? 0.42 : 0.46);
  g.lineTo(0.08, -0.04);
  g.fill();
  g.fillStyle = '#b3123a';
  g.beginPath();
  g.moveTo(-0.06, 0.02);
  g.lineTo(-0.28, 0.42);
  g.lineTo(0.28, 0.42);
  g.lineTo(0.06, 0.02);
  g.fill();
  g.fillStyle = '#14081f';
  g.beginPath();
  g.moveTo(-0.08, 0.04);
  g.lineTo(-0.36, -0.08);
  g.lineTo(-0.2, 0.14);
  g.moveTo(0.08, 0.04);
  g.lineTo(0.36, -0.08);
  g.lineTo(0.2, 0.14);
  g.fill();
  g.fillStyle = '#ece4f5';
  ellipse(g, 0, -0.14, 0.2, 0.24);
  g.fillStyle = '#14081f';
  g.beginPath();
  g.moveTo(-0.22, -0.16);
  g.quadraticCurveTo(-0.24, -0.42, 0, -0.4);
  g.quadraticCurveTo(0.24, -0.42, 0.22, -0.16);
  g.quadraticCurveTo(0.16, -0.3, 0.0, -0.24);
  g.quadraticCurveTo(-0.16, -0.3, -0.22, -0.16);
  g.fill();
  line(g, [-0.08, -0.0, 0, 0.03, 0.08, 0.0], 0.02, '#5a1030');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(-0.06, 0.0);
  g.lineTo(-0.045, 0.06);
  g.lineTo(-0.03, 0.01);
  g.moveTo(0.03, 0.01);
  g.lineTo(0.045, 0.06);
  g.lineTo(0.06, 0.0);
  g.fill();
};

/** Palos' cousin (his prima): just a regular person. Long hair, polo shirt, khakis, glasses, phone full of holiday photos. */
const drawCousin: Draw = (g, f) => {
  g.fillStyle = '#c8a97e';
  g.fillRect(-0.15, 0.2, 0.12, f ? 0.26 : 0.24);
  g.fillRect(0.03, 0.2, 0.12, f ? 0.24 : 0.26);
  g.fillStyle = '#5d4037';
  g.fillRect(-0.17, f ? 0.44 : 0.42, 0.15, 0.05);
  g.fillRect(0.02, f ? 0.42 : 0.44, 0.15, 0.05);
  g.fillStyle = '#4fc3f7';
  rrect(g, -0.22, -0.08, 0.44, 0.32, 0.08);
  g.fillStyle = '#29b6f6';
  g.beginPath();
  g.moveTo(-0.08, -0.08);
  g.lineTo(0, 0.02);
  g.lineTo(0.08, -0.08);
  g.fill();
  g.fillStyle = '#f1c27d';
  rrect(g, -0.3, -0.04, 0.09, 0.24, 0.04);
  rrect(g, 0.21, f ? -0.12 : -0.08, 0.09, 0.2, 0.04);
  g.fillStyle = '#263238';
  rrect(g, 0.2, f ? -0.2 : -0.16, 0.12, 0.16, 0.02);
  g.fillStyle = '#80deea';
  g.fillRect(0.215, f ? -0.185 : -0.145, 0.09, 0.12);
  // Long hair, behind her head and down over her shoulders.
  g.fillStyle = '#6d4c41';
  g.beginPath();
  g.moveTo(-0.23, -0.3);
  g.quadraticCurveTo(-0.27, -0.53, 0, -0.51);
  g.quadraticCurveTo(0.27, -0.53, 0.23, -0.3);
  g.quadraticCurveTo(0.29, -0.1, 0.25, 0.02);
  g.quadraticCurveTo(0.19, 0.04, 0.15, -0.06);
  g.lineTo(-0.15, -0.06);
  g.quadraticCurveTo(-0.19, 0.04, -0.25, 0.02);
  g.quadraticCurveTo(-0.29, -0.1, -0.23, -0.3);
  g.fill();
  g.fillStyle = '#f1c27d';
  circle(g, 0, -0.27, 0.2);
  g.fillStyle = '#6d4c41';
  g.beginPath();
  g.moveTo(-0.2, -0.28);
  g.quadraticCurveTo(-0.18, -0.52, 0.02, -0.48);
  g.quadraticCurveTo(0.22, -0.48, 0.2, -0.28);
  g.quadraticCurveTo(0.12, -0.4, -0.2, -0.28);
  g.fill();
  g.strokeStyle = '#212121';
  g.lineWidth = 0.025;
  g.strokeRect(-0.15, -0.33, 0.12, 0.1);
  g.strokeRect(0.03, -0.33, 0.12, 0.1);
  line(g, [-0.03, -0.29, 0.03, -0.29], 0.02, '#212121');
  line(g, [-0.07, -0.16, 0, -0.13, 0.07, -0.16], 0.03, '#e91e63');
  // A hair clip.
  g.fillStyle = '#ff4081';
  ellipse(g, 0.13, -0.42, 0.05, 0.03, -0.5);
  g.fillStyle = '#fff';
  circle(g, 0.13, -0.42, 0.012);
};

interface MonsterArt {
  draw: Draw;
  eyes: EyeAnchor[];
  scale: number;
}

export const MONSTER_ART: Record<EnemyKind, MonsterArt> = {
  zombie: { draw: drawZombie, eyes: [{ x: -0.1, y: -0.22, r: 0.1 }, { x: 0.09, y: -0.19, r: 0.075 }], scale: 1 },
  pumpkin: { draw: drawPumpkin, eyes: [{ x: -0.12, y: -0.04, r: 0.1 }, { x: 0.12, y: -0.04, r: 0.1 }], scale: 1 },
  minipumpkin: { draw: drawPumpkin, eyes: [{ x: -0.12, y: -0.04, r: 0.1 }, { x: 0.12, y: -0.04, r: 0.1 }], scale: 0.7 },
  skeleton: { draw: drawSkeleton, eyes: [{ x: -0.1, y: -0.2, r: 0.075 }, { x: 0.1, y: -0.2, r: 0.075 }], scale: 1 },
  bat: { draw: drawBat, eyes: [{ x: -0.065, y: -0.03, r: 0.065 }, { x: 0.065, y: -0.03, r: 0.065 }], scale: 1.3 },
  ghost: { draw: drawGhost, eyes: [{ x: -0.11, y: -0.1, r: 0.09 }, { x: 0.11, y: -0.1, r: 0.09 }], scale: 1 },
  witch: { draw: drawWitch, eyes: [{ x: -0.05, y: -0.11, r: 0.055 }, { x: 0.07, y: -0.11, r: 0.055 }], scale: 1 },
  mummy: { draw: drawMummy, eyes: [{ x: -0.08, y: -0.22, r: 0.075 }, { x: 0.09, y: -0.22, r: 0.065 }], scale: 1 },
  vampire: { draw: drawVampire, eyes: [{ x: -0.08, y: -0.15, r: 0.065 }, { x: 0.08, y: -0.15, r: 0.065 }], scale: 1 },
  cousin: { draw: drawCousin, eyes: [{ x: -0.09, y: -0.28, r: 0.045 }, { x: 0.09, y: -0.28, r: 0.045 }], scale: 1.5 },
};

// ---------------------------------------------------------------- bonus items

const drawCricket: Draw = (g) => {
  line(g, [-0.05, 0.08, -0.18, -0.12, -0.32, 0.22], 0.035, '#2f6b1e');
  line(g, [0.05, 0.1, 0.0, 0.26], 0.03, '#2f6b1e');
  line(g, [0.15, 0.1, 0.2, 0.26], 0.03, '#2f6b1e');
  g.fillStyle = '#58b33a';
  ellipse(g, -0.02, 0.04, 0.3, 0.12, -0.1);
  g.fillStyle = '#3d8a25';
  ellipse(g, -0.06, 0.0, 0.22, 0.07, -0.1);
  g.fillStyle = '#6fcf4a';
  circle(g, 0.28, -0.02, 0.11);
  g.strokeStyle = '#2f6b1e';
  g.lineWidth = 0.02;
  g.beginPath();
  g.moveTo(0.3, -0.12);
  g.quadraticCurveTo(0.1, -0.5, -0.38, -0.32);
  g.moveTo(0.34, -0.11);
  g.quadraticCurveTo(0.2, -0.46, -0.2, -0.42);
  g.stroke();
  g.fillStyle = '#111';
  circle(g, 0.32, -0.04, 0.03);
};

const drawSpice: Draw = (g) => {
  g.fillStyle = '#e3122b';
  g.beginPath();
  g.moveTo(-0.24, -0.2);
  g.bezierCurveTo(0.2, -0.32, 0.38, 0.0, 0.18, 0.4);
  g.bezierCurveTo(0.14, 0.12, -0.02, -0.04, -0.26, -0.04);
  g.closePath();
  g.fill();
  line(g, [-0.12, -0.16, 0.1, -0.16, 0.2, -0.02], 0.03, 'rgba(255,255,255,0.55)');
  g.fillStyle = '#3d9a2a';
  g.beginPath();
  g.moveTo(-0.26, -0.22);
  g.quadraticCurveTo(-0.34, -0.12, -0.28, -0.03);
  g.quadraticCurveTo(-0.2, -0.12, -0.26, -0.22);
  g.fill();
  line(g, [-0.28, -0.18, -0.36, -0.36], 0.04, '#3d9a2a');
  g.fillStyle = '#ffb31a';
  g.beginPath();
  g.moveTo(0.2, 0.42);
  g.quadraticCurveTo(0.32, 0.3, 0.3, 0.18);
  g.quadraticCurveTo(0.4, 0.3, 0.3, 0.46);
  g.fill();
};

const drawPig: Draw = (g) => {
  g.fillStyle = '#f48fb1';
  g.beginPath();
  g.moveTo(-0.28, -0.12);
  g.lineTo(-0.3, -0.38);
  g.lineTo(-0.08, -0.24);
  g.moveTo(0.28, -0.12);
  g.lineTo(0.3, -0.38);
  g.lineTo(0.08, -0.24);
  g.fill();
  g.fillStyle = '#f8bbd0';
  circle(g, 0, 0.04, 0.32);
  g.fillStyle = '#f48fb1';
  ellipse(g, 0, 0.12, 0.14, 0.1);
  g.fillStyle = '#ad1457';
  ellipse(g, -0.05, 0.12, 0.03, 0.045);
  ellipse(g, 0.05, 0.12, 0.03, 0.045);
  g.fillStyle = '#222';
  circle(g, -0.12, -0.05, 0.035);
  circle(g, 0.12, -0.05, 0.035);
  g.fillStyle = 'rgba(255,105,140,0.5)';
  circle(g, -0.21, 0.08, 0.05);
  circle(g, 0.21, 0.08, 0.05);
};

const drawEclair: Draw = (g) => {
  g.fillStyle = '#e8b86d';
  rrect(g, -0.4, -0.04, 0.8, 0.24, 0.12);
  g.fillStyle = '#fff6dc';
  rrect(g, -0.38, -0.06, 0.76, 0.08, 0.04);
  g.fillStyle = '#5b3216';
  rrect(g, -0.38, -0.16, 0.76, 0.13, 0.065);
  for (const x of [-0.22, 0.02, 0.24]) ellipse(g, x, -0.02, 0.035, 0.05);
  line(g, [-0.24, -0.12, -0.06, -0.12], 0.025, 'rgba(255,255,255,0.4)');
};

const drawBeer: Draw = (g) => {
  g.strokeStyle = '#d7e3ea';
  g.lineWidth = 0.06;
  g.beginPath();
  g.arc(0.2, 0.08, 0.12, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  g.fillStyle = '#f5a623';
  rrect(g, -0.24, -0.16, 0.44, 0.5, 0.05);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  rrect(g, -0.2, -0.12, 0.06, 0.4, 0.03);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (const [x, y] of [
    [0.02, 0.2],
    [0.1, 0.06],
    [-0.04, 0.0],
  ])
    circle(g, x, y, 0.025);
  g.fillStyle = '#fff';
  for (const [x, y, r] of [
    [-0.18, -0.2, 0.1],
    [-0.04, -0.25, 0.12],
    [0.12, -0.2, 0.1],
    [0.22, -0.12, 0.06],
  ])
    circle(g, x, y, r);
};

const drawComputer: Draw = (g) => {
  g.fillStyle = '#9aa4b1';
  g.beginPath();
  g.moveTo(-0.4, 0.26);
  g.lineTo(0.4, 0.26);
  g.lineTo(0.32, 0.16);
  g.lineTo(-0.32, 0.16);
  g.fill();
  g.fillStyle = '#2c3440';
  rrect(g, -0.32, -0.32, 0.64, 0.48, 0.05);
  g.fillStyle = '#ffd400';
  rrect(g, -0.27, -0.27, 0.54, 0.38, 0.03);
  textU(g, '</>', 0, -0.08, 0.22, '#2c3440');
};

const drawCoffee: Draw = (g) => {
  line(g, [-0.1, -0.22, -0.04, -0.3, -0.1, -0.38], 0.03, 'rgba(255,255,255,0.7)');
  line(g, [0.06, -0.22, 0.12, -0.3, 0.06, -0.38], 0.03, 'rgba(255,255,255,0.7)');
  g.strokeStyle = '#fafafa';
  g.lineWidth = 0.055;
  g.beginPath();
  g.arc(0.22, 0.04, 0.1, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  g.fillStyle = '#fafafa';
  g.beginPath();
  g.moveTo(-0.26, -0.14);
  g.lineTo(0.24, -0.14);
  g.lineTo(0.18, 0.3);
  g.quadraticCurveTo(-0.01, 0.36, -0.2, 0.3);
  g.closePath();
  g.fill();
  g.fillStyle = '#6b3e1f';
  ellipse(g, -0.01, -0.13, 0.24, 0.05);
  g.fillStyle = '#ff8c1a';
  g.fillRect(-0.22, 0.04, 0.42, 0.07);
};

/** A foosball: a little white ball with black patches (centred on 0,0, radius r), turned by `spin`. */
export function drawFootball(g: G, r: number, spin: number) {
  g.save();
  g.rotate(spin);
  g.fillStyle = '#fafafa';
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = '#263238';
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38);
  }
  g.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5 + Math.PI / 2;
    g.beginPath();
    g.arc(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, r * 0.34, 0, TAU);
    g.fill();
  }
  g.restore();
  g.strokeStyle = '#78909c';
  g.lineWidth = r * 0.12;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.stroke();
  g.restore();
}

/** Bola de matraquilhos: a little red table-football player on its rod, and the ball. */
const drawFoosball: Draw = (g, f) => {
  line(g, [-0.46, -0.16, 0.46, -0.16], 0.06, '#cfd8dc');
  g.fillStyle = '#d32f2f';
  rrect(g, -0.34, -0.3, 0.22, 0.38, 0.07);
  g.fillStyle = '#ffcc80';
  circle(g, -0.23, -0.38, 0.1);
  g.fillStyle = '#212121';
  rrect(g, f ? -0.3 : -0.32, 0.06, 0.16, 0.12, 0.04);
  g.save();
  g.translate(0.17, 0.12);
  drawFootball(g, 0.25, f ? 0.6 : 0);
  g.restore();
};

/** A half-unwrapped chocolate bar with a bite out of it, and a little flame flickering over it. */
const drawChoco: Draw = (g, f) => {
  g.save();
  g.rotate(-0.3);
  // The bar, with a bite out of the top-right corner.
  g.save();
  g.beginPath();
  g.rect(-0.4, -0.5, 0.8, 1);
  g.arc(0.2, -0.36, 0.1, 0, TAU, true);
  g.clip('evenodd');
  g.fillStyle = '#4e2a12';
  rrect(g, -0.2, -0.38, 0.4, 0.42, 0.05);
  g.fillStyle = '#7b4a24';
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) rrect(g, -0.17 + c * 0.18, -0.35 + r * 0.18, 0.15, 0.15, 0.03);
  g.restore();
  // Red wrapper with a zigzag of gold foil.
  g.fillStyle = '#ffd54f';
  g.beginPath();
  g.moveTo(-0.22, 0.04);
  for (let i = 0; i <= 8; i++) g.lineTo(-0.22 + i * 0.055, i % 2 ? -0.03 : 0.04);
  g.lineTo(0.22, 0.1);
  g.lineTo(-0.22, 0.1);
  g.fill();
  g.fillStyle = '#d32f2f';
  rrect(g, -0.23, 0.06, 0.46, 0.32, 0.04);
  g.fillStyle = '#ffd54f';
  g.fillRect(-0.23, 0.18, 0.46, 0.06);
  g.restore();
  // Hot!
  const s = f ? 1.15 : 0.9;
  g.fillStyle = '#ff6d00';
  g.beginPath();
  g.moveTo(0.3, -0.18);
  g.quadraticCurveTo(0.44, -0.24, 0.36, -0.42 * s);
  g.quadraticCurveTo(0.3, -0.3, 0.26, -0.36);
  g.quadraticCurveTo(0.16, -0.24, 0.3, -0.18);
  g.fill();
  g.fillStyle = '#ffea00';
  ellipse(g, 0.31, -0.24, 0.035, 0.05 * s);
};

const drawRoach: Draw = (g, f) => {
  const wiggle = f ? 0.04 : -0.04;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = -0.08 + i * 0.12;
      line(g, [s * 0.1, y, s * 0.26, y + (i - 1) * 0.08 + wiggle * s, s * 0.34, y + (i - 1) * 0.12], 0.025, '#3e2723');
    }
  }
  g.strokeStyle = '#3e2723';
  g.lineWidth = 0.018;
  g.beginPath();
  g.moveTo(-0.04, -0.26);
  g.quadraticCurveTo(-0.15, -0.45, -0.32 + wiggle, -0.42);
  g.moveTo(0.04, -0.26);
  g.quadraticCurveTo(0.15, -0.45, 0.32 - wiggle, -0.42);
  g.stroke();
  g.fillStyle = '#6d3b1f';
  ellipse(g, 0, 0.05, 0.15, 0.26);
  g.fillStyle = '#8d5a2b';
  ellipse(g, -0.05, 0.08, 0.07, 0.2, 0.1);
  ellipse(g, 0.05, 0.08, 0.07, 0.2, -0.1);
  line(g, [0, -0.12, 0, 0.3], 0.015, '#3e2723');
  g.fillStyle = '#4e342e';
  ellipse(g, 0, -0.22, 0.09, 0.07);
  g.fillStyle = '#fff';
  circle(g, -0.04, -0.24, 0.03);
  circle(g, 0.04, -0.24, 0.03);
  g.fillStyle = '#000';
  circle(g, -0.035, -0.235, 0.015);
  circle(g, 0.045, -0.235, 0.015);
};

const drawRabbit: Draw = (g, f) => {
  const hop = f ? -0.04 : 0;
  g.fillStyle = '#f5f5f5';
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 0.09, -0.2 + hop);
    g.rotate(s * (f ? 0.25 : 0.12));
    ellipse(g, 0, -0.18, 0.06, 0.2);
    g.fillStyle = '#f8bbd0';
    ellipse(g, 0, -0.17, 0.03, 0.14);
    g.restore();
    g.fillStyle = '#f5f5f5';
  }
  ellipse(g, 0, 0.18 + hop * 0.5, 0.22, 0.17);
  circle(g, 0, -0.05 + hop, 0.17);
  g.fillStyle = '#111';
  g.beginPath();
  g.roundRect(-0.15, -0.1 + hop, 0.13, 0.07, 0.03);
  g.roundRect(0.02, -0.1 + hop, 0.13, 0.07, 0.03);
  g.fill();
  line(g, [-0.02, -0.07 + hop, 0.02, -0.07 + hop], 0.02, '#111');
  g.fillStyle = '#f06292';
  circle(g, 0, 0.02 + hop, 0.03);
  line(g, [-0.04, 0.03 + hop, -0.2, 0.0 + hop], 0.01, '#9e9e9e');
  line(g, [0.04, 0.03 + hop, 0.2, 0.0 + hop], 0.01, '#9e9e9e');
};

/** A pumpkin bomb: a little jack-o'-lantern with a fuse (f = spark frame). */
export const drawBomb: Draw = (g, f) => {
  g.fillStyle = '#d9640a';
  ellipse(g, -0.13, 0.08, 0.16, 0.24);
  ellipse(g, 0.13, 0.08, 0.16, 0.24);
  g.fillStyle = '#ff8c1a';
  ellipse(g, 0, 0.08, 0.18, 0.26);
  g.fillStyle = '#3e2723';
  g.beginPath();
  g.moveTo(-0.13, 0.0);
  g.lineTo(-0.05, -0.05);
  g.lineTo(-0.05, 0.03);
  g.moveTo(0.13, 0.0);
  g.lineTo(0.05, -0.05);
  g.lineTo(0.05, 0.03);
  g.fill();
  g.beginPath();
  g.moveTo(-0.12, 0.13);
  g.quadraticCurveTo(0, 0.24, 0.12, 0.13);
  g.lineTo(0, 0.17);
  g.closePath();
  g.fill();
  line(g, [0, -0.17, 0.05, -0.3, 0.14, -0.36], 0.035, '#5d4037');
  g.fillStyle = f ? '#ffea00' : '#ff3d00';
  circle(g, 0.15, -0.37, f ? 0.06 : 0.045);
  g.fillStyle = '#fff';
  circle(g, 0.15, -0.37, 0.02);
};

const drawCandy: Draw = (g) => {
  g.fillStyle = '#8e44ad';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.16, 0);
    g.lineTo(s * 0.4, -0.16);
    g.lineTo(s * 0.36, 0);
    g.lineTo(s * 0.4, 0.16);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#ff8c1a';
  circle(g, 0, 0, 0.2);
  g.save();
  g.beginPath();
  g.arc(0, 0, 0.2, 0, TAU);
  g.clip();
  g.strokeStyle = '#fff3e0';
  g.lineWidth = 0.05;
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(i * 0.1 - 0.2, -0.25);
    g.lineTo(i * 0.1 + 0.2, 0.25);
    g.stroke();
  }
  g.restore();
};

const drawCake: Draw = (g, f) => {
  g.fillStyle = '#f8bbd0';
  rrect(g, -0.36, 0.02, 0.72, 0.3, 0.06);
  g.fillStyle = '#fff';
  rrect(g, -0.26, -0.18, 0.52, 0.22, 0.05);
  textU(g, '12', 0, 0.18, 0.16, '#ffd400', 'bold', 'sans-serif');
  for (const x of [-0.12, 0.12]) {
    g.fillStyle = '#4fc3f7';
    g.fillRect(x - 0.02, -0.34, 0.04, 0.16);
    g.fillStyle = f ? '#ffeb3b' : '#ff9800';
    ellipse(g, x, -0.39, 0.03, 0.05);
  }
  g.fillStyle = '#e91e63';
  for (let i = 0; i < 5; i++) circle(g, -0.24 + i * 0.12, 0.04, 0.03);
};

export const ITEM_ART: Record<ItemKind, Draw> = {
  cricket: drawCricket,
  spice: drawSpice,
  pig: drawPig,
  eclair: drawEclair,
  beer: drawBeer,
  computer: drawComputer,
  coffee: drawCoffee,
  choco: drawChoco,
  foosball: drawFoosball,
  roach: drawRoach,
  rabbit: drawRabbit,
  bomb: drawBomb,
  candy: drawCandy,
  cake: drawCake,
};

// ---------------------------------------------------------------- IT pellets

function text(g: G, s: string, color: string, size: number) {
  textU(g, s, 0, 0.01, size, color);
}

const PELLETS: Draw[] = [
  (g) => text(g, '0', '#39ff88', 0.3),
  (g) => text(g, '1', '#39ff88', 0.3),
  (g) => text(g, '{}', '#ffd400', 0.24),
  (g) => {
    g.fillStyle = '#3d7bd9';
    rrect(g, -0.12, -0.12, 0.24, 0.24, 0.03);
    g.fillStyle = '#c9d3df';
    g.fillRect(-0.06, -0.12, 0.12, 0.08);
    g.fillStyle = '#fff';
    g.fillRect(-0.08, 0.02, 0.16, 0.08);
  },
  (g) => {
    g.strokeStyle = '#d4af37';
    g.lineWidth = 0.02;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(-0.16, i * 0.06);
      g.lineTo(0.16, i * 0.06);
      g.moveTo(i * 0.06, -0.16);
      g.lineTo(i * 0.06, 0.16);
      g.stroke();
    }
    g.fillStyle = '#222';
    rrect(g, -0.1, -0.1, 0.2, 0.2, 0.02);
    g.fillStyle = '#39ff88';
    circle(g, -0.05, -0.05, 0.02);
  },
  // A cloud (the IT kind): deliberately not an insect, so it can't be mistaken for the cricket bonus.
  (g) => {
    g.fillStyle = '#b3e5fc';
    circle(g, -0.08, 0.03, 0.08);
    circle(g, 0.02, -0.03, 0.1);
    circle(g, 0.1, 0.04, 0.07);
    rrect(g, -0.16, 0.02, 0.32, 0.09, 0.045);
  },
  (g) => {
    g.fillStyle = '#c9d3df';
    g.fillRect(-0.06, -0.2, 0.12, 0.08);
    g.fillStyle = '#e74c3c';
    rrect(g, -0.08, -0.12, 0.16, 0.3, 0.04);
  },
  (g) => {
    g.strokeStyle = '#4dd0e1';
    g.lineWidth = 0.035;
    g.lineCap = 'round';
    for (const r of [0.08, 0.15, 0.22]) {
      g.beginPath();
      g.arc(0, 0.12, r, -Math.PI * 0.78, -Math.PI * 0.22);
      g.stroke();
    }
    g.fillStyle = '#4dd0e1';
    circle(g, 0, 0.12, 0.03);
  },
];

const PARTY_PELLETS: Draw[] = [
  (g) => {
    g.fillStyle = '#ff80ab';
    circle(g, 0, -0.04, 0.12);
    g.fillStyle = '#c8a165';
    g.beginPath();
    g.moveTo(-0.11, 0.0);
    g.lineTo(0.11, 0.0);
    g.lineTo(0.08, 0.14);
    g.lineTo(-0.08, 0.14);
    g.fill();
    g.fillStyle = '#e53935';
    circle(g, 0, -0.16, 0.035);
  },
  (g) => {
    g.fillStyle = '#ffd400';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.07 : 0.16;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  },
  (g) => text(g, '12', '#ffd400', 0.2),
  (g) => {
    line(g, [0, 0.08, 0.02, 0.2], 0.012, '#fff');
    g.fillStyle = '#4fc3f7';
    ellipse(g, 0, -0.04, 0.1, 0.13);
  },
];

export const PELLET_KINDS = PELLETS.length;
export const PARTY_PELLET_KINDS = PARTY_PELLETS.length;

// ---------------------------------------------------------------- prerendering

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Size of one tile inside this sprite, in canvas pixels. */
  unit: number;
}

export function bake(tilePx: number, draw: (g: G) => void, span = 1.5, glow?: string): Sprite {
  const size = Math.max(4, Math.ceil(tilePx * span));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.translate(size / 2, size / 2);
  g.scale(tilePx, tilePx);
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = tilePx * 0.25;
  }
  draw(g);
  return { canvas, unit: tilePx };
}

export class SpriteBank {
  monsters = new Map<string, Sprite>();
  items = new Map<ItemKind, Sprite[]>();
  pellets: Sprite[] = [];
  party: Sprite[] = [];
  tilePx = 0;

  build(tilePx: number) {
    if (Math.abs(tilePx - this.tilePx) < 0.5) return;
    this.tilePx = tilePx;
    this.monsters.clear();
    this.items.clear();
    for (const [kind, art] of Object.entries(MONSTER_ART)) {
      for (const f of [0, 1]) {
        this.monsters.set(`${kind}${f}`, bake(tilePx * art.scale, (g) => art.draw(g, f), 1.6));
      }
    }
    for (const [kind, draw] of Object.entries(ITEM_ART) as [ItemKind, Draw][]) {
      this.items.set(kind, [0, 1].map((f) => bake(tilePx, (g) => draw(g, f), 1.6, 'rgba(255,240,180,0.9)')));
    }
    this.pellets = PELLETS.map((d) => bake(tilePx, (g) => d(g, 0), 1, 'rgba(120,255,200,0.6)'));
    this.party = PARTY_PELLETS.map((d) => bake(tilePx, (g) => d(g, 0), 1, 'rgba(255,220,120,0.7)'));
  }
}

/** Googly eyes are drawn live so the pupils can follow the minder around. */
export function drawGooglyEye(g: G, x: number, y: number, r: number, lookX: number, lookY: number, wobble: number) {
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.strokeStyle = '#111';
  g.lineWidth = r * 0.18;
  g.stroke();
  const len = Math.hypot(lookX, lookY) || 1;
  const px = x + (lookX / len) * r * 0.42 + Math.sin(wobble) * r * 0.08;
  const py = y + (lookY / len) * r * 0.42 + Math.cos(wobble * 1.3) * r * 0.08;
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(px, py, r * 0.52, 0, TAU);
  g.fill();
}

export function drawEyeball(g: G, x: number, y: number, r: number, dx: number, dy: number, iris: string, spin: number) {
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.strokeStyle = '#e53935';
  g.lineWidth = r * 0.1;
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * TAU) / 3;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
    g.quadraticCurveTo(
      x + Math.cos(a + 0.3) * r * 0.75,
      y + Math.sin(a + 0.3) * r * 0.75,
      x + Math.cos(a) * r * 0.6,
      y + Math.sin(a) * r * 0.6,
    );
    g.stroke();
  }
  const ix = x + dx * r * 0.42;
  const iy = y + dy * r * 0.42;
  g.fillStyle = iris;
  g.beginPath();
  g.arc(ix, iy, r * 0.5, 0, TAU);
  g.fill();
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(ix + dx * r * 0.1, iy + dy * r * 0.1, r * 0.26, 0, TAU);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(ix - r * 0.15, iy - r * 0.15, r * 0.1, 0, TAU);
  g.fill();
}

export function drawTombstone(g: G) {
  g.fillStyle = '#5d5470';
  g.beginPath();
  g.moveTo(-0.22, 0.32);
  g.lineTo(-0.22, -0.08);
  g.arc(0, -0.08, 0.22, Math.PI, 0);
  g.lineTo(0.22, 0.32);
  g.fill();
  textU(g, 'RIP', 0, -0.02, 0.13, '#3b3450', 'bold', 'sans-serif');
  g.fillStyle = '#2e6b2e';
  g.fillRect(-0.3, 0.3, 0.6, 0.06);
}
