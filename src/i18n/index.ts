import { en, type Dict } from './en';

export type Lang = 'en' | 'pt-PT' | 'pt-BR' | 'es' | 'fr' | 'ro' | 'ar' | 'hi' | 'vi';

/** Shown in the language picker, each in its own language. */
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'pt-PT', name: 'Português (Portugal)' },
  { id: 'pt-BR', name: 'Português (Brasil)' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'ro', name: 'Română' },
  { id: 'ar', name: 'العربية' },
  { id: 'hi', name: 'हिन्दी' },
  { id: 'vi', name: 'Tiếng Việt' },
];

/** Other languages are separate chunks, downloaded only when picked. */
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<Dict>> = {
  'pt-PT': () => import('./pt-PT').then((m) => m.ptPT),
  'pt-BR': () => import('./pt-BR').then((m) => m.ptBR),
  es: () => import('./es').then((m) => m.es),
  fr: () => import('./fr').then((m) => m.fr),
  ro: () => import('./ro').then((m) => m.ro),
  ar: () => import('./ar').then((m) => m.ar),
  hi: () => import('./hi').then((m) => m.hi),
  vi: () => import('./vi').then((m) => m.vi),
};

const KEY = 'hm.lang';
let lang: Lang = 'en';
let dict: Dict = en;

export function getLang(): Lang {
  return lang;
}

export const isRtl = () => lang === 'ar';

/** Saved choice first, then the device's languages (pt-BR only for Brazil, other Portuguese gets pt-PT). */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY) as Lang | null;
    if (saved && LANGS.some((l) => l.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const [base, region] = tag.toLowerCase().split('-');
    if (base === 'pt') return region === 'br' ? 'pt-BR' : 'pt-PT';
    const hit = LANGS.find((l) => l.id === base);
    if (hit) return hit.id;
  }
  return 'en';
}

export async function setLang(next: Lang, remember = false) {
  dict = next === 'en' ? en : await LOADERS[next]();
  lang = next;
  if (remember) {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }
  const html = document.documentElement;
  html.lang = next;
  html.dir = isRtl() ? 'rtl' : 'ltr';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  // Only our own strings ever go through innerHTML (they may contain <b> and <br>).
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml!)));
  // Make sure the canvas can draw with the language's font straight away.
  await document.fonts?.load(`700 20px ${uiFont()}`, t('pop.yay')).catch(() => undefined);
}

function lookup(source: unknown, path: string): unknown {
  let node = source;
  for (const part of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Translated string at a dotted path, with `{name}` placeholders filled in. Falls back to English. */
export function t(path: string, vars?: Record<string, string | number>): string {
  let s = lookup(dict, path);
  if (typeof s !== 'string') s = lookup(en, path);
  if (typeof s !== 'string') {
    if (import.meta.env.DEV) console.warn(`[i18n] missing ${path}`);
    return path;
  }
  return vars ? (s as string).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : (s as string);
}

/** Translated list at a dotted path (e.g. random kill words). */
export function ta(path: string): string[] {
  const s = lookup(dict, path);
  if (Array.isArray(s) && s.length) return s as string[];
  const e = lookup(en, path);
  return Array.isArray(e) ? (e as string[]) : [];
}

/**
 * Text the game shows (popups, toasts, game-over reasons), kept as an i18n key so the other phone in a
 * networked game can show it in its own language: `t(k, p)`, or item `i` of the list `ta(k)`, then suffix `s`.
 * A plain string is shown as-is.
 */
export type Msg = string | { k: string; p?: Record<string, string | number>; i?: number; s?: string };

export function say(m: Msg): string {
  if (typeof m === 'string') return m;
  let base: string;
  if (m.i === undefined) base = t(m.k, m.p);
  else {
    const list = ta(m.k);
    base = list.length ? list[m.i % list.length] : m.k;
  }
  return base + (m.s ?? '');
}

/** Font stack for UI text drawn on the canvas. */
export function uiFont(): string {
  if (lang === 'ar') return "'Baloo Bhaijaan 2', 'Fredoka', sans-serif";
  if (lang === 'hi' || lang === 'vi') return "'Baloo 2', 'Fredoka', sans-serif";
  return "'Fredoka', sans-serif";
}

/** Font stack for spooky titles: Creepster where it has the letters, otherwise a heavy rounded font. */
export function titleFont(): string {
  return lang === 'ar' || lang === 'hi' || lang === 'vi' ? uiFont() : "'Creepster', 'Fredoka', cursive";
}
