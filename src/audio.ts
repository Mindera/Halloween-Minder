import { settings } from './progress';

/** Every sound is synthesised with WebAudio, so there are no audio assets to ship. */
export type Sfx =
  | 'shoot'
  | 'flame'
  | 'kick'
  | 'tok'
  | 'pellet'
  | 'hit'
  | 'kill'
  | 'item'
  | 'appear'
  | 'oink'
  | 'burp'
  | 'chirp'
  | 'spice'
  | 'nom'
  | 'bsod'
  | 'slurp'
  | 'candy'
  | 'boing'
  | 'death'
  | 'clear'
  | 'tick'
  | 'spawn'
  | 'warn'
  | 'click'
  | 'party'
  | 'crack'
  | 'crunch'
  | 'warp'
  | 'umbrella'
  | 'firework'
  | 'glitch'
  | 'matrix'
  | 'boss'
  | 'boo'
  | 'fuse'
  | 'boom'
  | 'cry'
  | 'laugh'
  | 'giggle'
  | 'chant'
  | 'chantFast'
  | 'chantSlow'
  | 'turn'
  | 'zap'
  | 'hop'
  | 'fall';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** How long each version of the doll's song lasts: she turns round the moment it ends. */
export const CHANT_TIME = { chant: 3.8, chantFast: 2.3, chantSlow: 5.4 };
/** The doll's sing-song chant, as [note, beats]. */
const CHANT: [number, number][] = [[67, 1], [67, 1], [67, 1.5], [64, 1], [67, 1], [67, 1], [64, 1], [69, 1], [67, 1], [64, 2]];

/** With "no scary sounds" on, these are swapped for gentle ones (or silence). */
const GENTLE: Partial<Record<Sfx, Sfx | null>> = { boo: 'appear', boss: 'item', spawn: null, boom: 'crack', glitch: 'click', death: 'cry', laugh: 'giggle' };

