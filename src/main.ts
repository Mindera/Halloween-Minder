import './style.css';
import { audio } from './audio';
import {
  ANNIVERSARY_LEVEL,
  DAILY_STAGES,
  ENEMIES,
  ITEMS,
  LEVEL_QUIPS,
  LEVEL_TIME,
  MINDERS,
  THEME_NAMES,
  dailyKey,
  type EnemyKind,
  type ItemKind,
  type MinderDef,
} from './config';
import { Game } from './game';
import { Input } from './input';
import { pickDims } from './maze';
import { Renderer, type Rect } from './render';
import { buildCard, fallbackLinks, shareScore, type ShareInfo } from './share';
import { ITEM_ART, MONSTER_ART, bake, drawGooglyEye } from './sprites';
import { highScore, loadDaily, loadMinder, loadScores, saveDaily, saveMinder, saveScore } from './storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const minderSrc = (id: string) => `${import.meta.env.BASE_URL}minders/${id}.png`;
const isTouch = () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
/** Co-op needs room for two people: tablets and computers. */
const bigScreen = () => Math.min(window.innerWidth, window.innerHeight) >= 600;
const SCREENS = ['screen-title', 'screen-select', 'screen-help', 'screen-scores', 'screen-pause', 'screen-over'];
const P2_KEY = 'hm.minder2';

type State = 'menu' | 'playing' | 'paused' | 'over';
type Mode = 'arcade' | 'daily' | 'coop';

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
  bomb: '+2 pumpkin bombs. Drop them with BOMB to blow up crates and monsters.',
  candy: '+1000 sweet points.',
  cake: 'Only at the level 12 party. +1200!',
};

