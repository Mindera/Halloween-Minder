export interface Point {
  x: number;
  y: number;
}

export const OPEN = 0;
export const WALL = 1;
/** A crate: blocks like a wall until eyeballs break it. */
export const CRATE = 2;

export interface Maze {
  w: number;
  h: number;
  /** OPEN, WALL or CRATE. Indexed y * w + x. */
  walls: Uint8Array;
  spawns: Point[];
  start: Point;
  /** Teleport pairs. */
  portals: [Point, Point][];
  umbrellas: Point[];
}

export interface MazeFeatures {
  /** Chance of extra loops through the maze (higher = more open). */
  loops: number;
  /** Carve an open hall in the middle. */
  room: boolean;
  /** Fraction of eligible walls turned into shortcut crates. */
  crates: number;
  /** Rooms sealed by crates: you have to shoot your way in to get their bits. */
  vaults: number;
  portals: number;
  umbrellas: number;
}

export const DIRS: Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export const opposite = (d: number) => (d < 0 ? -1 : (d + 2) % 4);

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function isWall(m: Maze, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
  return m.walls[y * m.w + x] !== OPEN;
}

/**
 * Symmetric, braided maze (no dead ends) so the chase always has an escape route,
 * which keeps it closer to Pac-Man corridors than to a puzzle labyrinth.
 */
export function generateMaze(w: number, h: number, rng: Rng, f: MazeFeatures): Maze {
  const walls = new Uint8Array(w * h).fill(WALL);
  const mid = (w - 1) / 2;
  const set = (x: number, y: number, v: number) => {
    walls[y * w + x] = v;
    walls[y * w + (w - 1 - x)] = v;
  };
  const get = (x: number, y: number) => walls[y * w + x];

  // Recursive backtracker on the left half (cells at odd coordinates).
  const maxCx = mid % 2 === 1 ? mid : mid - 1;
  const stack: Point[] = [{ x: 1, y: 1 }];
  set(1, 1, OPEN);
  while (stack.length) {
    const c = stack[stack.length - 1];
    const options = DIRS.map((d) => ({ x: c.x + d.x * 2, y: c.y + d.y * 2, d })).filter(
      (n) => n.x >= 1 && n.x <= maxCx && n.y >= 1 && n.y <= h - 2 && get(n.x, n.y) === WALL,
    );
    if (!options.length) {
      stack.pop();
      continue;
    }
    const n = options[Math.floor(rng() * options.length)];
    set(c.x + n.d.x, c.y + n.d.y, OPEN);
    set(n.x, n.y, OPEN);
    stack.push({ x: n.x, y: n.y });
  }

  // When the centre column is a wall column, punch a few doors through it.
  if (mid % 2 === 0) {
    const rows: number[] = [];
    for (let y = 1; y < h - 1; y += 2) rows.push(y);
    const doors = Math.max(2, Math.floor(rows.length / 2));
    for (let i = 0; i < doors; i++) {
      const y = rows.splice(Math.floor(rng() * rows.length), 1)[0];
      walls[y * w + mid] = OPEN;
    }
  }

  // Braid: remove every dead end.
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x <= maxCx; x += 2) {
      const open = DIRS.filter((d) => get(x + d.x, y + d.y) === OPEN).length;
      if (open > 1) continue;
      const knock = DIRS.filter((d) => {
        const wx = x + d.x;
        const wy = y + d.y;
        return wx > 0 && wy > 0 && wx < w - 1 && wy < h - 1 && get(wx, wy) === WALL;
      });
      if (!knock.length) continue;
      const d = knock[Math.floor(rng() * knock.length)];
      set(x + d.x, y + d.y, OPEN);
    }
  }

  // Extra loops for more Pac-Man-like flow.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x <= mid; x++) {
      if (get(x, y) !== WALL || (x % 2 === 1 && y % 2 === 1) || (x % 2 === 0 && y % 2 === 0)) continue;
      if (rng() < f.loops) set(x, y, OPEN);
    }
  }

  if (f.room && w >= 11 && h >= 11) {
    const cy = Math.floor(h / 2);
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = Math.floor(mid) - 1; x <= Math.ceil(mid) + 1; x++) walls[y * w + x] = OPEN;
  }

  return addFeatures(finish({ w, h, walls, spawns: [], start: { x: 0, y: 0 }, portals: [], umbrellas: [] }), rng, f);
}

const GLYPHS: Record<string, string[]> = {
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  '2': ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'],
};

