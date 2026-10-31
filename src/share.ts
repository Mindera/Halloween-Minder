import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { SHARE_URL } from './config';
import { isRtl, t, titleFont, uiFont } from './i18n';

export interface ShareInfo {
  score: number;
  level: number;
  minderName: string;
  minderImg: HTMLImageElement;
  won: boolean;
  /** Set for the Daily Challenge: the UTC day and how many stages were cleared. */
  daily?: { day: string; stages: number; total: number };
  /** Player 2's minder name in co-op. */
  partnerName?: string;
}

export function gameUrl(): string {
  const { protocol, href } = window.location;
  if (Capacitor.isNativePlatform() || !protocol.startsWith('http') || /localhost|127\.0\.0\.1/.test(href)) return SHARE_URL;
  return href.split('#')[0].split('?')[0];
}

export function shareText(i: ShareInfo): string {
  const score = i.score.toLocaleString('en-US');
  const who = i.partnerName ? t('share.and', { a: i.minderName, b: i.partnerName }) : i.minderName;
  if (i.daily) {
    return i.daily.stages >= i.daily.total
      ? t('share.dailyCleared', { day: i.daily.day, score, who })
      : t('share.dailyStage', { n: i.daily.stages + 1, total: i.daily.total, day: i.daily.day, score, who });
  }
  const key = i.won ? 'share.won' : 'share.score';
  return t(i.partnerName ? `${key}Team` : key, { score, level: i.level, who });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** A square image card for social sharing. */
export async function buildCard(i: ShareInfo): Promise<Blob | null> {
  const S = 1080;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  await document.fonts?.ready;
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#0d0221');
  grad.addColorStop(0.6, '#1a0b2e');
  grad.addColorStop(1, '#3d1257');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 160; k++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.7})`;
    g.fillRect(Math.random() * S, Math.random() * S * 0.7, 2, 2);
  }
  g.shadowColor = '#fff5c0';
  g.shadowBlur = 60;
  g.fillStyle = '#fff3c4';
  g.beginPath();
  g.arc(880, 170, 90, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = isRtl() ? 'rtl' : 'ltr';
  await document.fonts?.load(`700 40px ${uiFont()}`, t('card.challenge')).catch(() => undefined);
  const fit = (text: string, max: number) => {
    // Shrink long translations so they stay inside the card.
    const w = g.measureText(text).width;
    if (w > max) g.font = g.font.replace(/(\d+)px/, (_, px) => `${Math.floor((Number(px) * max) / w)}px`);
  };
  g.fillStyle = '#ff7b00';
  g.shadowColor = 'rgba(255,123,0,0.8)';
  g.shadowBlur = 30;
  g.font = `120px ${titleFont()}`;
  fit(t('card.happy'), S - 80);
  g.fillText(t('card.happy'), S / 2, 150);
  g.fillStyle = '#ffd400';
  g.font = `84px ${titleFont()}`;
  fit(t('card.love'), S - 120);
  g.fillText(t('card.love'), S / 2, 262);
  g.shadowBlur = 0;

  const img = i.minderImg;
  if (img.complete && img.naturalWidth) {
    const h = 330;
    const w = (h * img.naturalWidth) / img.naturalHeight;
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 30;
    g.drawImage(img, S / 2 - w / 2, 330, w, h);
    g.shadowBlur = 0;
  }

  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath();
  g.roundRect(140, 700, 800, 210, 40);
  g.fill();
  g.fillStyle = '#c9b8e0';
  g.font = `600 40px ${uiFont()}`;
  const who = i.partnerName ? t('share.and', { a: i.minderName, b: i.partnerName }) : i.minderName;
  const sub = i.daily
    ? t('card.daily', {
        day: i.daily.day,
        status: i.daily.stages >= i.daily.total ? t('card.dailyCleared') : t('card.dailyStage', { n: i.daily.stages + 1, total: i.daily.total }),
      })
    : i.won
      ? t('card.allBeaten')
      : t('card.level', { who: who.toLocaleUpperCase(), n: i.level });
  fit(sub, 780);
  g.fillText(sub, S / 2, 745);
  g.fillStyle = '#ffd400';
  g.font = `700 120px ${uiFont()}`;
  g.fillText(i.score.toLocaleString('en-US'), S / 2, 840);

  g.fillStyle = '#fff8ec';
  g.font = `600 38px ${uiFont()}`;
  fit(t('card.challenge'), S - 80);
  g.fillText(t('card.challenge'), S / 2, 950);
  const logo = await loadImage(`${import.meta.env.BASE_URL}mindera-logo.png`);
  if (logo) g.drawImage(logo, S / 2 - 80, 985, 160, (160 * logo.height) / logo.width);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

export type ShareResult = 'shared' | 'fallback' | 'cancelled';

export async function shareScore(i: ShareInfo, card: Blob | null): Promise<ShareResult> {
  const text = shareText(i);
  const url = gameUrl();
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title: 'Halloween Minder', text, url, dialogTitle: t('share.dialogTitle') });
      return 'shared';
    }
    if (card && navigator.canShare) {
      const file = new File([card], 'halloween-minder-score.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Halloween Minder', text: `${text} ${url}` });
        return 'shared';
      }
    }
    if (navigator.share) {
      await navigator.share({ title: 'Halloween Minder', text, url });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    if (e instanceof Error && /cancel/i.test(e.message)) return 'cancelled';
  }
  return 'fallback';
}

export function fallbackLinks(i: ShareInfo) {
  const text = shareText(i);
  const url = gameUrl();
  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    copy: `${text} ${url}`,
  };
}
