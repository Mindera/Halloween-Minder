import { settings } from './progress';

/** Every sound is synthesised with WebAudio, so there are no audio assets to ship. */
export type Sfx =
  | 'shoot'
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

/**
 * The in-game music: an original Halloween dance in D minor, 16 bars of 8 eighth notes (about 24 s a loop).
 * Bars 1-8 creep about on a theremin over harpsichord, church organ and plucked bass; bars 9-16 are the
 * skeletons' dance on xylophone "bones" and bassoon. A midnight bell tolls at the top of each loop.
 * Each bar is its chord plus the tune as [note, eighths] (-1 is a rest).
 *
 * `light` is the same tune, lighter and a little faster, for the title screen's secret climb: a music box
 * instead of the theremin, soft plucks and a sparse harpsichord, and no organ, bell, wind or bassoon.
 */
export type MusicMode = 'spooky' | 'light' | 'party';
const STEP: Record<MusicMode, number> = { spooky: 0.19, light: 0.165, party: 0.16 };
/** Music volume per tune: the Halloween dance has more going on, so it sits a little lower under the effects. */
export const MUSIC_LEVEL: Record<MusicMode, number> = { spooky: 0.15, light: 0.21, party: 0.22 };
const CHORDS = {
  Dm: { root: 50, notes: [62, 65, 69] },
  Gm: { root: 43, notes: [62, 67, 70] },
  Bb: { root: 46, notes: [62, 65, 70] },
  A: { root: 45, notes: [61, 64, 69] },
  A7: { root: 45, notes: [61, 64, 67] },
};
const SONG: { c: keyof typeof CHORDS; m: [number, number][] }[] = [
  // Creeping up the stairs (theremin).
  { c: 'Dm', m: [[74, 2], [69, 1], [74, 1], [77, 2], [76, 1], [74, 1]] },
  { c: 'Dm', m: [[73, 2], [74, 1], [76, 1], [69, 4]] },
  { c: 'Bb', m: [[77, 2], [74, 1], [70, 1], [68, 2], [69, 2]] },
  { c: 'A7', m: [[76, 1], [77, 1], [76, 1], [74, 1], [73, 4]] },
  { c: 'Dm', m: [[74, 2], [69, 1], [74, 1], [77, 2], [81, 2]] },
  { c: 'Gm', m: [[79, 2], [70, 1], [74, 1], [79, 1], [77, 1], [76, 2]] },
  { c: 'A7', m: [[77, 1], [76, 1], [74, 1], [73, 1], [76, 1], [74, 1], [73, 1], [69, 1]] },
  { c: 'Dm', m: [[74, 3], [-1, 1], [69, 1], [70, 1], [71, 1], [72, 1]] },
  // The skeletons dance (xylophone bones).
  { c: 'Gm', m: [[74, 1], [-1, 1], [74, 1], [-1, 1], [70, 1], [72, 1], [74, 2]] },
  { c: 'Dm', m: [[69, 1], [-1, 1], [69, 1], [-1, 1], [65, 1], [67, 1], [69, 2]] },
  { c: 'Gm', m: [[74, 1], [-1, 1], [74, 1], [-1, 1], [79, 1], [77, 1], [75, 2]] },
  { c: 'A', m: [[74, 1], [73, 1], [-1, 1], [76, 1], [69, 4]] },
  { c: 'Bb', m: [[77, 1], [-1, 1], [77, 1], [-1, 1], [74, 1], [76, 1], [77, 2]] },
  { c: 'Gm', m: [[79, 1], [77, 1], [76, 1], [74, 1], [70, 2], [67, 2]] },
  { c: 'A7', m: [[69, 1], [73, 1], [76, 1], [79, 1], [82, 2], [81, 2]] },
  { c: 'A7', m: [[76, 1], [77, 1], [76, 1], [73, 1], [69, 2], [-1, 2]] },
];

interface Voice {
  type?: OscillatorType;
  /** Seconds to reach full volume. */
  attack?: number;
  /** Fraction of the note held at full volume before fading (0 = fade straight away, like a pluck). */
  hold?: number;
  /** Lowpass filter cutoff in Hz. */
  filter?: number;
  /** Vibrato depth in cents. */
  vibrato?: number;
  /** Slide up or down from this frequency. */
  from?: number;
}