/** Level 12: an open party hall with a giant "12" in the middle. */
export function generateAnniversaryMaze(w: number, h: number, rng: Rng, f: MazeFeatures): Maze {
  const walls = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    walls[x] = WALL;
    walls[(h - 1) * w + x] = WALL;
  }
  for (let y = 0; y < h; y++) {
    walls[y * w] = WALL;
    walls[y * w + w - 1] = WALL;
  }
  // "1" is 3 wide, a 1-tile gap, then "2" is 4 wide.
  const sx = Math.max(1, Math.floor((w - 5) / 8));
  const sy = Math.max(1, Math.floor((h - 6) / 7));
  const gw = 8 * sx;
  const gh = 7 * sy;
  const ox = Math.floor((w - gw) / 2);
  const oy = Math.floor((h - gh) / 2);
  ['1', '2'].forEach((ch, i) => {
    GLYPHS[ch].forEach((row, ry) => {
      [...row].forEach((c, rx) => {
        if (c !== '#') return;
        for (let yy = 0; yy < sy; yy++) {
          for (let xx = 0; xx < sx; xx++) {
            const x = ox + (i * 4 + rx) * sx + xx;
            const y = oy + ry * sy + yy;
            walls[y * w + x] = WALL;
          }
        }
      });
    });
  });
  // Party pillars around the outside of the "12".
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      if (x >= ox - 1 && x <= ox + gw && y >= oy - 1 && y <= oy + gh) continue;
      if (rng() < 0.25) walls[y * w + x] = WALL;
    }
  }
  return addFeatures(finish({ w, h, walls, spawns: [], start: { x: 0, y: 0 }, portals: [], umbrellas: [] }), rng, {
    ...f,
    crates: 0,
    vaults: 0,
  });
}

/** Keeps only the largest connected area, then picks the start tile and monster spawn points inside it. */
function finish(m: Maze): Maze {
  const { w, h } = m;
  const seen = new Uint8Array(w * h);
  let best: Int16Array | null = null;
  let bestSize = 0;
  for (let i = 0; i < w * h; i++) {
    if (m.walls[i] || seen[i]) continue;
    const x = i % w;
    const dist = bfs(m, x, (i - x) / w);
    let size = 0;
    for (let j = 0; j < w * h; j++) {
      if (dist[j] < 0) continue;
      seen[j] = 1;
      size++;
    }
    if (size > bestSize) {
      bestSize = size;
      best = dist;
    }
  }
  if (best) for (let i = 0; i < w * h; i++) if (best[i] < 0) m.walls[i] = WALL;

  const nearestOpen = (tx: number, ty: number): Point => {
    let best: Point = { x: 1, y: 1 };
    let bd = Infinity;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (isWall(m, x, y)) continue;
        const d = Math.abs(x - tx) + Math.abs(y - ty) * 1.01;
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    }
    return best;
  };
  m.start = nearestOpen(Math.floor(w / 2), h - 2);
  m.spawns = [nearestOpen(1, 1), nearestOpen(w - 2, 1), nearestOpen(Math.floor(w / 2), 1)];
  if (h >= 17) m.spawns.push(nearestOpen(1, Math.floor(h / 2)), nearestOpen(w - 2, Math.floor(h / 2)));
  m.spawns = m.spawns.filter((s, i, all) => all.findIndex((o) => o.x === s.x && o.y === s.y) === i);
  return m;
}

