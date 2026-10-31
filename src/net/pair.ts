import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { t } from '../i18n';
import { RtcTransport, isCode } from './rtc';
import { LoopbackTransport, type Transport } from './transport';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** How long the host waits for the link after reading the answer code. */
const CONNECT_MS = 15000;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = (new (opts: { formats: string[] }) => BarcodeDetectorLike) & { getSupportedFormats?(): Promise<string[]> };

/**
 * The pairing screen: the host shows a QR code, the guest scans it and shows one back, the host scans that.
 * Without a camera, the same codes can be copied and pasted (for example through a chat app).
 */
export class PairScreen {
  onConnected?: (link: Transport, host: boolean) => void;
  private abort: AbortController | null = null;
  private pending: RtcTransport | null = null;
  private stream: MediaStream | null = null;
  private myCode = '';
  private gotCode: ((code: string) => void) | null = null;

  constructor(
    private toast: (text: string, color?: string) => void,
    /** Development: pair two tabs of this browser instead (`?net=loop`). */
    private loop: boolean,
  ) {
    const click = (id: string, fn: () => void) => $(id).addEventListener('click', fn);
    click('btn-net-host', () => void this.run(true));
    click('btn-net-join', () => void this.run(false));
    click('btn-net-scan', () => void this.scan());
    click('btn-net-copy', () => void this.copy());
    click('btn-net-paste', () => {
      $('net-paste').hidden = false;
      $<HTMLTextAreaElement>('net-paste-text').focus();
    });
    click('btn-net-paste-ok', () => {
      const box = $<HTMLTextAreaElement>('net-paste-text');
      this.offer(box.value);
    });
  }

  open() {
    this.cancel();
    this.view('roles');
    this.msg(t('net.intro'));
  }

  /** Stops whatever is going on (camera, half-made link). */
  cancel() {
    this.abort?.abort();
    this.abort = null;
    this.stopScan();
    this.pending?.close();
    this.pending = null;
    this.gotCode = null;
  }

  private async run(host: boolean) {
    this.cancel();
    const ac = new AbortController();
    this.abort = ac;
    try {
      const link = this.loop ? await this.pairLoop(host, ac.signal) : host ? await this.pairHost(ac.signal) : await this.pairGuest(ac.signal);
      if (ac.signal.aborted) return;
      this.pending = null;
      this.abort = null;
      this.stopScan();
      this.onConnected?.(link, host);
    } catch (e) {
      if (ac.signal.aborted) return;
      console.warn('[net] pairing failed', e);
      this.cancel();
      this.view('roles');
      this.msg(t('net.failed'));
    }
  }

  private async pairLoop(host: boolean, signal: AbortSignal) {
    this.view('busy');
    this.msg(t('net.loopWait'));
    return LoopbackTransport.connect(host ? 'host' : 'guest', signal);
  }

  private async pairHost(signal: AbortSignal) {
    this.view('busy');
    this.msg(t('net.preparing'));
    const { link, code } = await RtcTransport.offer();
    this.pending = link;
    if (signal.aborted) throw abortError();
    await this.showCode(code);
    this.view('host');
    this.msg(t('net.hostShow'));
    const answer = await this.waitCode(signal);
    this.stopScan();
    this.view('busy');
    this.msg(t('net.connecting'));
    await link.accept(answer);
    await withTimeout(link.ready, CONNECT_MS, signal);
    return link;
  }

  private async pairGuest(signal: AbortSignal) {
    this.view('guest');
    this.msg(t('net.joinScan'));
    void this.scan();
    const offer = await this.waitCode(signal);
    this.msg(t('net.preparing'));
    // Answer while the camera is still on: browsers then share the real local address instead of a
    // hidden .local name, which helps on networks that block those names.
    const { link, code } = await RtcTransport.answer(offer);
    this.pending = link;
    this.stopScan();
    if (signal.aborted) throw abortError();
    await this.showCode(code);
    this.view('show');
    this.msg(t('net.joinShow'));
    await withAbort(link.ready, signal);
    return link;
  }

