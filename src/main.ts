import './style.css';
import { audio } from './audio';
import {
  ANNIVERSARY_LEVEL,
  DAILY_STAGES,
  ENEMIES,
  ITEMS,
  LEVEL_TIME,
  MINDERS,
  SQUID_LEVEL,
  dailyKey,
  type EnemyKind,
  type ItemKind,
  type MinderDef,
} from './config';
import { Climb, climbRecord } from './climb';
import { buzz } from './feedback';
import { Flingable } from './fling';
import { Game } from './game';
import { LANGS, detectLang, getLang, say, setLang, t, ta, type Lang } from './i18n';
import { Input } from './input';
import { pickDims } from './maze';
import { PairScreen } from './net/pair';
import { NetSession } from './net/session';
import type { Ctl } from './net/protocol';
import type { Transport } from './net/transport';
import {
  COSTUMES,
  STICKERS,
  flush,
  hasSticker,
  isUnlocked,
  loadGhost,
  outfit,
  record,
  saveGhost,
  saveOutfit,
  saveSettings,
  settings,
  stats,
  type GameEvent,
  type Settings,
  type Sticker,
} from './progress';
import { Renderer, type Rect } from './render';
import { buildCard, fallbackLinks, shareScore, type ShareInfo } from './share';
import { ITEM_ART, MONSTER_ART, bake, drawGooglyEye } from './sprites';
import { highScore, loadDaily, loadMinder, loadScores, saveDaily, saveMinder, saveScore } from './storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const minderSrc = (id: string) => `${import.meta.env.BASE_URL}minders/${id}.png`;
const isTouch = () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
/** Co-op needs room for two people: tablets and computers. */
const bigScreen = () => Math.min(window.innerWidth, window.innerHeight) >= 600;
/** Development: `?net` offers two-device play anywhere, `?net=loop` pairs two tabs of this browser. */
/** When this build was made (see vite.config.ts). */
declare const __RELEASE__: string;