export class SoundBoard {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private noiseBuf?: AudioBuffer;
  private musicTimer?: number;
  private musicStep = 0;
  private musicNext = 0;
  private musicMode: 'spooky' | 'party' = 'spooky';
  private pelletToggle = false;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('hm.muted') === '1';
    } catch {
      /* storage unavailable */
    }
  }

  /** Must be called from a user gesture (iOS refuses to start audio otherwise). */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('hm.muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.2,
    slideTo?: number,
    delay = 0,
    dest?: AudioNode,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, delay = 0, q = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /**
   * A monster's evil "MWA-HA-HA-HA-HA!" (or, with no scary sounds, a little "hee-hee-hee"): a buzzy voice shaped
   * into an "a" (or "ee") by vowel filters, each syllable starting with a breathy "h", with a spooky echo.
   */
  private laugh(gentle: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(this.master);
    if (!gentle) {
      const echo = ctx.createDelay(1);
      echo.delayTime.value = 0.17;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.3;
      out.connect(echo).connect(feedback).connect(echo);
      feedback.connect(this.master);
    }
    const vowel: [number, number, number][] = gentle
      ? [[320, 5, 1], [2300, 9, 0.5]] // "ee"
      : [[750, 5, 1], [1150, 7, 0.7], [2600, 9, 0.25]]; // "a"
    const base = gentle ? 420 : 140;
    let at = 0;
    if (!gentle) {
      // "Mwaaa..." rising and falling.
      this.tone(base * 0.8, 0.1, 'sine', 0.18, base * 0.9, 0, out);
      this.voice(t + 0.06, 0.34, [base * 0.85, base * 1.3, base], vowel, 0.65, out);
      at = 0.46;
    }
    const n = gentle ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const start = at + i * (gentle ? 0.13 : 0.16);
      const f = base * (1.2 - i * (gentle ? 0.04 : 0.07));
      this.noise(0.05, 0.1, gentle ? 3000 : 1600, start, 1.5);
      this.voice(t + start + 0.03, gentle ? 0.09 : 0.12, [f * 1.08, f * 0.9], vowel, gentle ? 1 : 0.6, out);
    }
  }

  /** A sung syllable: a sawtooth sliding through `pitch`, filtered through the vowel's formants [Hz, Q, level]. */
  private voice(t0: number, dur: number, pitch: number[], formants: [number, number, number][], vol: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch[0], t0);
    pitch.slice(1).forEach((f, i) => o.frequency.linearRampToValueAtTime(f, t0 + (dur * (i + 1)) / (pitch.length - 1)));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.025);
    g.gain.setValueAtTime(vol, t0 + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    for (const [freq, q, level] of formants) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = level;
      o.connect(f).connect(fg).connect(g);
    }
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  play(sound: Sfx) {
    if (!this.ctx || this.muted) return;
    const s = settings.noScary && sound in GENTLE ? GENTLE[sound] : sound;
    if (!s) return;
    switch (s) {
      case 'shoot':
        this.tone(320, 0.12, 'sine', 0.25, 900);
        this.tone(900, 0.06, 'triangle', 0.08, 1400, 0.05);
        break;
      case 'kick':
        // A foosball shot: the clack of the little player hitting the ball.
        this.tone(1500, 0.04, 'square', 0.12, 900);
        this.noise(0.06, 0.25, 3200, 0, 3);
        this.tone(220, 0.08, 'triangle', 0.15, 120);
        break;
      case 'tok':
        this.tone(1250, 0.03, 'square', 0.05, 800);
        break;
      case 'flame':
        // Whoosh!
        this.noise(0.3, 0.32, 1100, 0, 0.6);
        this.tone(190, 0.25, 'sawtooth', 0.08, 70);
        break;
      case 'pellet':
        this.pelletToggle = !this.pelletToggle;
        this.tone(this.pelletToggle ? 620 : 740, 0.05, 'triangle', 0.08);
        break;
      case 'hit':
        this.tone(260, 0.08, 'square', 0.12, 140);
        break;
      case 'kill':
        this.noise(0.18, 0.35, 900, 0, 0.8);
        this.tone(500, 0.2, 'sawtooth', 0.12, 80);
        break;
      case 'appear':
        [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.09, 'triangle', 0.12, undefined, i * 0.06));
        break;
      case 'item':
        [0, 7, 12, 16].forEach((n, i) => this.tone(NOTE(72 + n), 0.1, 'square', 0.1, undefined, i * 0.05));
        break;
      case 'oink':
        for (let i = 0; i < 2; i++) {
          this.tone(380, 0.12, 'sawtooth', 0.18, 220, i * 0.18);
          this.noise(0.12, 0.15, 600, i * 0.18, 4);
        }
        break;
      case 'burp':
        this.tone(110, 0.45, 'sawtooth', 0.25, 70);
        this.noise(0.4, 0.25, 200, 0, 2);
        break;
      case 'chirp':
        for (let i = 0; i < 6; i++) this.tone(4200, 0.035, 'sine', 0.12, 4600, i * 0.06 + (i > 2 ? 0.15 : 0));
        break;
      case 'spice':
        this.noise(0.6, 0.3, 1200, 0, 0.5);
        this.tone(200, 0.6, 'sawtooth', 0.12, 1200);
        break;
      case 'nom':
        this.tone(300, 0.08, 'square', 0.15, 200);
        this.tone(300, 0.08, 'square', 0.15, 200, 0.14);
        break;
      case 'bsod':
        this.tone(220, 0.25, 'square', 0.15);
        this.tone(165, 0.4, 'square', 0.15, undefined, 0.25);
        break;
      case 'slurp':
        this.noise(0.35, 0.25, 2500, 0, 6);
        this.tone(400, 0.35, 'sine', 0.1, 900);
        break;
      case 'candy':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone(NOTE(79 + n), 0.07, 'triangle', 0.12, undefined, i * 0.04));
        break;
      case 'boing':
        this.tone(150, 0.3, 'sine', 0.3, 600);
        break;
      case 'death':
        [67, 66, 65, 64].forEach((n, i) => this.tone(NOTE(n - 12), i === 3 ? 0.9 : 0.3, 'sawtooth', 0.18, i === 3 ? NOTE(50) : undefined, i * 0.32));
        break;
      case 'clear':
        [60, 64, 67, 72, 67, 72].forEach((n, i) => this.tone(NOTE(n + 12), 0.14, 'square', 0.12, undefined, i * 0.1));
        break;
      case 'tick':
        this.tone(1400, 0.03, 'square', 0.06);
        break;
      case 'spawn':
        this.tone(90, 0.3, 'sine', 0.15, 60);
        break;
      case 'warn':
        // "Uh-oh": a monster is about to come out.
        this.tone(NOTE(74), 0.12, 'triangle', 0.1);
        this.tone(NOTE(69), 0.2, 'triangle', 0.1, NOTE(67), 0.14);
        break;
      case 'click':
        this.tone(880, 0.04, 'triangle', 0.1);
        break;
      case 'crack':
        this.noise(0.06, 0.3, 1800, 0, 3);
        this.tone(180, 0.06, 'square', 0.1, 120);
        break;
      case 'crunch':
        this.noise(0.3, 0.45, 500, 0, 0.7);
        this.noise(0.15, 0.3, 2200, 0.05, 2);
        this.tone(120, 0.25, 'sawtooth', 0.15, 50);
        break;
      case 'warp':
        this.tone(300, 0.18, 'sine', 0.2, 1400);
        this.tone(1400, 0.22, 'sine', 0.15, 250, 0.16);
        break;
      case 'umbrella':
        this.noise(0.22, 0.3, 900, 0, 1.5);
        this.tone(220, 0.2, 'triangle', 0.12, 440);
        break;
      case 'glitch':
        for (let i = 0; i < 7; i++) this.tone(200 + Math.random() * 1800, 0.04, 'square', 0.1, 100 + Math.random() * 2000, i * 0.05);
        this.noise(0.12, 0.2, 4000, 0.1, 8);
        break;
      case 'matrix':
        [88, 84, 81, 76, 72, 69, 64, 60].forEach((n, i) => this.tone(NOTE(n), 0.08, 'square', 0.08, undefined, i * 0.06));
        this.tone(NOTE(48), 0.8, 'sawtooth', 0.12, NOTE(36), 0.5);
        break;
      case 'boss':
        [[43, 0], [43, 0.35], [39, 0.7]].forEach(([n, t]) => {
          this.tone(NOTE(n), n === 39 ? 1.1 : 0.3, 'sawtooth', 0.22, n === 39 ? NOTE(34) : undefined, t);
          this.tone(NOTE(n + 12), n === 39 ? 1.1 : 0.3, 'square', 0.08, undefined, t);
        });
        break;
      case 'boo':
        this.tone(140, 0.5, 'sawtooth', 0.3, 420);
        this.noise(0.4, 0.4, 700, 0, 1.2);
        this.tone(660, 0.35, 'square', 0.12, 220, 0.12);
        break;
      case 'fuse':
        this.noise(0.5, 0.2, 5000, 0, 3);
        this.tone(1200, 0.08, 'square', 0.06, 900);
        break;
      case 'boom':
        this.noise(0.8, 0.7, 180, 0, 0.5);
        this.noise(0.35, 0.35, 900, 0.02, 0.8);
        this.tone(90, 0.6, 'sine', 0.45, 35);
        break;
      case 'cry':
        [0, 0.28, 0.56].forEach((t, i) => this.tone(520 - i * 40, 0.25, 'triangle', 0.12, 380 - i * 40, t));
        break;
      case 'laugh':
        this.laugh(false);
        break;
      case 'giggle':
        this.laugh(true);
        break;
      case 'chant':
      case 'chantFast':
      case 'chantSlow': {
        const beat = CHANT_TIME[s] / CHANT.reduce((sum, [, b]) => sum + b, 0);
        CHANT.reduce((t, [n, b]) => {
          this.tone(NOTE(n + 5), b * beat * 0.85, 'triangle', 0.2, NOTE(n + 5) * 0.99, t);
          this.tone(NOTE(n + 17), b * beat * 0.5, 'sine', 0.05, undefined, t);
          return t + b * beat;
        }, 0);
        break;
      }
      case 'turn':
        // The doll's head creaking round, then her eyes switching on.
        this.noise(0.65, 0.18, 1400, 0, 5);
        this.tone(140, 0.65, 'sawtooth', 0.07, 110);
        this.tone(NOTE(88), 0.12, 'square', 0.08, undefined, 0.72);
        this.tone(NOTE(81), 0.2, 'square', 0.08, undefined, 0.84);
        break;
      case 'zap':
        this.tone(1800, 0.4, 'sawtooth', 0.14, 160);
        this.noise(0.3, 0.3, 3200, 0, 2);
        break;
      case 'hop':
        this.tone(240, 0.12, 'triangle', 0.16, 640);
        break;
      case 'fall':
        // A cartoon whistle all the way down.
        this.tone(1300, 0.9, 'sine', 0.12, 180);
        break;
      case 'firework':
        this.tone(900, 0.7, 'sine', 0.06, 2600);
        this.noise(0.6, 0.35, 300, 0.9, 0.6);
        this.noise(0.4, 0.2, 3000, 0.95, 1);
        break;
      case 'party':
        // "Happy Birthday" (public-domain melody).
        [
          [67, 0.75], [67, 0.25], [69, 1], [67, 1], [72, 1], [71, 2],
          [67, 0.75], [67, 0.25], [69, 1], [67, 1], [74, 1], [72, 2],
          [67, 0.75], [67, 0.25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
          [77, 0.75], [77, 0.25], [76, 1], [72, 1], [74, 1], [72, 2],
        ].reduce((t, [n, beats]) => {
          this.tone(NOTE(n), beats * 0.28, 'triangle', 0.14, undefined, t);
          return t + beats * 0.3;
        }, 0);
        break;
    }
  }

  startMusic(mode: 'spooky' | 'party') {
    this.stopMusic();
    if (!this.ctx) return;
    this.musicMode = mode;
    this.musicStep = 0;
    this.musicNext = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  stopMusic() {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const spooky = this.musicMode === 'spooky';
    const stepDur = spooky ? 0.2 : 0.16;
    // Spooky: D minor walking bass with a wobbly "theremin". Party: bouncy major arpeggio.
    const bass = spooky ? [50, 50, 57, 50, 58, 50, 57, 53] : [60, 67, 64, 67, 65, 69, 67, 71];
    const lead = spooky
      ? [74, -1, -1, 77, -1, 76, -1, 74, 73, -1, -1, -1, 74, -1, 70, -1]
      : [72, 76, 79, 76, 77, 81, 79, 76, 72, 76, 79, 84, 83, 79, 77, 74];
    while (this.musicNext < ctx.currentTime + 0.25) {
      const s = this.musicStep++;
      const delay = Math.max(0, this.musicNext - ctx.currentTime);
      if (!this.muted) {
        if (s % 2 === 0) this.tone(NOTE(bass[(s / 2) % bass.length] - 12), stepDur * 1.6, 'triangle', 0.5, undefined, delay, this.musicGain);
        const n = lead[s % lead.length];
        if (n > 0) {
          this.tone(NOTE(n), stepDur * (spooky ? 2.5 : 0.9), spooky ? 'sine' : 'square', spooky ? 0.25 : 0.12, spooky ? NOTE(n) * 0.985 : undefined, delay, this.musicGain);
        }
      }
      this.musicNext += stepDur;
    }
  }
}

export const audio = new SoundBoard();