class App {
  private appEl = $('app');
  private stage = $('stage');
  private canvas = $<HTMLCanvasElement>('game');
  private renderer = new Renderer(this.canvas);
  private input = new Input(this.stage, [
    { dpad: $('dpad'), fire: $('fire'), bomb: $('bomb') },
    { dpad: $('dpad2'), fire: $('fire2'), bomb: $('bomb2') },
  ]);
  private game: Game;
  private state: State = 'menu';
  private mode: Mode = 'arcade';
  /** Minder for player 1 and player 2. */
  private minders: MinderDef[];
  private minderImgs: HTMLImageElement[] = [];
  /** Which player is choosing on the picker screen (co-op). */
  private picking = 0;
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
        victory: () =>
          this.onGameOver(this.game.daily ? "You cleared today's Daily Challenge!" : 'You beat all 100 levels. The monsters surrender!', true),
      },
      () => pickDims(this.field.w, this.field.h),
    );
    const find = (id: string | null, fallback: number) => MINDERS.find((m) => m.id === id) ?? MINDERS[fallback];
    let p2: string | null = null;
    try {
      p2 = localStorage.getItem(P2_KEY);
    } catch {
      /* ignore */
    }
    this.minders = [find(loadMinder(), 0), find(p2, 3)];
    this.loadMinderImages();

    this.input.onPause = () => (this.state === 'playing' ? this.pause() : this.state === 'paused' ? this.resume() : undefined);
    this.input.onMute = () => this.toggleMute();
    this.bindUi();
    this.buildMinderGrid();
    this.buildLegends();
    this.buildFloaters();
    this.refreshTitle();
    this.layout();
    this.show('screen-title');

    window.addEventListener('resize', () => {
      this.layout();
      this.refreshTitle();
    });
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
    click('btn-arcade', () => this.openPicker('arcade'));
    click('btn-daily', () => this.openPicker('daily'));
    click('btn-coop', () => this.openPicker('coop'));
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
    click('btn-change', () => this.openPicker(this.mode));
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

  private loadMinderImages() {
    const players = this.mode === 'coop' ? 2 : 1;
    const imgs = this.minders.slice(0, players).map((m) => {
      const img = new Image();
      img.src = minderSrc(m.id);
      return img;
    });
    this.minderImgs = imgs;
    void Promise.all(imgs.map((img) => img.decode().catch(() => undefined))).then(() => {
      if (this.minderImgs !== imgs) return;
      this.renderer.setMinders(imgs.map((img, i) => ({ img, iris: this.minders[i].iris, eye: this.minders[i].eye })));
    });
  }

  private setMinder(slot: number, m: MinderDef) {
    this.minders[slot] = m;
    if (slot === 0) saveMinder(m.id);
    else
      try {
        localStorage.setItem(P2_KEY, m.id);
      } catch {
        /* ignore */
      }
    this.loadMinderImages();
  }

  private refreshTitle() {
    $<HTMLImageElement>('title-minder').src = minderSrc(this.minders[0].id);
    $('title-best').textContent = highScore().toLocaleString('en-US');
    const day = dailyKey();
    const best = loadDaily()[day];
    $('daily-sub').textContent = best ? `Today's best: ${best.score.toLocaleString('en-US')}` : `Same mazes for everyone today (${day})`;
    $('btn-coop').hidden = !bigScreen();
  }

  private openPicker(mode: Mode) {
    if (mode === 'coop' && !bigScreen()) mode = 'arcade';
    this.mode = mode;
    this.picking = 0;
    this.loadMinderImages();
    this.refreshPicker();
    this.show('screen-select');
  }

  private refreshPicker() {
    const coop = this.mode === 'coop';
    $('select-title').textContent = coop ? (this.picking === 0 ? 'Player 1, pick!' : 'Player 2, pick!') : 'Pick your Minder';
    const sub = $('select-sub');
    sub.hidden = !coop && this.mode !== 'daily';
    sub.textContent = coop
      ? 'Tap a Minder for the player shown above. Tap again to switch players.'
      : `Daily Challenge · ${dailyKey()} · ${DAILY_STAGES.length} stages, the same for everyone`;
    $('minder-grid')
      .querySelectorAll<HTMLElement>('.minder-card')
      .forEach((card) => {
        const id = card.dataset.id;
        card.classList.toggle('selected', id === this.minders[0].id);
        card.classList.toggle('selected2', coop && id === this.minders[1].id);
        card.querySelectorAll('.badge').forEach((b) => b.remove());
        if (coop && id === this.minders[0].id) card.insertAdjacentHTML('beforeend', '<span class="badge p1">P1</span>');
        if (coop && id === this.minders[1].id) card.insertAdjacentHTML('beforeend', '<span class="badge p2">P2</span>');
      });
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
      card.addEventListener('click', () => {
        audio.unlock();
        audio.play('click');
        this.setMinder(this.mode === 'coop' ? this.picking : 0, m);
        if (this.mode === 'coop') this.picking = 1 - this.picking;
        this.refreshPicker();
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
    const scores = loadScores();
    $('score-list').innerHTML = scores.length
      ? scores
          .map(
            (s) =>
              `<li><img src="${minderSrc(s.minder)}" alt="" />${s.minder2 ? `<img src="${minderSrc(s.minder2)}" alt="" />` : ''}<span>Level ${s.level}<br><small>${new Date(s.date).toLocaleDateString()}</small></span><b>${s.score.toLocaleString('en-US')}</b></li>`,
          )
          .join('')
      : '<li style="justify-content:center">No scores yet. Go play! 🎃</li>';
    const days = Object.entries(loadDaily())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 7);
    $('daily-list').innerHTML = days.length
      ? days
          .map(
            ([day, d]) =>
              `<li><img src="${minderSrc(d.minder)}" alt="" /><span>${day === dailyKey() ? 'Today' : day}<br><small>${d.stages >= DAILY_STAGES.length ? 'Cleared! 🎉' : `Stage ${d.stages + 1} of ${DAILY_STAGES.length}`}</small></span><b>${d.score.toLocaleString('en-US')}</b></li>`,
          )
          .join('')
      : '<li style="justify-content:center">No daily runs yet. Try today\'s! 📅</li>';
  }

  // ------------------------------------------------------------ game flow

  private startGame() {
    audio.unlock();
    if (this.mode === 'coop' && !bigScreen()) this.mode = 'arcade';
    this.loadMinderImages();
    this.show(null);
    this.state = 'playing';
    $('hud').hidden = false;
    $('share-fallback').hidden = true;
    this.input.coop = this.mode === 'coop';
    this.layout();
    this.game.start({ mode: this.mode === 'daily' ? 'daily' : 'arcade', players: this.mode === 'coop' ? 2 : 1 });
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
    const g = this.game;
    const theme = `<div class="small theme-name">${THEME_NAMES[g.theme]}</div>`;
    if (g.party) {
      this.banner(
        `<div class="big party">HAPPY 12TH<br>BIRTHDAY<br>MINDERA!</div><div class="small">🎉 Party level: double points! 🎉</div><img src="${minderSrc('party')}" alt="" />`,
        3200,
      );
      audio.stopMusic();
      audio.play('party');
      this.partyTimer = window.setTimeout(() => {
        if (this.state === 'playing' && this.game.party) audio.startMusic('party');
      }, 9000);
      return;
    }
    if (g.daily) {
      this.banner(`<div class="big">STAGE ${g.stage + 1}/${DAILY_STAGES.length}</div>${theme}<div class="small">Daily Challenge · ${g.day}</div>`, 2400);
      if (g.stage === 0) audio.startMusic('spooky');
      return;
    }
    const quip = LEVEL_QUIPS[(level - 1) % LEVEL_QUIPS.length];
    this.banner(`<div class="big">LEVEL ${level}</div>${theme}<div class="small">${quip}</div>`, 2400);
    if (level === ANNIVERSARY_LEVEL + 1 || level === 1) audio.startMusic('spooky');
    if (level === 1 && g.coop && !isTouch()) {
      window.setTimeout(() => this.toast('P1: WASD + Space (fire) + E (bomb) · P2: Arrows + Enter (fire) + right Shift (bomb)', '#18ffff'), 2500);
    }
  }

  private onLevelClear(level: number, bonus: number) {
    const cheer = this.minderImgs.map((img) => `<img class="cheering" src="${img.src}" alt="" />`).join('');
    if (this.game.party && level === ANNIVERSARY_LEVEL) {
      this.banner(
        `<div class="big party">HAPPY<br>ANNIVERSARY<br>MINDERA!</div><div class="small">🎆 Time bonus +${bonus.toLocaleString('en-US')} 🎆</div>`,
        6800,
      );
      return;
    }
    const title = this.game.daily ? `STAGE ${this.game.stage + 1} CLEAR!` : 'LEVEL CLEAR!';
    this.banner(`<div class="big">${title}</div><div class="small">Time bonus +${bonus.toLocaleString('en-US')}</div><div class="cheer-row">${cheer}</div>`, 2800);
  }

  private onGameOver(reason: string, won: boolean) {
    this.state = 'over';
    this.input.enabled = false;
    audio.stopMusic();
    void this.keepAwake(false);
    const g = this.game;
    const { score, level } = g;
    const coop = g.coop;
    const stagesCleared = won ? DAILY_STAGES.length : g.stage;
    let isBest: boolean;
    if (g.daily) {
      isBest = saveDaily(g.day, { score, stages: stagesCleared, minder: this.minders[0].id }) && score > 0;
      $('over-headline').textContent = won ? 'DAILY CHALLENGE CLEARED!' : 'DAILY CHALLENGE';
      $('over-level-label').textContent = 'STAGE';
      $('over-level').textContent = `${Math.min(g.stage + 1, DAILY_STAGES.length)}/${DAILY_STAGES.length}`;
      $('over-best-label').textContent = "TODAY'S BEST";
      $('over-best').textContent = (loadDaily()[g.day]?.score ?? score).toLocaleString('en-US');
    } else {
      const rank = saveScore({ score, level, minder: this.minders[0].id, minder2: coop ? this.minders[1].id : undefined, date: new Date().toISOString() });
      isBest = rank === 0 && score > 0;
      $('over-headline').textContent = won ? 'YOU SAVED HALLOWEEN!' : coop ? 'GAME OVER, TEAM!' : 'GAME OVER';
      $('over-level-label').textContent = 'LEVEL';
      $('over-level').textContent = String(level);
      $('over-best-label').textContent = 'HIGH SCORE';
      $('over-best').textContent = highScore().toLocaleString('en-US');
    }
    $('over-reason').textContent = reason;
    this.showEmotes(won);
    $('over-score').textContent = score.toLocaleString('en-US');
    $('over-new').hidden = !isBest;
    $('over-new').textContent = g.daily ? "🎉 NEW BEST FOR TODAY! 🎉" : '🎉 NEW HIGH SCORE! 🎉';
    $('share-fallback').hidden = true;
    $('banner').innerHTML = '';
    this.show('screen-over');
    if (isBest || won) audio.play('clear');
    this.shareInfo = {
      score,
      level,
      minderName: this.minders[0].name,
      minderImg: this.minderImgs[0],
      won,
      daily: g.daily ? { day: g.day, stages: stagesCleared, total: DAILY_STAGES.length } : undefined,
      partnerName: coop ? this.minders[1].name : undefined,
    };
    this.card = null;
    void buildCard(this.shareInfo).then((b) => {
      this.card = b;
      if (this.cardUrl) URL.revokeObjectURL(this.cardUrl);
      this.cardUrl = b ? URL.createObjectURL(b) : '';
    });
  }

  /** The Minders cry real tears on game over and jump for joy on a win. */
  private showEmotes(won: boolean) {
    const box = document.querySelector('.over-minders')!;
    box.innerHTML = this.minderImgs
      .map((img, i) => {
        const [ex, ey] = this.minders[i].eye;
        const tears = won
          ? ''
          : [0, 1, 2, 3]
              .map((k) => `<i style="left:calc(${ex * 100}% ${k % 2 ? '+' : '-'} ${12 + (k >> 1) * 6}px);top:${ey * 100 + 4}%;animation-delay:${k * 0.27}s"></i>`)
              .join('');
        return `<span class="tears"><img class="hero small ${won ? 'cheering' : 'crying'}" src="${img.src}" alt="" />${tears}</span>`;
      })
      .join('');
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
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), Math.max(2400, text.length * 45));
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
    const coop = playing && this.mode === 'coop';
    const landscape = touch && window.innerWidth > window.innerHeight * 1.1;
    this.appEl.classList.toggle('landscape', landscape);
    this.appEl.classList.toggle('coop', coop);
    $('controls').hidden = !(touch && playing);
    $('pad2').hidden = !coop;
    const r = this.stage.getBoundingClientRect();
    const pad = 6;
    const field: Rect = { x: pad, y: pad, w: r.width - pad * 2, h: r.height - pad * 2 };
    if (landscape && playing) {
      const side = Math.min(r.width * 0.25, coop ? 190 : 200);
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
    this.setText('hud-level-label', g.daily ? 'STAGE' : 'LEVEL');
    this.setText('hud-level', g.daily ? `${g.stage + 1}/${DAILY_STAGES.length}` : String(g.level));
    this.setText('hud-score', g.score.toLocaleString('en-US'));
    const s = Math.max(0, Math.ceil(g.timeLeft));
    this.setText('hud-time', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    $('hud-time-wrap').classList.toggle('hurry', g.phase === 'play' && s <= 20 && s < LEVEL_TIME);
    this.setText('hud-enemies', String(g.enemiesLeft));
    this.setText('hud-bits', String(g.pelletCount));
    const bombs = String(g.bombStock);
    this.setText('hud-bombs', bombs);
    this.setText('bomb-count', bombs);
    this.setText('bomb-count2', bombs);
    $('bomb').classList.toggle('empty', g.bombStock === 0);
    $('bomb2').classList.toggle('empty', g.bombStock === 0);
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
