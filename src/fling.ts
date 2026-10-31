/**
 * The title-screen Minder can be grabbed, dragged and thrown. A spring pulls it back to where it started
 * (its "centre of gravity"), so it always falls home, wobbling and bouncing off the screen edges on the way.
 */

const SPRING = 45; // pull towards home (1/s²)
const DAMPING = 4.2; // velocity loss (1/s): a few wobbles before it settles
const BOUNCE = 0.7; // energy kept when hitting a screen edge
const MAX_SPEED = 4500; // px/s

export interface FlingOptions {
  /** Called when it hits a screen edge hard (for a sound or a buzz), with the impact speed in px/s. */
  onBounce?: (speed: number) => void;
  /** Called when it is let go after a real pull or flick (not just a tap). */
  onThrow?: () => void;
  /** Called when it has sprung back and settled in its spot (not when `reset()` drops it there). */
  onHome?: () => void;
}

export class Flingable {
  private floater: HTMLImageElement | null = null;
  private pointer: number | null = null;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private angle = 0;
  private spin = 0;
  private squash = 0;
  /** Squashed sideways (hit a side wall) or flat (hit the top or bottom). */
  private squashX = false;
  private grabX = 0;
  private grabY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private frame = 0;
  private prev = 0;

  constructor(
    private img: HTMLImageElement,
    private opts: FlingOptions = {},
  ) {
    img.draggable = false;
    img.addEventListener('pointerdown', (e) => this.grab(e));
  }

  /** Drop it back home immediately (e.g. when leaving the title screen). */
  reset() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pointer = null;
    this.floater?.remove();
    this.floater = null;
    this.img.classList.remove('flung');
  }

  /** Where it rests: the centre of the original image (its bob animation is paused while it flies). */
  private home() {
    const r = this.img.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: this.img.offsetWidth, h: this.img.offsetHeight };
  }

  private grab(e: PointerEvent) {
    e.preventDefault();
    if (!this.floater) {
      // Fly a copy in a fixed layer so it can leave the panel; the original keeps its place in the layout.
      const h = this.home();
      if (!h.w) return;
      // Start from wherever the bob animation had it, so the grab doesn't jump.
      const tf = getComputedStyle(this.img).transform;
      const m = new DOMMatrix(tf === 'none' ? undefined : tf);
      const f = this.img.cloneNode() as HTMLImageElement;
      f.removeAttribute('id');
      f.className = 'minder-floater';
      f.style.width = `${h.w}px`;
      f.style.height = `${h.h}px`;
      f.addEventListener('pointerdown', (ev) => this.grab(ev));
      document.body.appendChild(f);
      this.floater = f;
      this.x = h.x;
      this.y = h.y;
      this.vx = this.vy = this.spin = this.squash = 0;
      this.angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
      this.img.classList.add('flung');
    }
    const f = this.floater;
    try {
      f.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.pointer = e.pointerId;
    this.grabX = e.clientX - this.x;
    this.grabY = e.clientY - this.y;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lastT = performance.now();
    f.classList.add('grabbed');
    f.onpointermove = (ev) => this.drag(ev);
    f.onpointerup = f.onpointercancel = (ev) => this.release(ev);
    this.loop();
  }

  private drag(e: PointerEvent) {
    if (e.pointerId !== this.pointer) return;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastT) / 1000;
    // Smoothed pointer velocity, so a flick turns into a throw.
    this.vx = this.vx * 0.4 + ((e.clientX - this.lastX) / dt) * 0.6;
    this.vy = this.vy * 0.4 + ((e.clientY - this.lastY) / dt) * 0.6;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lastT = now;
    const h = this.home();
    this.x = Math.max(h.w / 2, Math.min(window.innerWidth - h.w / 2, e.clientX - this.grabX));
    this.y = Math.max(h.h / 2, Math.min(window.innerHeight - h.h / 2, e.clientY - this.grabY));
    this.angle = Math.max(-25, Math.min(25, this.vx * 0.02));
  }

  private release(e: PointerEvent) {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.floater?.classList.remove('grabbed');
    // A pointer that stopped before letting go shouldn't keep its old speed.
    if (performance.now() - this.lastT > 80) this.vx = this.vy = 0;
    const speed = Math.hypot(this.vx, this.vy);
    const h = this.home();
    if (Math.hypot(this.x - h.x, this.y - h.y) > h.w * 0.35 || speed > 700) this.opts.onThrow?.();
    if (speed > MAX_SPEED) {
      this.vx *= MAX_SPEED / speed;
      this.vy *= MAX_SPEED / speed;
    }
    this.spin = this.vx * 0.25;
  }

  private loop() {
    if (this.frame) return;
    this.prev = performance.now();
    const step = (now: number) => {
      const dt = Math.min(1 / 30, (now - this.prev) / 1000);
      this.prev = now;
      if (this.pointer === null) this.physics(dt);
      this.draw();
      const flying = !!this.floater && this.img.offsetWidth > 0;
      if (flying && !this.settled()) {
        this.frame = requestAnimationFrame(step);
        return;
      }
      this.reset();
      if (flying) this.opts.onHome?.();
    };
    this.frame = requestAnimationFrame(step);
  }

  private physics(dt: number) {
    const h = this.home();
    const sub = 4;
    const d = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.vx += (-SPRING * (this.x - h.x) - DAMPING * this.vx) * d;
      this.vy += (-SPRING * (this.y - h.y) - DAMPING * this.vy) * d;
      this.x += this.vx * d;
      this.y += this.vy * d;
      // Bounce off the screen edges.
      const hw = h.w / 2;
      const hh = h.h / 2;
      const W = window.innerWidth;
      const H = window.innerHeight;
      let hitX = 0;
      let hitY = 0;
      if ((this.x < hw && this.vx < 0) || (this.x > W - hw && this.vx > 0)) {
        this.x = Math.max(hw, Math.min(W - hw, this.x));
        hitX = Math.abs(this.vx);
        this.vx = -this.vx * BOUNCE;
      }
      if ((this.y < hh && this.vy < 0) || (this.y > H - hh && this.vy > 0)) {
        this.y = Math.max(hh, Math.min(H - hh, this.y));
        hitY = Math.abs(this.vy);
        this.vy = -this.vy * BOUNCE;
      }
      const hit = Math.max(hitX, hitY);
      if (hit > 250) {
        this.squash = Math.min(1, hit / 1500);
        this.squashX = hitX > hitY;
        this.spin += (Math.random() - 0.5) * hit * 0.2;
        this.opts.onBounce?.(hit);
      }
    }
    // Spin settles back upright.
    this.spin += (-this.angle * 30 - this.spin * 4) * dt;
    this.angle += this.spin * dt;
    this.squash = Math.max(0, this.squash - dt * 5);
  }

  private settled() {
    if (this.pointer !== null) return false;
    const h = this.home();
    return Math.hypot(this.x - h.x, this.y - h.y) < 1 && Math.hypot(this.vx, this.vy) < 12 && Math.abs(this.angle) < 1 && Math.abs(this.spin) < 8;
  }

  private draw() {
    const f = this.floater;
    if (!f) return;
    const h = this.home();
    // Flatten against the wall it hit, bulging the other way.
    const s = 1 - this.squash * 0.25;
    const [sx, sy] = this.squashX ? [s, 2 - s] : [2 - s, s];
    f.style.transform = `translate(${this.x - h.w / 2}px, ${this.y - h.h / 2}px) rotate(${this.angle}deg) scale(${sx}, ${sy})`;
  }
}
