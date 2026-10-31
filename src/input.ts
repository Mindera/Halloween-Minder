/** One player's controls. */
export class Pad {
  /** Buffered direction: applied at the next junction where it fits. */
  dir = -1;
  fireHeld = false;
  /** Running counts of steers and presses, sent to the host in a networked game (a single one can't get lost that way). */
  turns = 0;
  shots = 0;
  drops = 0;
  private firePressed = false;
  private bombPressed = false;

  /** A direction from the player (each one counts, even the same again: the doll sees it). */
  steer(d: number) {
    this.dir = d;
    this.turns++;
  }

  pressFire() {
    this.firePressed = true;
    this.fireHeld = true;
    this.shots++;
  }

  pressBomb() {
    this.bombPressed = true;
    this.drops++;
  }

  /** A single shot without holding (tap on the maze). */
  tapFire() {
    this.firePressed = true;
    this.shots++;
  }

  /** True once per press, and continuously while held (the game's cooldown paces auto-fire). */
  consumeFire(): boolean {
    const f = this.firePressed || this.fireHeld;
    this.firePressed = false;
    return f;
  }

  consumeBomb(): boolean {
    const b = this.bombPressed;
    this.bombPressed = false;
    return b;
  }

  reset() {
    this.dir = -1;
    this.fireHeld = false;
    this.firePressed = false;
    this.bombPressed = false;
  }
}

interface KeyMap {
  dirs: Record<string, number>;
  fire: Set<string>;
  bomb: Set<string>;
}

const WASD = { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 };
const ARROWS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };

/** Single player: every key drives player 1. */
const SOLO: KeyMap = {
  dirs: { ...WASD, ...ARROWS },
  fire: new Set(['Space', 'Enter', 'KeyJ', 'KeyK', 'KeyX', 'KeyZ']),
  bomb: new Set(['KeyB', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight']),
};
/** Co-op on one keyboard: P1 on WASD + Space/E, P2 on arrows + Enter/right Shift. */
const COOP: KeyMap[] = [
  { dirs: WASD, fire: new Set(['Space', 'KeyF']), bomb: new Set(['KeyE', 'KeyQ', 'ShiftLeft']) },
  { dirs: ARROWS, fire: new Set(['Enter', 'NumpadEnter', 'KeyL', 'Numpad0']), bomb: new Set(['ShiftRight', 'Slash', 'KeyK']) },
];

/** Pointer capture keeps a slide on the pad tracked; it can throw for pointers that already ended. */
function capture(el: HTMLElement, id: number) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* ignore */
  }
}

export interface PadElements {
  dpad: HTMLElement;
  fire: HTMLElement;
  bomb: HTMLElement;
}

export class Input {
  pads = [new Pad(), new Pad()];
  coop = false;
  enabled = false;
  onPause?: () => void;
  onMute?: () => void;

  constructor(stage: HTMLElement, touch: PadElements[]) {
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.pads.forEach((p) => (p.fireHeld = false)));
    touch.forEach((els, i) => {
      this.bindDpad(els.dpad, i);
      this.bindFire(els.fire, i);
      this.bindBomb(els.bomb, i);
    });
    this.bindSwipe(stage);
  }

  reset() {
    this.pads.forEach((p) => p.reset());
  }

  private key(e: KeyboardEvent, down: boolean) {
    if (down && (e.code === 'KeyP' || e.code === 'Escape')) {
      this.onPause?.();
      return;
    }
    if (down && e.code === 'KeyM') {
      this.onMute?.();
      return;
    }
    if (!this.enabled) return;
    const maps = this.coop ? COOP : [SOLO];
    maps.forEach((map, i) => {
      const pad = this.pads[i];
      if (e.code in map.dirs) {
        if (down) pad.steer(map.dirs[e.code]);
        e.preventDefault();
      } else if (map.fire.has(e.code)) {
        if (down && !e.repeat) pad.pressFire();
        if (!down) pad.fireHeld = false;
        e.preventDefault();
      } else if (map.bomb.has(e.code)) {
        if (down && !e.repeat) pad.pressBomb();
        e.preventDefault();
      }
    });
  }

  private bindDpad(el: HTMLElement, i: number) {
    let active: number | null = null;
    const update = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.12) return;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      if (this.enabled) this.pads[i].steer(d);
      el.dataset.dir = String(d);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active = e.pointerId;
      capture(el, e.pointerId);
      update(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === active) update(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = null;
      delete el.dataset.dir;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private bindFire(el: HTMLElement, i: number) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(el, e.pointerId);
      el.classList.add('down');
      if (this.enabled) this.pads[i].pressFire();
    });
    const end = () => {
      el.classList.remove('down');
      this.pads[i].fireHeld = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private bindBomb(el: HTMLElement, i: number) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('down');
      if (this.enabled) this.pads[i].pressBomb();
    });
    const end = () => el.classList.remove('down');
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Swipe on the maze to steer, tap it to shoot (single player only, handy on tablets). */
  private bindSwipe(stage: HTMLElement) {
    let sx = 0;
    let sy = 0;
    let moved = 0;
    let t0 = 0;
    let id: number | null = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.coop) return;
      id = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      moved = 0;
      t0 = performance.now();
    });
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || !this.enabled) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      const dist = Math.hypot(dx, dy);
      if (dist < 22) return;
      moved += dist;
      this.pads[0].steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      sx = e.clientX;
      sy = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      if (this.enabled && moved === 0 && performance.now() - t0 < 300) this.pads[0].tapFire();
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', () => (id = null));
  }
}
