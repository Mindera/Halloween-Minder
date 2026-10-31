import './style.css';
import { audio } from './audio';
import { ANNIVERSARY_LEVEL, ENEMIES, ITEMS, LEVEL_QUIPS, LEVEL_TIME, MINDERS, THEME_NAMES, themeFor, type EnemyKind, type ItemKind, type MinderDef } from './config';
import { Game } from './game';
import { Input } from './input';
import { pickDims } from './maze';
import { Renderer, type Rect } from './render';
import { buildCard, fallbackLinks, shareScore, type ShareInfo } from './share';
import { ITEM_ART, MONSTER_ART, bake, drawGooglyEye } from './sprites';
import { highScore, loadMinder, loadScores, saveMinder, saveScore } from './storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const minderSrc = (id: string) => `${import.meta.env.BASE_URL}minders/${id}.png`;
const isTouch = () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const SCREENS = ['screen-title', 'screen-select', 'screen-help', 'screen-scores', 'screen-pause', 'screen-over'];

type State = 'menu' | 'playing' | 'paused' | 'over';

const ITEM_HELP: Record<ItemKind, string> = {
  cricket: 'Chirp chirp! Monsters near you go bonkers and pop.',
  spice: 'You turn red hot and run super fast.',
  pig: 'You get FAT. Slower, but monsters bounce off your belly!',
  eclair: 'Every monster gets fat and slow. Easy target!',
  beer: 'Root beer! The screen gets wobbly and blurry. Hic!',
  computer: 'Blue Screen of Death! Monsters freeze — touch them to delete.',
  coffee: 'Rapid-fire eyeballs!',
  roach: 'Ups, we found a bug! The game glitches and the controls get mixed up.',
  rabbit: 'It runs away! Catch it to enter the Matrix.',
  candy: '+1000 sweet points.',
  cake: 'Only at the level 12 party. +1200!',
};

class App {
  private appEl = $('app');
  private stage = $('stage');
  private canvas = $<HTMLCanvasElement>('game');
  private renderer = new Renderer(this.canvas);
  private input = new Input(this.stage, $('dpad'), $('fire'));
  private game: Game;
  private state: State = 'menu';
  private minder: MinderDef;
  private minderImg = new Image();
  private field: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private last = 0;
  private hud = new Map<string, string>();
  private toastTimer = 0;
  private bannerTimer = 0;
  private partyTimer = 0;
  private effectKey = '';
  private glitchy = false;
  private card: Blob | null = null;
  private cardUrl = '';
  private shareInfo?: ShareInfo;
  private wakeLock: { release(): Promise<void> } | null = null;
  private iconCache = new Map<string, HTMLCanvasElement>();