  /** Resolves with the next valid code from the camera or the paste box. */
  private waitCode(signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(abortError()), { once: true });
      this.gotCode = (code) => {
        this.gotCode = null;
        resolve(code);
      };
    });
  }

  private offer(text: string) {
    if (!isCode(text)) {
      this.toast(t('net.badCode'), '#ff8a80');
      return;
    }
    $<HTMLTextAreaElement>('net-paste-text').value = '';
    $('net-paste').hidden = true;
    this.gotCode?.(text.trim());
  }

  // ------------------------------------------------------------ screen parts

  /** roles: Host/Join · busy: just a message · host: own code + scan/paste · guest: camera + paste · show: own code. */
  private view(v: 'roles' | 'busy' | 'host' | 'guest' | 'show') {
    $('net-roles').hidden = v !== 'roles';
    $('net-qr').hidden = v !== 'host' && v !== 'show';
    $('btn-net-scan').hidden = v !== 'host';
    $('btn-net-copy').hidden = v !== 'host' && v !== 'show';
    $('btn-net-paste').hidden = v !== 'host' && v !== 'guest';
    $('net-paste').hidden = true;
    if (v !== 'guest' && v !== 'host') this.stopScan();
  }

  private msg(text: string) {
    $('net-msg').textContent = text;
  }

  private async showCode(code: string) {
    this.myCode = code;
    const { default: qrcode } = await import('qrcode-generator');
    const qr = qrcode(0, 'L');
    qr.addData(code, 'Byte');
    qr.make();
    $('net-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  }

  private async copy() {
    const code = this.myCode;
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ text: code, dialogTitle: t('net.copy') });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        this.toast(t('net.copied'), '#69f0ae');
        return;
      }
      await navigator.share?.({ text: code });
    } catch {
      /* cancelled */
    }
  }

  // ------------------------------------------------------------ camera

  private async scan() {
    if (this.stream) return;
    const signal = this.abort?.signal;
    const video = $<HTMLVideoElement>('net-video');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!signal || signal.aborted) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      this.stream = stream;
      video.srcObject = stream;
      // The host's own code stays on screen above the camera: the partner may not have scanned it yet.
      $('net-scanner').hidden = false;
      $('btn-net-scan').hidden = true;
      await video.play();
      const read = await reader();
      while (this.stream === stream) {
        const text = await read(video).catch(() => null);
        if (text && isCode(text) && this.gotCode) {
          this.gotCode(text.trim());
          return;
        }
        await new Promise((r) => window.setTimeout(r, 150));
      }
    } catch (e) {
      if (signal?.aborted) return;
      console.warn('[net] camera', e);
      this.stopScan();
      this.toast(t('net.noCamera'), '#ffcc80');
      $('net-paste').hidden = false;
    }
  }

  private stopScan() {
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    const video = $<HTMLVideoElement>('net-video');
    video.srcObject = null;
    $('net-scanner').hidden = true;
  }
}

/** Reads a QR code from a video frame: the built-in detector where there is one (Android), jsQR otherwise (iOS). */
async function reader(): Promise<(v: HTMLVideoElement) => Promise<string | null>> {
  const BD = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (BD && (await BD.getSupportedFormats?.().catch((): string[] => []))?.includes('qr_code')) {
    const d = new BD({ formats: ['qr_code'] });
    return async (v) => (await d.detect(v))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import('jsqr');
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true })!;
  return async (v) => {
    if (!v.videoWidth) return null;
    const s = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * s);
    c.height = Math.round(v.videoHeight * s);
    g.drawImage(v, 0, 0, c.width, c.height);
    const img = g.getImageData(0, 0, c.width, c.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

const abortError = () => new DOMException('Cancelled', 'AbortError');

function withAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(abortError()), { once: true });
    p.then(resolve, reject);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return withAbort(
    Promise.race([p, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), ms))]),
    signal,
  );
}
