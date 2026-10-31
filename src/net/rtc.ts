import type { Channel, Transport } from './transport';

/**
 * WebRTC between two devices on the same Wi-Fi (or one phone's hotspot), with no server at all:
 * no STUN/TURN, so only local addresses are used, and the offer/answer travel as short codes (QR or copy/paste).
 */
export class RtcTransport implements Transport {
  onMessage: Transport['onMessage'] = () => {};
  onClose: Transport['onClose'] = () => {};
  private pc = new RTCPeerConnection({ iceServers: [] });
  private ch: Record<Channel, RTCDataChannel>;
  private open = true;
  /** Resolves once the reliable channel is open. */
  readonly ready: Promise<void>;

  private constructor() {
    // Negotiated channels with fixed ids: both sides create the same two, so nobody waits for `ondatachannel`.
    this.ch = {
      ctl: this.pc.createDataChannel('ctl', { negotiated: true, id: 0 }),
      state: this.pc.createDataChannel('state', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 }),
    };
    for (const name of ['ctl', 'state'] as Channel[]) {
      const c = this.ch[name];
      c.binaryType = 'arraybuffer';
      c.onmessage = (e: MessageEvent<string | ArrayBuffer>) => this.onMessage(name, e.data);
      c.onclose = () => this.close();
    }
    this.ready = new Promise((resolve) => {
      if (this.ch.ctl.readyState === 'open') resolve();
      else this.ch.ctl.addEventListener('open', () => resolve(), { once: true });
    });
    this.pc.addEventListener('connectionstatechange', () => {
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') this.close();
    });
  }

  /** Host: makes the offer code to show the other phone. */
  static async offer(): Promise<{ link: RtcTransport; code: string }> {
    const link = new RtcTransport();
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await gathered(link.pc);
    return { link, code: pack(link.pc.localDescription!) };
  }

  /** Guest: takes the host's offer code and makes the answer code to show back. */
  static async answer(offerCode: string): Promise<{ link: RtcTransport; code: string }> {
    const link = new RtcTransport();
    await link.pc.setRemoteDescription(unpack(offerCode, 'offer'));
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    await gathered(link.pc);
    return { link, code: pack(link.pc.localDescription!) };
  }

  /** Host: takes the guest's answer code. */
  async accept(answerCode: string) {
    await this.pc.setRemoteDescription(unpack(answerCode, 'answer'));
  }

  send(channel: Channel, data: string | Uint8Array<ArrayBuffer>) {
    const c = this.ch[channel];
    if (c.readyState !== 'open') return;
    try {
      // Two calls because send() is overloaded per data type.
      if (typeof data === 'string') c.send(data);
      else c.send(data);
    } catch {
      /* the channel is closing */
    }
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.ch.ctl.close();
    this.ch.state.close();
    this.pc.close();
    this.onClose();
  }
}

/** Waits for every local address to be known (no trickle ICE: the code is shown once). */
function gathered(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const timer = window.setTimeout(done, 3000);
    function done() {
      window.clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === 'complete') done();
    }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

// ------------------------------------------------------------ short codes

/**
 * A data-channel-only session description boils down to a handful of values; everything else is the same
 * every time and is rebuilt from a template. `HM1~setup~ufrag~pwd~fingerprint~mid~candidates`.
 */
const PREFIX = 'HM1';
const SEP = '~';

function pack(d: RTCSessionDescription): string {
  const get = (key: string) => d.sdp.match(new RegExp(`^a=${key}:(.*)$`, 'm'))?.[1].trim() ?? '';
  const fp = get('fingerprint').split(' ');
  if (fp[0]?.toLowerCase() !== 'sha-256' || !fp[1]) throw new Error('Unsupported fingerprint');
  const cands: string[] = [];
  for (const line of d.sdp.split(/\r?\n/)) {
    const m = line.match(/^a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host/i);
    if (m && !cands.some((c) => c === `${m[1]}_${m[2]}`)) cands.push(`${m[1]}_${m[2]}`);
  }
  return [PREFIX, get('setup'), get('ice-ufrag'), get('ice-pwd'), hexToB64(fp[1]), get('mid'), cands.join(',')].join(SEP);
}

function unpack(code: string, type: 'offer' | 'answer'): RTCSessionDescriptionInit {
  const parts = code.trim().split(SEP);
  if (parts.length !== 7 || parts[0] !== PREFIX) throw new Error('Not a Halloween Minder code');
  const [, setup, ufrag, pwd, fp, mid, list] = parts;
  const cands = list ? list.split(',') : [];
  const lines = [
    'v=0',
    `o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    `a=group:BUNDLE ${mid}`,
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...cands.map((c, i) => {
      const at = c.lastIndexOf('_');
      return `a=candidate:${i + 1} 1 udp ${2122260223 - i} ${c.slice(0, at)} ${c.slice(at + 1)} typ host generation 0`;
    }),
    'a=end-of-candidates',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    `a=fingerprint:sha-256 ${b64ToHex(fp)}`,
    `a=setup:${setup}`,
    `a=mid:${mid}`,
    'a=sctp-port:5000',
    'a=max-message-size:262144',
  ];
  return { type, sdp: `${lines.join('\r\n')}\r\n` };
}

function hexToB64(hex: string): string {
  const bytes = hex.split(':').map((h) => parseInt(h, 16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64ToHex(b64: string): string {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return [...bin].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(':');
}

/** True if this looks like one of our codes (so the scanner can ignore other QR codes). */
export const isCode = (text: string) => text.trim().startsWith(PREFIX + SEP);