  constructor() {
    this.game = new Game(
      this.input,
      {
        toast: (t, c) => this.toast(t, c),
        levelIntro: (l) => this.onLevelIntro(l),
        levelClear: (l, b) => this.onLevelClear(l, b),
        gameOver: (r) => this.onGameOver(r, false),
        victory: () => this.onGameOver('You beat all 100 levels. The monsters surrender!', true),
      },
      () => pickDims(this.field.w, this.field.h),
    );
    const saved = loadMinder();
    this.minder = MINDERS.find((m) => m.id === saved) ?? MINDERS[0];
    this.setMinder(this.minder);

    this.input.onPause = () => (this.state === 'playing' ? this.pause() : this.state === 'paused' ? this.resume() : undefined);
    this.input.onMute = () => this.toggleMute();
    this.bindUi();
    this.buildMinderGrid();
    this.buildLegends();
    this.buildFloaters();
    this.refreshTitle();
    this.layout();
    this.show('screen-title');

    window.addEventListener('resize', () => this.layout());
    window.visualViewport?.addEventListener('resize', () => this.layout());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------ screens

  private show(id: string | null) {
    for (const s of SCREENS) $(s).hidden = s !== id;
  }

  private bindUi() {
    const click = (id: string, fn: () => void) =>
      $(id).addEventListener('click', () => {
        audio.unlock();
        audio.play('click');
        fn();
      });
    click('btn-play', () => this.show('screen-select'));
    click('btn-help', () => this.show('screen-help'));
    click('btn-scores', () => {
      this.buildScores();
      this.show('screen-scores');
    });
    click('btn-go', () => this.startGame());
    click('btn-pause', () => this.pause());
    click('btn-resume', () => this.resume());
    click('btn-quit', () => this.toMenu());
    click('btn-again', () => this.startGame());
    click('btn-change', () => this.show('screen-select'));
    click('btn-share', () => void this.share());
    click('btn-mute', () => this.toggleMute());
    click('share-copy', () => {
      if (!this.shareInfo) return;
      void navigator.clipboard?.writeText(fallbackLinks(this.shareInfo).copy).then(() => this.toast('Copied! Paste it anywhere.', '#69f0ae'));
    });
    document.querySelectorAll<HTMLElement>('[data-back]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.play('click');
        this.refreshTitle();
        this.show('screen-title');
      }),
    );
    this.updateMuteIcon();
  }

  private toggleMute() {
    audio.unlock();
    audio.setMuted(!audio.muted);
    this.updateMuteIcon();
  }

  private updateMuteIcon() {
    $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
  }

  private setMinder(m: MinderDef) {
    this.minder = m;
    saveMinder(m.id);
    const img = new Image();
    img.onload = () => this.renderer.setMinder(img, m.iris);
    img.src = minderSrc(m.id);
    this.minderImg = img;
  }

  private refreshTitle() {
    $<HTMLImageElement>('title-minder').src = minderSrc(this.minder.id);
    $('title-best').textContent = highScore().toLocaleString('en-US');
  }

  private buildMinderGrid() {
    const grid = $('minder-grid');
    grid.innerHTML = '';
    for (const m of MINDERS) {
      const card = document.createElement('button');
      card.className = 'minder-card';
      card.type = 'button';
      card.dataset.id = m.id;
      card.innerHTML = `<img src="${minderSrc(m.id)}" alt="" loading="lazy" /><b>${m.name}</b><small>${m.tagline}</small>`;
      card.classList.toggle('selected', m.id === this.minder.id);
      card.addEventListener('click', () => {
        audio.unlock();
        audio.play('click');
        this.setMinder(m);
        grid.querySelectorAll('.minder-card').forEach((c) => c.classList.toggle('selected', c === card));
      });
      card.addEventListener('dblclick', () => this.startGame());
      grid.appendChild(card);
    }
  }

  private icon(key: string, draw: (g: CanvasRenderingContext2D) => void, px: number): HTMLCanvasElement {
    const k = `${key}@${px}`;
    let c = this.iconCache.get(k);
    if (!c) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c = bake(px * dpr * 0.7, draw, 1 / 0.7).canvas;
      this.iconCache.set(k, c);
    }
    const copy = document.createElement('canvas');
    copy.width = c.width;
    copy.height = c.height;
    copy.getContext('2d')!.drawImage(c, 0, 0);
    return copy;
  }

  private buildLegends() {
    const items = $('item-legend');
    for (const k of Object.keys(ITEMS) as ItemKind[]) {
      const row = document.createElement('div');
      row.append(this.icon(`item-${k}`, (g) => ITEM_ART[k](g, 0), 40));
      row.insertAdjacentHTML('beforeend', `<span><b>${ITEMS[k].name}</b><br>${ITEM_HELP[k]}</span>`);
      items.appendChild(row);
    }
    const monsters = $('monster-legend');
    for (const k of Object.keys(ENEMIES) as EnemyKind[]) {
      if (k === 'minipumpkin') continue;
      const def = ENEMIES[k];
      const art = MONSTER_ART[k];
      const notes: string[] = [];
      if (def.phases) notes.push('flies through walls');
      if (def.hp > 1) notes.push(`takes ${def.hp} hits`);
      if (k === 'pumpkin') notes.push('splits in two from level 5');
      if (k === 'vampire') notes.push('turns into bats');
      if (k === 'bat') notes.push('fast and silly');
      if (k === 'cousin') notes.push('the ultimate boss: a perfectly normal person who takes 10 eyeballs');
      const row = document.createElement('div');
      row.append(
        this.icon(
          `mon-${k}`,
          (g) => {
            art.draw(g, 0);
            for (const e of art.eyes) drawGooglyEye(g, e.x, e.y, e.r, 1, 0.3, 0);
          },
          40,
        ),
      );
      row.insertAdjacentHTML(
        'beforeend',
        `<span><b>${def.name}</b> · ${def.points} pts<br>${notes.join(', ') || 'chases you around'} (${k === 'cousin' ? `every ${def.unlock}th level` : `from level ${def.unlock}`})</span>`,
      );
      monsters.appendChild(row);
    }
  }

  private buildFloaters() {
    const box = document.querySelector('.floaters')!;
    const icons = ['🎃', '👻', '🦇', '💀', '🍬', '🕷️', '🧟', '🧙'];
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('span');
      s.textContent = icons[i % icons.length];
      s.style.left = `${Math.random() * 100}%`;
      s.style.animationDuration = `${8 + Math.random() * 10}s`;
      s.style.animationDelay = `${-Math.random() * 18}s`;
      box.appendChild(s);
    }
  }

  private buildScores() {
    const list = $('score-list');
    const scores = loadScores();
    list.innerHTML = scores.length
      ? scores
          .map(
            (s) =>
              `<li><img src="${minderSrc(s.minder)}" alt="" /><span>Level ${s.level}<br><small>${new Date(s.date).toLocaleDateString()}</small></span><b>${s.score.toLocaleString('en-US')}</b></li>`,
          )
          .join('')
      : '<li style="justify-content:center">No scores yet. Go play! 🎃</li>';
  }

  // ------------------------------------------------------------ game flow

  private startGame() {
    audio.unlock();
    this.show(null);
    this.state = 'playing';
    $('hud').hidden = false;
    $('share-fallback').hidden = true;
    this.layout();
    this.game.start(1);
    this.input.enabled = true;
    audio.startMusic('spooky');
    void this.keepAwake(true);
  }

  private pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    audio.stopMusic();
    this.show('screen-pause');
  }

  private resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.enabled = true;
    this.input.reset();
    this.show(null);
    if (this.game.phase !== 'dying') audio.startMusic(this.game.party ? 'party' : 'spooky');
    this.last = performance.now();
  }

  private toMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    audio.stopMusic();
    $('hud').hidden = true;
    $('banner').innerHTML = '';
    this.layout();
    this.refreshTitle();
    this.show('screen-title');
    void this.keepAwake(false);
  }

  private onLevelIntro(level: number) {
    window.clearTimeout(this.partyTimer);
    const party = level === ANNIVERSARY_LEVEL;
    const quip = LEVEL_QUIPS[(level - 1) % LEVEL_QUIPS.length];
    if (party) {
      this.banner(
        `<div class="big party">HAPPY 12TH<br>BIRTHDAY<br>MINDERA!</div><div class="small">🎉 Party level: double points! 🎉</div><img src="${minderSrc('party')}" alt="" />`,
        3200,
      );
      audio.stopMusic();
      audio.play('party');
      this.partyTimer = window.setTimeout(() => {
        if (this.state === 'playing' && this.game.party) audio.startMusic('party');
      }, 9000);
    } else {
      this.banner(`<div class="big">LEVEL ${level}</div><div class="small theme-name">${THEME_NAMES[themeFor(level)]}</div><div class="small">${quip}</div>`, 2400);
      if (level === ANNIVERSARY_LEVEL + 1 || level === 1) audio.startMusic('spooky');
    }
  }

  private onLevelClear(level: number, bonus: number) {
    if (level === ANNIVERSARY_LEVEL) {
      this.banner(
        `<div class="big party">HAPPY<br>ANNIVERSARY<br>MINDERA!</div><div class="small">🎆 Time bonus +${bonus.toLocaleString('en-US')} 🎆</div>`,
        6800,
      );
      return;
    }
    this.banner(`<div class="big">LEVEL CLEAR!</div><div class="small">Time bonus +${bonus.toLocaleString('en-US')}</div>`, 2800);
  }

  private onGameOver(reason: string, won: boolean) {
    this.state = 'over';
    this.input.enabled = false;
    audio.stopMusic();
    void this.keepAwake(false);
    const { score, level } = this.game;
    const rank = saveScore({ score, level, minder: this.minder.id, date: new Date().toISOString() });
    $('over-headline').textContent = won ? 'YOU SAVED HALLOWEEN!' : 'GAME OVER';
    $('over-reason').textContent = reason;
    $<HTMLImageElement>('over-minder').src = minderSrc(this.minder.id);
    $('over-score').textContent = score.toLocaleString('en-US');
    $('over-level').textContent = String(level);
    $('over-best').textContent = highScore().toLocaleString('en-US');
    $('over-new').hidden = rank !== 0 || score === 0;
    $('share-fallback').hidden = true;
    $('banner').innerHTML = '';
    this.show('screen-over');
    if (rank === 0 && score > 0) audio.play('clear');
    this.shareInfo = { score, level, minderName: this.minder.name, minderImg: this.minderImg, won };
    this.card = null;
    void buildCard(this.shareInfo).then((b) => {
      this.card = b;
      if (this.cardUrl) URL.revokeObjectURL(this.cardUrl);
      this.cardUrl = b ? URL.createObjectURL(b) : '';
    });
  }

  private async share() {
    if (!this.shareInfo) return;
    if (!this.card) this.card = await buildCard(this.shareInfo);
    const result = await shareScore(this.shareInfo, this.card);
    if (result !== 'fallback') return;
    const links = fallbackLinks(this.shareInfo);
    $<HTMLAnchorElement>('share-whatsapp').href = links.whatsapp;
    $<HTMLAnchorElement>('share-x').href = links.x;
    $<HTMLAnchorElement>('share-facebook').href = links.facebook;
    $<HTMLAnchorElement>('share-linkedin').href = links.linkedin;
    const dl = $<HTMLAnchorElement>('share-download');
    dl.hidden = !this.cardUrl;
    dl.href = this.cardUrl;
    $('share-fallback').hidden = false;
  }

  private async keepAwake(on: boolean) {
    try {
      if (on && !this.wakeLock && 'wakeLock' in navigator) {
        this.wakeLock = await (navigator as unknown as { wakeLock: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock.request('screen');
      } else if (!on && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch {
      this.wakeLock = null;
    }
  }

  // ------------------------------------------------------------ overlays

  private toast(text: string, color = '#fff59d') {
    const t = $('toast');
    t.textContent = text;
    t.style.color = color;
    t.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 2400);
  }

  private banner(html: string, ms: number) {
    const b = $('banner');
    b.innerHTML = html;
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (b.innerHTML = ''), ms);
  }

  // ------------------------------------------------------------ layout & loop

  private layout() {
    const playing = this.state !== 'menu';
    const touch = isTouch();
    const landscape = touch && window.innerWidth > window.innerHeight * 1.1;
    this.appEl.classList.toggle('landscape', landscape);
    $('controls').hidden = !(touch && playing);
    const r = this.stage.getBoundingClientRect();
    const pad = 6;
    const field: Rect = { x: pad, y: pad, w: r.width - pad * 2, h: r.height - pad * 2 };
    if (landscape && playing) {
      const side = Math.min(r.width * 0.25, 200);
      field.x = side;
      field.w = Math.max(100, r.width - side * 2);
    }
    this.field = field;
    this.renderer.resize(r.width, r.height, field);
  }

  private frame(t: number) {
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    if (this.state === 'playing') {
      const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < steps; i++) this.game.update(dt / steps);
    }
    if (this.state !== 'menu') {
      this.renderer.render(this.game);
      this.updateHud();
    }
    requestAnimationFrame((n) => this.frame(n));
  }

  private setText(id: string, v: string) {
    if (this.hud.get(id) === v) return;
    this.hud.set(id, v);
    $(id).textContent = v;
  }

  private updateHud() {
    const g = this.game;
    this.setText('hud-level', String(g.level));
    this.setText('hud-score', g.score.toLocaleString('en-US'));
    const s = Math.max(0, Math.ceil(g.timeLeft));
    this.setText('hud-time', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    $('hud-time-wrap').classList.toggle('hurry', g.phase === 'play' && s <= 20 && s < LEVEL_TIME);
    this.setText('hud-enemies', String(g.enemiesLeft));
    this.setText('hud-bits', String(g.pelletCount));
    const glitchy = this.state === 'playing' && g.has('roach');
    if (glitchy !== this.glitchy) {
      this.glitchy = glitchy;
      this.appEl.classList.toggle('glitchy', glitchy);
    }

    const kinds = [...g.effects.keys()];
    const key = kinds.join(',');
    const box = $('effects');
    if (key !== this.effectKey) {
      this.effectKey = key;
      box.innerHTML = '';
      for (const k of kinds) {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.dataset.kind = k;
        chip.append(this.icon(`item-${k}`, (gg) => ITEM_ART[k](gg, 0), 22));
        chip.insertAdjacentHTML('beforeend', `<span class="bar"><i></i></span>`);
        box.appendChild(chip);
      }
    }
    box.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
      const left = g.effects.get(chip.dataset.kind as ItemKind) ?? 0;
      (chip.querySelector('i') as HTMLElement).style.width = `${(left / 10) * 100}%`;
    });
  }
}

const app = new App();
if (import.meta.env.DEV) Object.assign(window, { __hm: app });