/** Crates, crate-sealed rooms, teleports and umbrellas, placed so nothing important gets cut off. */
function addFeatures(m: Maze, rng: Rng, f: MazeFeatures): Maze {
  const { w, h } = m;
  const at = (x: number, y: number) => y * w + x;
  const mirror = (i: number) => {
    const x = i % w;
    return at(w - 1 - x, (i - x) / w);
  };
  const reserved = new Set<number>([at(m.start.x, m.start.y), ...m.spawns.map((s) => at(s.x, s.y))]);
  const nearStart = (x: number, y: number) => Math.abs(x - m.start.x) + Math.abs(y - m.start.y) < 3;

  // Sealed rooms: one or two cells whose every door becomes a crate (mirrored on both sides).
  for (let v = 0; v < f.vaults; v++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const cx = 1 + 2 * Math.floor(rng() * Math.ceil((w - 1) / 4));
      const cy = 1 + 2 * Math.floor(rng() * ((h - 1) / 2));
      if (cx >= w - 1 || cy >= h - 1 || m.walls[at(cx, cy)] !== OPEN || nearStart(cx, cy)) continue;
      const cells = [at(cx, cy)];
      const pairDir = Math.floor(rng() * 4);
      const nx = cx + DIRS[pairDir].x * 2;
      const ny = cy + DIRS[pairDir].y * 2;
      if (rng() < 0.6 && nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && m.walls[at(cx + DIRS[pairDir].x, cy + DIRS[pairDir].y)] === OPEN && !nearStart(nx, ny)) {
        cells.push(at(cx + DIRS[pairDir].x, cy + DIRS[pairDir].y), at(nx, ny));
      }
      const inside = new Set<number>();
      for (const c of cells) inside.add(c).add(mirror(c));
      const doors = new Set<number>();
      for (const c of inside) {
        const x = c % w;
        const y = (c - x) / w;
        for (const d of DIRS) {
          const n = at(x + d.x, y + d.y);
          if (!inside.has(n) && m.walls[n] === OPEN) doors.add(n);
        }
      }
      if (!doors.size || [...inside, ...doors].some((i) => reserved.has(i))) continue;
      for (const d of doors) m.walls[d] = CRATE;
      // Everything outside the sealed room must still be reachable from the start.
      const dist = bfs(m, m.start.x, m.start.y);
      let ok = true;
      for (let i = 0; i < w * h && ok; i++) if (m.walls[i] === OPEN && !inside.has(i) && dist[i] < 0) ok = false;
      if (ok) {
        for (const i of [...inside, ...doors]) reserved.add(i);
        break;
      }
      for (const d of doors) m.walls[d] = OPEN;
    }
  }

  // Shortcut crates: walls between two open tiles that become passages once broken.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x <= (w - 1) / 2; x++) {
      if (m.walls[at(x, y)] !== WALL || x % 2 === y % 2) continue;
      const horiz = m.walls[at(x - 1, y)] === OPEN && m.walls[at(x + 1, y)] === OPEN;
      const vert = m.walls[at(x, y - 1)] === OPEN && m.walls[at(x, y + 1)] === OPEN;
      if ((horiz || vert) && rng() < f.crates) {
        m.walls[at(x, y)] = CRATE;
        m.walls[mirror(at(x, y))] = CRATE;
      }
    }
  }

  const fromStart = bfs(m, m.start.x, m.start.y);
  const candidates = () => {
    const out: number[] = [];
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = (i - x) / w;
      if (m.walls[i] !== OPEN || fromStart[i] < 0 || reserved.has(i) || nearStart(x, y)) continue;
      out.push(i);
    }
    return out;
  };
  const pt = (i: number): Point => ({ x: i % w, y: Math.floor(i / w) });
  // A portal on the only way into an area would make that area impossible to walk into.
  const isChokepoint = (i: number) => {
    m.walls[i] = WALL;
    const d = bfs(m, m.start.x, m.start.y);
    m.walls[i] = OPEN;
    for (let j = 0; j < w * h; j++) if (j !== i && m.walls[j] === OPEN && fromStart[j] >= 0 && d[j] < 0) return true;
    return false;
  };
  const pickFrom = (pool: number[]) => {
    for (let tries = 0; tries < 25 && pool.length; tries++) {
      const i = pool[Math.floor(rng() * pool.length)];
      if (!isChokepoint(i)) return i;
    }
    return -1;
  };

  for (let p = 0; p < f.portals; p++) {
    const pool = candidates().filter((i) => fromStart[i] >= 3);
    if (pool.length < 2) break;
    const a = pickFrom(pool);
    if (a < 0) break;
    const da = bfs(m, a % w, Math.floor(a / w));
    const max = Math.max(...pool.map((i) => da[i]));
    const b = pickFrom(pool.filter((i) => i !== a && da[i] >= max * 0.6));
    if (b < 0) break;
    m.portals.push([pt(a), pt(b)]);
    for (const i of [a, b]) for (const d of [0, 1, -1, w, -w]) reserved.add(i + d);
  }

  const junctions = candidates().filter((i) => {
    const x = i % w;
    const y = (i - x) / w;
    return DIRS.filter((d) => !isWall(m, x + d.x, y + d.y)).length >= 3 && fromStart[i] >= 4;
  });
  for (let u = 0; u < f.umbrellas && junctions.length; u++) {
    const ok = junctions.filter((i) => m.umbrellas.every((o) => Math.abs(o.x - (i % w)) + Math.abs(o.y - Math.floor(i / w)) >= 5));
    if (!ok.length) break;
    const i = ok[Math.floor(rng() * ok.length)];
    m.umbrellas.push(pt(i));
  }
  return m;
}

/**
 * Breadth-first distance map from (sx, sy). -1 for walls and unreachable tiles.
 * `links` maps a tile to the tile it teleports to (or -1), so chasers can use portals.
 */
export function bfs(m: Maze, sx: number, sy: number, out?: Int16Array, links?: Int32Array): Int16Array {
  const { w, h } = m;
  const dist = out ?? new Int16Array(w * h);
  dist.fill(-1);
  if (isWall(m, sx, sy)) return dist;
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = sy * w + sx;
  dist[sy * w + sx] = 0;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (isWall(m, nx, ny)) continue;
      const ni = ny * w + nx;
      if (dist[ni] >= 0) continue;
      dist[ni] = dist[i] + 1;
      queue[tail++] = ni;
    }
    const li = links ? links[i] : -1;
    if (li >= 0 && dist[li] < 0) {
      dist[li] = dist[i] + 1;
      queue[tail++] = li;
    }
  }
  return dist;
}

/** Odd maze dimensions that match the screen shape while keeping roughly the same number of tiles. */
export function pickDims(aw: number, ah: number): { w: number; h: number } {
  const ratio = Math.max(0.45, Math.min(2.2, aw / ah));
  const area = 300;
  const odd = (n: number) => {
    const r = Math.round(n);
    return r % 2 === 0 ? r + 1 : r;
  };
  const w = Math.max(11, Math.min(27, odd(Math.sqrt(area * ratio))));
  const h = Math.max(11, Math.min(27, odd(Math.sqrt(area / ratio))));
  return { w, h };
}