/** With "no scary sounds" on, these are swapped for gentle ones (or silence). */
const GENTLE: Partial<Record<Sfx, Sfx | null>> = { boo: 'appear', boss: 'item', spawn: null, boom: 'crack', glitch: 'click', death: 'cry' };

export class SoundBoard {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private noiseBuf?: AudioBuffer;
  private musicTimer?: number;
  private musicStep = 0;
  private musicNext = 0;
  private musicMode: MusicMode = 'spooky';
  /** Last theremin note, so the next one can glide from it. */
  private glide = 0;
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

  play(sound: Sfx) {
    if (!this.ctx || this.muted) return;
    const s = settings.noScary && sound in GENTLE ? GENTLE[sound] : sound;
    if (!s) return;
    switch (s) {
      case 'shoot':
        this.tone(320, 0.12, 'sine', 0.25, 900);
        this.tone(900, 0.06, 'triangle', 0.08, 1400, 0.05);
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

  startMusic(mode: MusicMode) {
    this.stopMusic();
    if (!this.ctx) return;
    this.musicMode = mode;
    this.musicStep = 0;
    this.glide = 0;
    this.musicNext = this.ctx.currentTime + 0.1;
    this.musicGain?.gain.setValueAtTime(MUSIC_LEVEL[mode], this.ctx.currentTime);
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  stopMusic() {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
  }

  /** Schedules the notes due in the next `horizon` seconds (the timer calls it every 50 ms). */
  private scheduleMusic(horizon = 0.25) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const mode = this.musicMode;
    const stepDur = STEP[mode];
    while (this.musicNext < ctx.currentTime + horizon) {
      const s = this.musicStep++;
      const t = Math.max(ctx.currentTime, this.musicNext);
      if (!this.muted) {
        if (mode === 'party') this.partyStep(s, t - ctx.currentTime, stepDur);
        else this.halloweenStep(s, t, mode === 'light');
      }
      this.musicNext += stepDur;
    }
  }

  /** Level 12's bouncy major arpeggio. */
  private partyStep(s: number, delay: number, stepDur: number) {
    const bass = [60, 67, 64, 67, 65, 69, 67, 71];
    const lead = [72, 76, 79, 76, 77, 81, 79, 76, 72, 76, 79, 84, 83, 79, 77, 74];
    if (s % 2 === 0) this.tone(NOTE(bass[(s / 2) % bass.length] - 12), stepDur * 1.6, 'triangle', 0.5, undefined, delay, this.musicGain);
    this.tone(NOTE(lead[s % lead.length]), stepDur * 0.9, 'square', 0.12, undefined, delay, this.musicGain);
  }

  /** One eighth note of the Halloween dance (see SONG), starting at time `t`; `light` for the climb's version. */
  private halloweenStep(s: number, t: number, light: boolean) {
    const d = STEP[light ? 'light' : 'spooky'];
    const bar = Math.floor(s / 8) % SONG.length;
    const step = s % 8;
    const { c, m } = SONG[bar];
    const chord = CHORDS[c];
    const next = CHORDS[SONG[(bar + 1) % SONG.length].c];
    const dance = bar >= 8;

    // The tune.
    let at = 0;
    for (const [n, len] of m) {
      if (at === step) {
        if (n < 0) this.glide = 0;
        else if (dance) {
          this.xylophone(NOTE(n + 12), t);
          if (!light) this.voice(NOTE(n - 12), t, len * d * 0.85, 0.1, { type: 'square', filter: 700, attack: 0.02, hold: 0.6 });
        } else if (light) this.musicBox(NOTE(n + 12), t, len * d);
        else {
          const f = NOTE(n);
          this.voice(f, t, len * d * 0.97, 0.26, { attack: 0.05, hold: 0.8, vibrato: 30, from: this.glide || undefined });
          this.glide = f;
        }
      }
      at += len;
    }

    // Plucked bass on the beat, walking up a semitone into the next chord.
    const pluck = light ? 0.3 : 0.45;
    if (step === 0) this.pizz(NOTE(chord.root), t, pluck);
    if (step === 4) this.pizz(NOTE(chord.root - 5), t, pluck);
    if (step === 6) this.pizz(NOTE(next.root - 1), t, pluck);
    // Harpsichord on the off-beats (crisper while the skeletons dance; just a light tick in the climb).
    if (step === 2 || step === 6) {
      for (const n of light ? chord.notes.slice(1) : chord.notes) {
        this.voice(NOTE(n + (light ? 12 : 0)), t, dance || light ? 0.12 : 0.26, light ? 0.03 : 0.05, { type: 'sawtooth', filter: light ? 3200 : 2600 });
      }
    }
    if (light) {
      if (bar === 15 && step === 6) this.ghostly(t);
      return;
    }
    // A soft church organ under the theremin.
    if (step === 0 && !dance) {
      for (const n of chord.notes) {
        [1, 2, 3].forEach((h, i) => this.voice(NOTE(n) * h, t, d * 8, [0.035, 0.016, 0.008][i], { attack: 0.08, hold: 0.85 }));
      }
    }
    // The midnight bell, the wind and a passing ghost.
    if (bar === 0 && step === 0) this.bell(NOTE(62), t);
    if ((bar === 0 || bar === 8) && step === 0) this.wind(t, d * 16);
    if (bar === 15 && step === 6) this.ghostly(t);
  }

  /** A music note at absolute time `t`. */
  private voice(f: number, t: number, dur: number, vol: number, o: Voice = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    if (o.from) {
      osc.frequency.setValueAtTime(o.from, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.08, dur * 0.4));
    } else osc.frequency.setValueAtTime(f, t);
    const a = o.attack ?? 0.004;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    if (o.hold) g.gain.setValueAtTime(vol, t + Math.max(a, dur * o.hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur));
    let out: AudioNode = osc;
    if (o.filter) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.filter;
      out = out.connect(lp);
    }
    out.connect(g).connect(this.musicGain);
    if (o.vibrato) {
      // Vibrato that creeps in, like a theremin player's hand.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.6;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(o.vibrato, t + Math.min(0.3, dur * 0.6));
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private pizz(f: number, t: number, vol = 0.45) {
    this.voice(f, t, 0.4, vol, { type: 'triangle' });
    this.voice(f * 2, t, 0.09, vol * 0.13, { type: 'square', filter: 1400 });
  }

  /** A music box: a bright ping that rings on, with quick shimmering overtones. */
  private musicBox(f: number, t: number, dur: number) {
    const ring = Math.max(0.5, dur * 1.6);
    this.voice(f, t, ring, 0.2);
    this.voice(f * 2, t, ring * 0.5, 0.06);
    this.voice(f * 3.01, t, 0.12, 0.035);
  }

  /** Bones: a wooden tok with a bright overtone and a click. */
  private xylophone(f: number, t: number) {
    this.voice(f, t, 0.24, 0.3);
    this.voice(f * 3.93, t, 0.06, 0.06);
    this.musicNoise(t, 0.025, 0.12, 3500, 3500);
  }

  /** A church bell: inharmonic partials that ring out at different rates. */
  private bell(f: number, t: number) {
    for (const [k, vol, dur] of [
      [0.5, 0.18, 3.2],
      [1, 0.26, 2.6],
      [2, 0.1, 1.8],
      [2.4, 0.08, 1.4],
      [3, 0.06, 1.1],
      [4.2, 0.05, 0.8],
      [5.4, 0.035, 0.6],
    ]) {
      this.voice(f * k, t, dur, vol);
    }
  }

  /** "Woooo": a ghost floats past. */
  private ghostly(t: number) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(840, t + 0.3);
    osc.frequency.exponentialRampToValueAtTime(560, t + 0.75);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    osc.connect(g).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.85);
  }

  /** A gust of wind rising and falling. */
  private wind(t: number, dur: number) {
    this.musicNoise(t, dur, 0.09, 350, 1100, true);
  }

  /** Filtered noise for the music; `swell` fades in and out and sweeps the filter up and back. */
  private musicNoise(t: number, dur: number, vol: number, from: number, to: number, swell = false) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = swell ? 2.5 : 4;
    f.frequency.setValueAtTime(from, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    if (swell) {
      f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.5);
      f.frequency.exponentialRampToValueAtTime(from, t + dur);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
    } else g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.musicGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new SoundBoard();