/** The last release as YYYY-MM-DD HH:MM, in the device's time zone. */
function releaseStamp(): string {
  const d = new Date(__RELEASE__);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const devNet = import.meta.env.DEV ? new URLSearchParams(location.search).get('net') : null;
/** Phones play 2 Players across two phones (experimental); tablets and computers share one screen. */
const netCoop = () => devNet !== null || (isTouch() && !bigScreen());
const SCREENS = ['screen-title', 'screen-net', 'screen-select', 'screen-help', 'screen-scores', 'screen-lang', 'screen-settings', 'screen-stickers', 'screen-pause', 'screen-over'];
const minderName = (id: string) => t(`minders.${id}.name`);
const P2_KEY = 'hm.minder2';

type State = 'menu' | 'playing' | 'paused' | 'over';
/** `net`: 2 Players across two phones. */
type Mode = 'arcade' | 'daily' | 'coop' | 'net';


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
  private toastQueue: { text: string; color: string }[] = [];
  private stickerQueue: Sticker[] = [];
  private stickerShowing = false;
  private settingsFrom = 'screen-title';
  private bannerTimer = 0;
  private partyTimer = 0;
  private effectKey = '';
  private glitchy = false;
  private card: Blob | null = null;
  private cardUrl = '';
  private shareInfo?: ShareInfo;
  private wakeLock: { release(): Promise<void> } | null = null;
  private iconCache = new Map<string, HTMLCanvasElement>();
  /** The link to the other phone in a networked game. */
  private net: NetSession | null = null;
  private pair = new PairScreen((text, color) => this.toast(text, color), devNet === 'loop');
  private lastBoing = 0;
  /** Title Minder throws (no need to wait for it to settle in between): after the third it hurries home and the secret climb opens. */
  private throws = 0;
  private pullHintEl?: HTMLElement;
  private pullHintTimer = 0;
  private climb = new Climb();
  private fling = new Flingable($<HTMLImageElement>('title-minder'), {
    onBounce: (speed) => {
      const now = performance.now();
      if (now - this.lastBoing < 120) return;
      this.lastBoing = now;
      audio.play('boing');
      buzz(speed > 1500 ? 'medium' : 'light');
    },
    onThrow: () => {
      if (++this.throws >= 3) this.fling.hurry();
      this.pullHint(this.throws);
    },
    onHome: () => this.openSecret(),
  });

  constructor() {
    this.game = new Game(
      this.input,
      {
        toast: (m, c) => {
          this.toast(say(m), c);
          this.relay({ t: 'toast', m, c });
        },
        levelIntro: (l) => {
          if (this.net?.isHost) this.net.sendLevel();
          this.onLevelIntro(l);
        },
        event: (e) => {
          this.onEvent(e);
          this.relay({ t: 'event', e });
        },
        levelClear: (l, b) => {
          this.onLevelClear(l, b);
          this.relay({ t: 'clear', level: l, bonus: b });
        },
        gameOver: (r) => {
          this.relay({ t: 'over', reason: r, won: false });
          this.onGameOver(say(r), false);
        },
        victory: () => {
          this.relay({ t: 'over', reason: '', won: true });
          this.onGameOver(t(this.game.daily ? 'over.wonDaily' : 'over.wonArcade'), true);
        },
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
    this.pair.onConnected = (link, host) => this.beginNet(link, host);
    window.addEventListener('pagehide', () => this.endNet());
    this.bindUi();
    this.buildFloaters();
    this.layout();
    void setLang(detectLang()).then(() => {
      this.applyLanguage();
      this.show('screen-title');
    });

    window.addEventListener('resize', () => {
      this.layout();
      this.refreshTitle();
    });
    window.visualViewport?.addEventListener('resize', () => this.layout());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    this.preventZoom();
    this.applySettings();
    document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------ screens

  private show(id: string | null) {
    if (id !== 'screen-title') {
      this.fling.reset();
      this.climb.stop();
      this.throws = 0;
      this.pullHint(0);
    }
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
    click('btn-stickers', () => {
      this.buildStickers();
      this.show('screen-stickers');
    });
    click('btn-settings', () => this.openSettings('screen-title'));
    click('btn-pause-settings', () => this.openSettings('screen-pause'));
    click('btn-settings-back', () => this.show(this.settingsFrom));
    click('btn-lang-back', () => this.openSettings(this.settingsFrom));
    click('btn-help', () => this.show('screen-help'));
    click('btn-scores', () => {
      this.buildScores();
      this.show('screen-scores');
    });
    click('btn-go', () => this.startGame());
    click('btn-pause', () => this.pause());
    click('btn-resume', () => this.resume());
    click('btn-quit', () => this.toMenu());
    click('btn-net-back', () => {
      this.pair.cancel();
      this.toTitle();
    });
    click('btn-again', () => this.startGame());
    click('btn-change', () => this.openPicker(this.mode));
    click('btn-share', () => void this.share());
    click('btn-mute', () => this.toggleMute());
    click('share-copy', () => {
      if (!this.shareInfo) return;
      void navigator.clipboard?.writeText(fallbackLinks(this.shareInfo).copy).then(() => this.toast(t('over.copied'), '#69f0ae'));
    });
    document.querySelectorAll<HTMLElement>('[data-back]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.play('click');
        this.endNet();
        this.toTitle();
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
    const players = this.mode === 'coop' || this.mode === 'net' ? 2 : 1;
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

  /** After the 1st and 2nd throw, a bubble over the Minder's spot hints that the 3rd does something (0 hides it). */
  private pullHint(n: number) {
    window.clearTimeout(this.pullHintTimer);
    this.pullHintEl?.remove();
    this.pullHintEl = undefined;
    const r = $('title-minder').getBoundingClientRect();
    if (n < 1 || n > 2 || !r.width) return;
    const b = document.createElement('div');
    b.className = 'climb-bubble hint';
    const text = document.createElement('em');
    text.textContent = t(n === 1 ? 'title.pullMore' : 'title.pullOnce');
    b.append(text);
    b.style.left = `${r.left + r.width / 2}px`;
    b.style.top = `${r.top - 6}px`;
    document.body.appendChild(b);
    this.pullHintEl = b;
    this.pullHintTimer = window.setTimeout(() => {
      b.classList.add('out');
      window.setTimeout(() => b.remove(), 400);
    }, 2600);
  }

  /** Third throw and the title Minder is back home: off it climbs, as the selected Minder. */
  private openSecret() {
    if (this.throws < 3 || this.state !== 'menu' || $('screen-title').hidden) return;
    this.throws = 0;
    this.pullHint(0);
    const m = this.minders[0];
    // Finding it is worth a sticker (its popup shows over the game).
    const { stickers } = record({ type: 'secret' }, true);
    flush();
    this.climb.start({
      home: $<HTMLImageElement>('title-minder'),
      minder: m.id,
      panel: document.querySelector<HTMLElement>('#screen-title .title-panel')!,
      src: minderSrc(m.id),
      iris: m.iris,
      eye: m.eye,
    });
    for (const s of stickers) this.stickerPop(s);
  }

  // ------------------------------------------------------------ progress, stickers, costumes, settings

  /** A new sticker: a card drops in at the top of the screen (one at a time) and says where to see them all. */
  private stickerPop(s: Sticker) {
    this.stickerQueue.push(s);
    if (!this.stickerShowing) this.nextSticker();
  }

  private nextSticker() {
    const el = $('sticker-pop');
    const s = this.stickerQueue.shift();
    this.stickerShowing = !!s;
    if (!s) return;
    el.className = s.big ? 'big' : '';
    el.innerHTML = '<div class="face"></div><div class="text"><b></b><small></small></div>';
    el.querySelector('.face')!.textContent = s.icon;
    el.querySelector('b')!.textContent = this.stickerMessage(s.id);
    el.querySelector('small')!.textContent = t('stickers.seeAll');
    el.hidden = false;
    void el.offsetWidth; // restart the drop-in animation
    el.classList.add('show');
    audio.play(s.big ? 'clear' : 'item');
    window.setTimeout(() => {
      el.classList.remove('show');
      window.setTimeout(() => {
        el.hidden = true;
        this.nextSticker();
      }, 350);
    }, s.big ? 6500 : 4000);
  }

  /** Sticker names may already end in "!" (and the message adds one), so collapse "!!" / "! !". */
  private stickerMessage(id: string) {
    return t('toast.sticker', { name: t(`stickers.${id}`) }).replace(/!([\s\u00a0]*!)+$/u, '!');
  }

  private onEvent(e: GameEvent) {
    const { stickers, costumes } = record(e, !this.game.daily);
    for (const s of stickers) this.stickerPop(s);
    for (const c of costumes) this.toast(t('toast.costume', { name: t(`wardrobe.${c}`) }), '#b2ff59', true);
    if (costumes.length) audio.play('item');
    if (stickers.length || costumes.length || e.type === 'clear' || e.type === 'reach') flush();
  }

  private buildStickers() {
    const done = STICKERS.filter((s) => hasSticker(s.id)).length;
    $('stickers-count').textContent = t('stickers.count', { n: done, total: STICKERS.length });
    $('sticker-grid').innerHTML = STICKERS.map((s, i) => {
      const got = hasSticker(s.id);
      const [cur, goal] = s.progress(stats);
      const tilt = ((i * 37) % 13) - 6;
      const name = !got && s.secret ? t('stickers.secretLocked') : t(`stickers.${s.id}`);
      const sub = s.big ? `<small>${t(`stickers.${s.id}Sub`)}</small>` : got || goal <= 1 ? '' : `<small>${Math.min(cur, goal)}/${goal}</small>`;
      return `<div class="sticker${got ? '' : ' locked'}${s.big ? ' big' : ''}"><div class="face" style="--tilt:${tilt}deg">${got ? s.icon : '?'}</div>${name}${sub}</div>`;
    }).join('');
  }

  private buildWardrobe() {
    const row = $('wardrobe');
    row.innerHTML = '';
    const add = (key: string, icon: string, on: boolean, locked: number, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.classList.toggle('on', on);
      b.classList.toggle('locked', locked > 0);
      b.innerHTML = `<span class="ico">${locked > 0 ? '🔒' : icon}</span>${locked > 0 ? t('wardrobe.locked', { n: locked }) : t(`wardrobe.${key}`)}`;
      b.addEventListener('click', () => {
        audio.play('click');
        if (locked > 0) {
          this.toast(t('wardrobe.locked', { n: locked }), '#ffd54f');
          return;
        }
        fn();
        saveOutfit();
        this.buildWardrobe();
      });
      row.appendChild(b);
    };
    add('none', '🙂', outfit.hat === null, 0, () => (outfit.hat = null));
    for (const c of COSTUMES) {
      const locked = isUnlocked(c.id) ? 0 : c.level;
      if (c.slot === 'hat') add(c.id, c.icon, outfit.hat === c.id, locked, () => (outfit.hat = c.id as 'witchHat' | 'partyHat'));
      else add(c.id, c.icon, outfit.cape, locked, () => (outfit.cape = !outfit.cape));
    }
  }

  private openSettings(from: string) {
    this.settingsFrom = from;
    const list = $('settings-list');
    list.innerHTML = '';
    const lang = document.createElement('button');
    lang.type = 'button';
    lang.className = 'setting lang-setting';
    lang.innerHTML = `<span><span>🌐 ${t('language.title')}</span><small></small></span><b aria-hidden="true">›</b>`;
    lang.querySelector('small')!.textContent = LANGS.find((l) => l.id === getLang())?.name ?? 'English';
    lang.addEventListener('click', () => {
      audio.play('click');
      this.buildLanguages();
      this.show('screen-lang');
    });
    list.appendChild(lang);
    (['slow', 'bigButtons', 'colorBlind', 'noScary'] as (keyof Settings)[]).forEach((key) => {
      const label = key === 'bigButtons' ? 'big' : key;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'setting';
      b.setAttribute('role', 'switch');
      const paint = () => {
        b.setAttribute('aria-checked', String(settings[key]));
        b.innerHTML = `<span>${t(`settings.${label}`)}<small>${t(`settings.${label}Sub`)}</small></span><b>${t(settings[key] ? 'settings.on' : 'settings.off')}</b>`;
      };
      paint();
      b.addEventListener('click', () => {
        audio.play('click');
        settings[key] = !settings[key];
        saveSettings();
        this.applySettings();
        paint();
      });
      list.appendChild(b);
    });
    // Isolated left-to-right, so the date and time keep their order in Arabic.
    $('release').textContent = t('settings.release', { date: `\u2066${releaseStamp()}\u2069` });
    this.show('screen-settings');
  }

  private applySettings() {
    this.appEl.classList.toggle('big-buttons', settings.bigButtons);
    this.layout();
  }

  /**
   * iOS ignores user-scalable=no, so a quick double tap on the pads used to zoom in, with no way back during play.
   * Block the double-tap gesture on the game area, and undo any zoom that still slips through.
   */
  private preventZoom() {
    for (const el of [$('controls'), this.stage]) {
      el.addEventListener('touchstart', (e) => e.cancelable && e.preventDefault(), { passive: false });
      el.addEventListener('touchend', (e) => e.cancelable && e.preventDefault(), { passive: false });
    }
    let timer = 0;
    window.visualViewport?.addEventListener('resize', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => this.resetZoom(), 400);
    });
  }

  private resetZoom() {
    const vv = window.visualViewport;
    if (!vv || vv.scale <= 1.01 || this.state === 'menu') return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.content;
    // Re-applying a (different) viewport makes iOS snap back to scale 1.
    meta.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    window.setTimeout(() => (meta.content = original), 300);
  }

  /** Re-renders everything that has text after the language changes. */
  private applyLanguage() {
    this.buildMinderGrid();
    this.buildLegends();
    this.buildWardrobe();
    this.refreshTitle();
    this.hud.clear();
  }

  private buildLanguages() {
    const list = $('lang-list');
    list.innerHTML = '';
    for (const l of LANGS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.lang = l.id;
      b.textContent = l.name;
      b.classList.toggle('selected', l.id === getLang());
      b.addEventListener('click', () => {
        audio.play('click');
        void this.changeLanguage(l.id);
      });
      list.appendChild(b);
    }
  }

  private async changeLanguage(l: Lang) {
    // Drop messages written in the old language (they would also re-flow oddly when switching to/from RTL).
    this.toastQueue = [];
    $('toast').classList.remove('show');
    await setLang(l, true);
    this.applyLanguage();
    this.openSettings(this.settingsFrom);
  }

  private refreshTitle() {
    $<HTMLImageElement>('title-minder').src = minderSrc(this.minders[0].id);
    $('title-best').textContent = highScore().toLocaleString('en-US');
    const day = dailyKey();
    const best = loadDaily()[day];
    $('daily-sub').textContent = best ? t('title.dailyBest', { score: best.score.toLocaleString('en-US') }) : t('title.dailySub', { day });
    const big = bigScreen();
    const net = netCoop();
    $('btn-coop').classList.toggle('unavailable', !big && !net);
    $('btn-coop').setAttribute('aria-disabled', String(!big && !net));
    $('coop-sub').textContent = t(net ? 'net.sub' : big ? 'title.coopSub' : 'title.coopSubSmall');
    $('coop-exp').hidden = !net;
  }

  private toTitle() {
    this.refreshTitle();
    this.show('screen-title');
  }

  private openPicker(mode: Mode) {
    if (mode === 'coop' && netCoop()) {
      $<HTMLTextAreaElement>('net-paste-text').placeholder = t('net.pasteHere');
      this.pair.open();
      this.show('screen-net');
      return;
    }
    if (mode === 'net') {
      // "Change Minder" after a networked game: both phones go back to picking.
      this.net?.send({ t: 'lobby' });
      this.openLobby();
      return;
    }
    if (mode === 'coop' && !bigScreen()) {
      // Shown but disabled on phones: explain instead of starting.
      this.toast(t('title.coopNeedsBig'), '#80deea');
      return;
    }
    this.mode = mode;
    this.picking = 0;
    this.loadMinderImages();
    this.refreshPicker();
    this.buildWardrobe();
    this.show('screen-select');
  }

  private refreshPicker() {
    const coop = this.mode === 'coop';
    const net = this.mode === 'net';
    const two = coop || net;
    $('select-title').textContent = coop ? t(this.picking === 0 ? 'select.p1' : 'select.p2') : t('select.title');
    const sub = $('select-sub');
    sub.hidden = !two && this.mode !== 'daily';
    sub.textContent = coop
      ? t('select.coopSub')
      : net
        ? t(this.net?.isHost ? 'net.youP1' : 'net.youP2')
        : t('select.dailySub', { day: dailyKey(), n: DAILY_STAGES.length });
    // On the guest phone the host starts the game.
    const waiting = net && !this.net?.isHost;
    const go = $<HTMLButtonElement>('btn-go');
    go.disabled = waiting;
    go.textContent = t(waiting ? 'net.waitHost' : 'select.go');
    $('minder-grid')
      .querySelectorAll<HTMLElement>('.minder-card')
      .forEach((card) => {
        const id = card.dataset.id;
        card.classList.toggle('selected', id === this.minders[0].id);
        card.classList.toggle('selected2', two && id === this.minders[1].id);
        card.querySelectorAll('.badge').forEach((b) => b.remove());
        if (two && id === this.minders[0].id) card.insertAdjacentHTML('beforeend', '<span class="badge p1">P1</span>');
        if (two && id === this.minders[1].id) card.insertAdjacentHTML('beforeend', '<span class="badge p2">P2</span>');
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
      card.innerHTML = `<img src="${minderSrc(m.id)}" alt="" loading="lazy" /><b>${minderName(m.id)}</b><small>${t(`minders.${m.id}.tagline`)}</small>`;
      card.addEventListener('click', () => {
        audio.unlock();
        audio.play('click');
        if (this.mode === 'net') this.pickNetMinder(m);
        else {
          this.setMinder(this.mode === 'coop' ? this.picking : 0, m);
          if (this.mode === 'coop') this.picking = 1 - this.picking;
        }
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
    items.innerHTML = '';
    for (const k of Object.keys(ITEMS) as ItemKind[]) {
      const row = document.createElement('div');
      row.append(this.icon(`item-${k}`, (g) => ITEM_ART[k](g, 0), 40));
      row.insertAdjacentHTML('beforeend', `<span><b>${t(`items.${k}.name`)}</b><br>${t(`items.${k}.help`)}</span>`);
      items.appendChild(row);
    }
    const monsters = $('monster-legend');
    monsters.innerHTML = '';
    for (const k of Object.keys(ENEMIES) as EnemyKind[]) {
      if (k === 'minipumpkin') continue;
      const def = ENEMIES[k];
      const art = MONSTER_ART[k];
      const notes: string[] = [];
      if (def.phases) notes.push(t('help.notePhases'));
      if (def.hp > 1 && k !== 'cousin') notes.push(t('help.noteHits', { n: def.hp }));
      if (k === 'pumpkin') notes.push(t('help.noteSplit'));
      if (k === 'vampire') notes.push(t('help.noteBats'));
      if (k === 'bat') notes.push(t('help.noteFast'));
      if (k === 'cousin') notes.push(t('help.noteBoss'));
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
        `<span><b>${t(`monsters.${k}.name`)}</b> · ${t('help.pts', { n: def.points })}<br>${notes.join(', ') || t('help.noteChase')} (${t(k === 'cousin' ? 'help.everyNth' : 'help.fromLevel', { n: def.unlock })})</span>`,
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
              `<li><img src="${minderSrc(s.minder)}" alt="" />${s.minder2 ? `<img src="${minderSrc(s.minder2)}" alt="" />` : ''}<span>${t('scores.level', { n: s.level })}<br><small>${new Date(s.date).toLocaleDateString(getLang())}</small></span><b>${s.score.toLocaleString('en-US')}</b></li>`,
          )
          .join('')
      : `<li style="justify-content:center">${t('scores.empty')}</li>`;
    const days = Object.entries(loadDaily())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 7);
    $('daily-list').innerHTML = days.length
      ? days
          .map(
            ([day, d]) =>
              `<li><img src="${minderSrc(d.minder)}" alt="" /><span>${day === dailyKey() ? t('scores.today') : day}<br><small>${d.stages >= DAILY_STAGES.length ? t('scores.cleared') : t('scores.stageOf', { n: d.stages + 1, total: DAILY_STAGES.length })}</small></span><b>${d.score.toLocaleString('en-US')}</b></li>`,
          )
          .join('')
      : `<li style="justify-content:center">${t('scores.emptyDaily')}</li>`;
    // The secret climb only shows up here once it has been found and played.
    const climb = climbRecord();
    $('climb-title').hidden = $('climb-list').hidden = !climb;
    if (climb) {
      const who = climb.minder && MINDERS.some((m) => m.id === climb.minder) ? `<img src="${minderSrc(climb.minder)}" alt="" />` : '';
      const when = climb.date ? `<br><small>${new Date(climb.date).toLocaleDateString(getLang())}</small>` : '';
      $('climb-list').innerHTML = `<li>${who}<span>${t('scores.climbBest')}${when}</span><b>${climb.score.toLocaleString('en-US')}</b></li>`;
    }
  }

  // ------------------------------------------------------------ game flow

  private startGame() {
    if (this.mode === 'net') {
      if (!this.net) return this.toTitle();
      // The guest phone waits for the host to start.
      if (!this.net.isHost) return;
      this.net.send({ t: 'start', minders: [this.minders[0].id, this.minders[1].id] });
    }
    audio.unlock();
    if (this.mode === 'coop' && !bigScreen()) this.mode = 'arcade';
    this.loadMinderImages();
    this.show(null);
    this.state = 'playing';
    $('hud').hidden = false;
    $('share-fallback').hidden = true;
    this.input.coop = this.mode === 'coop';
    this.layout();
    const ghost = this.mode === 'daily' ? loadGhost(dailyKey()) : null;
    this.game.ghostRun = ghost;
    if (ghost) {
      const img = new Image();
      img.src = minderSrc(ghost.minder);
      this.renderer.setGhostImage(img);
    } else this.renderer.setGhostImage(undefined);
    this.game.start({ mode: this.mode === 'daily' ? 'daily' : 'arcade', players: this.mode === 'coop' || this.mode === 'net' ? 2 : 1 });
    this.input.enabled = true;
    audio.startMusic('spooky');
    void this.keepAwake(true);
  }

  /** `fromPartner`: the other phone paused (so don't tell it back). */
  private pause(fromPartner = false) {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    audio.stopMusic();
    $('pause-note').hidden = true;
    $('btn-resume').hidden = false;
    this.show('screen-pause');
    if (!fromPartner) this.net?.send({ t: 'pause' });
  }

  private resume(fromPartner = false) {
    if (this.state !== 'paused' || (this.mode === 'net' && !this.net)) return;
    if (!fromPartner) this.net?.send({ t: 'resume' });
    this.state = 'playing';
    this.input.enabled = true;
    this.input.reset();
    this.show(null);
    // The Halloween Game level has no music, so you can hear the doll sing.
    if (this.game.phase !== 'dying' && !this.game.squid) audio.startMusic(this.game.party ? 'party' : 'spooky');
    this.last = performance.now();
  }

  private toMenu() {
    this.endNet();
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
    const theme = `<div class="small theme-name">${t(`themes.${g.theme}`)}</div>`;
    if (g.party) {
      this.banner(
        `<div class="big party">${t('banner.birthday')}</div><div class="small">${t('banner.partyLine')}</div><img src="${minderSrc('party')}" alt="" />`,
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
      this.banner(`<div class="big">${t('banner.stage', { n: g.stage + 1, total: DAILY_STAGES.length })}</div>${theme}<div class="small">${t('banner.dailyLine', { day: g.day })}</div>`, 2400);
      if (g.stage === 0) audio.startMusic('spooky');
      return;
    }
    if (g.squid) {
      this.banner(`<div class="big squid">${t('banner.level', { n: level })}</div>${theme}<div class="small">${t('squid.line')}</div>`, 3000);
      audio.stopMusic();
      return;
    }
    const quips = ta('quips');
    const quip = quips[(level - 1) % quips.length];
    this.banner(`<div class="big">${t('banner.level', { n: level })}</div>${theme}<div class="small">${quip}</div>`, 2400);
    if (level === ANNIVERSARY_LEVEL + 1 || level === SQUID_LEVEL + 1 || level === 1) audio.startMusic('spooky');
    if (level === 1 && this.mode === 'coop' && !isTouch()) {
      window.setTimeout(() => this.toast(t('banner.keys'), '#18ffff'), 2500);
    }
  }

  private onLevelClear(level: number, bonus: number) {
    const cheer = this.minderImgs.map((img) => `<img class="cheering" src="${img.src}" alt="" />`).join('');
    if (this.game.party && level === ANNIVERSARY_LEVEL) {
      this.banner(
        `<div class="big party">${t('banner.anniversary')}</div><div class="small">🎆 ${t('banner.bonus', { n: bonus.toLocaleString('en-US') })} 🎆</div>`,
        6800,
      );
      return;
    }
    const title = this.game.daily ? t('banner.stageClear', { n: this.game.stage + 1 }) : t(this.game.squid ? 'squid.survived' : 'banner.clear');
    this.banner(`<div class="big${this.game.squid ? ' squid' : ''}">${title}</div><div class="small">${t('banner.bonus', { n: bonus.toLocaleString('en-US') })}</div><div class="cheer-row">${cheer}</div>`, 2800);
  }

  private onGameOver(reason: string, won: boolean) {
    this.state = 'over';
    flush();
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
      // Your best run of the day becomes the ghost you race next time.
      if (isBest) saveGhost({ day: g.day, minder: this.minders[0].id, score, stages: g.recording });
      $('over-headline').textContent = t(won ? 'over.dailyWon' : 'over.daily');
      $('over-level-label').textContent = t('over.stage');
      $('over-level').textContent = `${Math.min(g.stage + 1, DAILY_STAGES.length)}/${DAILY_STAGES.length}`;
      $('over-best-label').textContent = t('over.todayBest');
      $('over-best').textContent = (loadDaily()[g.day]?.score ?? score).toLocaleString('en-US');
    } else {
      const rank = saveScore({ score, level, minder: this.minders[0].id, minder2: coop ? this.minders[1].id : undefined, date: new Date().toISOString() });
      isBest = rank === 0 && score > 0;
      $('over-headline').textContent = t(won ? 'over.won' : coop ? 'over.gameOverTeam' : 'over.gameOver');
      $('over-level-label').textContent = t('over.level');
      $('over-level').textContent = String(level);
      $('over-best-label').textContent = t('over.highScore');
      $('over-best').textContent = highScore().toLocaleString('en-US');
    }
    $('over-reason').textContent = reason;
    this.showEmotes(won);
    $('over-score').textContent = score.toLocaleString('en-US');
    $('over-new').hidden = !isBest;
    $('over-new').textContent = t(g.daily ? 'over.newDaily' : 'over.newHigh');
    $('share-fallback').hidden = true;
    $('banner').innerHTML = '';
    // In a networked game only the host starts the next one.
    const waiting = this.mode === 'net' && !this.net?.isHost;
    const again = $<HTMLButtonElement>('btn-again');
    again.disabled = waiting;
    again.textContent = t(waiting ? 'net.waitHost' : 'over.again');
    this.show('screen-over');
    if (isBest || won) audio.play('clear');
    this.shareInfo = {
      score,
      level,
      minderName: minderName(this.minders[0].id),
      minderImg: this.minderImgs[0],
      won,
      daily: g.daily ? { day: g.day, stages: stagesCleared, total: DAILY_STAGES.length } : undefined,
      partnerName: coop ? minderName(this.minders[1].id) : undefined,
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

  // ------------------------------------------------------------ two phones (experimental)

  private beginNet(link: Transport, host: boolean) {
    this.endNet();
    this.net = new NetSession(host, link, this.game, this.input, {
      hello: (id) => this.partnerMinder(id),
      minder: (id) => this.partnerMinder(id),
      lobby: () => this.openLobby(),
      start: (ids) => this.startGuest(ids),
      levelIntro: (l) => this.onLevelIntro(l),
      levelClear: (l, b) => this.onLevelClear(l, b),
      toast: (m, c) => this.toast(say(m), c),
      event: (e) => this.onEvent(e),
      over: (reason, won) => this.onGameOver(won ? t('over.wonArcade') : say(reason), won),
      pause: () => this.pause(true),
      resume: () => this.resume(true),
      lost: () => this.partnerLost(t('net.left')),
      mismatch: () => {
        this.net = null;
        this.mode = 'arcade';
        this.toTitle();
        this.toast(t('net.mismatch'), '#ff8a80');
      },
    });
    const mine = MINDERS.find((m) => m.id === loadMinder()) ?? MINDERS[0];
    this.minders[host ? 0 : 1] = mine;
    this.net.hello(mine.id);
    this.openLobby();
  }

  /** Both phones pick their own Minder; the host starts. */
  private openLobby() {
    if (!this.net) return this.toTitle();
    this.mode = 'net';
    this.loadMinderImages();
    this.refreshPicker();
    this.buildWardrobe();
    this.show('screen-select');
  }

  private pickNetMinder(m: MinderDef) {
    if (!this.net) return;
    this.minders[this.net.isHost ? 0 : 1] = m;
    saveMinder(m.id);
    this.loadMinderImages();
    this.net.send({ t: 'minder', id: m.id });
  }

  private partnerMinder(id: string) {
    const m = MINDERS.find((x) => x.id === id);
    if (!m || !this.net) return;
    this.minders[this.net.isHost ? 1 : 0] = m;
    this.loadMinderImages();
    if (!$('screen-select').hidden) this.refreshPicker();
  }

  /** Guest phone: the host started a game, so show it here too. */
  private startGuest(ids: [string, string]) {
    // Only the host's own pick: ours may have changed after the host sent this (the host gets it next).
    const host = MINDERS.find((x) => x.id === ids[0]);
    if (host) this.minders[0] = host;
    this.mode = 'net';
    audio.unlock();
    this.loadMinderImages();
    this.show(null);
    this.state = 'playing';
    $('hud').hidden = false;
    $('share-fallback').hidden = true;
    this.input.coop = false;
    this.input.reset();
    this.layout();
    this.game.ghostRun = null;
    this.renderer.setGhostImage(undefined);
    this.input.enabled = true;
    audio.startMusic('spooky');
    void this.keepAwake(true);
    this.last = performance.now();
  }

  /** Host only: passes a game callback on to the other phone. */
  private relay(msg: Ctl) {
    if (this.net?.isHost) this.net.send(msg);
  }

  private endNet() {
    if (this.mode === 'net') this.mode = 'arcade';
    const net = this.net;
    if (!net) return;
    this.net = null;
    net.close();
  }

  /** The other phone left: mid-game, stop on the pause screen with only "Quit to menu". */
  private partnerLost(msg: string) {
    this.net = null;
    if (this.state === 'playing' || this.state === 'paused') {
      this.pause(true);
      $('pause-note').textContent = msg;
      $('pause-note').hidden = false;
      $('btn-resume').hidden = true;
      return;
    }
    this.mode = 'arcade';
    this.toMenu();
    this.toast(msg, '#ff8a80');
  }

  // ------------------------------------------------------------ overlays

  /** Shows a message; `queued` ones (stickers, unlocks) wait for the current one instead of replacing it. */
  private toast(text: string, color = '#fff59d', queued = false) {
    const el = $('toast');
    if (queued && el.classList.contains('show')) {
      this.toastQueue.push({ text, color });
      return;
    }
    el.textContent = text;
    el.style.color = color;
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      el.classList.remove('show');
      const next = this.toastQueue.shift();
      if (next) window.setTimeout(() => this.toast(next.text, next.color), 300);
    }, Math.max(2400, text.length * 45));
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
    this.net?.frame(t, dt, this.state === 'playing');
    // The guest phone has nothing to draw until the host's first level arrives.
    if (this.state !== 'menu' && this.game.maze) {
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
    this.setText('hud-level-label', t(g.daily ? 'hud.stage' : 'hud.level'));
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
