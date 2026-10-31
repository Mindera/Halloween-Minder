const KEY_DIRS: Record<string, number> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
};
const FIRE_KEYS = new Set(['Space', 'Enter', 'KeyJ', 'KeyK', 'KeyX', 'KeyZ']);

export class Input {
  /** Buffered direction: applied at the next junction where it fits. */
  dir = -1;
  fireHeld = false;
  private firePressed = false;
  private heldKeys = new Set<string>();
  onPause?: () => void;
  onMute?: () => void;
  enabled = false;

  constructor(stage: HTMLElement, dpad: HTMLElement, fire: HTMLElement) {
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => {
      this.fireHeld = false;
      this.heldKeys.clear();
    });
    this.bindDpad(dpad);
    this.bindFire(fire);
    this.bindSwipe(stage);
  }

  /** True once per press (plus continuous auto-fire while held, handled by the game's cooldown). */
  consumeFire(): boolean {
    const f = this.firePressed || this.fireHeld;
    this.firePressed = false;
    return f;
  }

  reset() {
    this.dir = -1;
    this.fireHeld = false;
    this.firePressed = false;
  }

  private keyDown(e: KeyboardEvent) {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      this.onPause?.();
      return;
    }
    if (e.code === 'KeyM') {
      this.onMute?.();
      return;
    }
    if (!this.enabled) return;
    if (e.code in KEY_DIRS) {
      this.dir = KEY_DIRS[e.code];
      this.heldKeys.add(e.code);
      e.preventDefault();
    } else if (FIRE_KEYS.has(e.code)) {
      if (!e.repeat) this.firePressed = true;
      this.fireHeld = true;
      e.preventDefault();
    }
  }

  private keyUp(e: KeyboardEvent) {
    this.heldKeys.delete(e.code);
    if (FIRE_KEYS.has(e.code)) this.fireHeld = false;
  }

  private bindDpad(pad: HTMLElement) {
    let active: number | null = null;
    const update = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.12) return;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      if (this.enabled) this.dir = d;
      pad.dataset.dir = String(d);
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      update(e);
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === active) update(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = null;
      delete pad.dataset.dir;
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  private bindFire(btn: HTMLElement) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add('down');
      if (!this.enabled) return;
      this.firePressed = true;
      this.fireHeld = true;
    });
    const end = () => {
      btn.classList.remove('down');
      this.fireHeld = false;
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
  }

  /** Swipe on the maze to steer, tap it to shoot (handy on tablets). */
  private bindSwipe(stage: HTMLElement) {
    let sx = 0;
    let sy = 0;
    let moved = 0;
    let t0 = 0;
    let id: number | null = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
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
      this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      sx = e.clientX;
      sy = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      if (this.enabled && moved === 0 && performance.now() - t0 < 300) this.firePressed = true;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', () => (id = null));
  }
}
