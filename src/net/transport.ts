/** `ctl` is reliable and ordered; `state` is fast but may drop or reorder messages. */
export type Channel = 'ctl' | 'state';

/** A two-way link to the other phone. */
export interface Transport {
  send(channel: Channel, data: string | Uint8Array<ArrayBuffer>): void;
  onMessage: (channel: Channel, data: string | ArrayBuffer) => void;
  /** The link is gone (closed by either side, or the network dropped). Called at most once. */
  onClose: () => void;
  close(): void;
}

type Packet = { from: string; hi?: boolean; bye?: boolean; ch?: Channel; data?: string | Uint8Array<ArrayBuffer> };

/** Two tabs of the same browser talking over a BroadcastChannel, for development (`?net=loop`). */
export class LoopbackTransport implements Transport {
  onMessage: Transport['onMessage'] = () => {};
  onClose: Transport['onClose'] = () => {};
  private bc = new BroadcastChannel('hm-net-loop');
  private open = true;

  private constructor(private side: 'host' | 'guest') {}

  /** Resolves once a tab playing the other side shows up. */
  static connect(side: 'host' | 'guest', signal: AbortSignal): Promise<LoopbackTransport> {
    const link = new LoopbackTransport(side);
    return new Promise((resolve, reject) => {
      const hello = window.setInterval(() => link.bc.postMessage({ from: side, hi: true } satisfies Packet), 300);
      signal.addEventListener('abort', () => {
        window.clearInterval(hello);
        link.bc.close();
        reject(new DOMException('Cancelled', 'AbortError'));
      });
      link.bc.onmessage = (e: MessageEvent<Packet>) => {
        if (e.data.from === side || !e.data.hi) return;
        window.clearInterval(hello);
        link.bc.postMessage({ from: side, hi: true } satisfies Packet);
        link.bc.onmessage = (ev: MessageEvent<Packet>) => link.receive(ev.data);
        resolve(link);
      };
    });
  }

  private receive(p: Packet) {
    if (p.from === this.side || p.hi) return;
    if (p.bye) {
      this.close();
      return;
    }
    const d = p.data!;
    this.onMessage(p.ch!, typeof d === 'string' ? d : d.buffer);
  }

  send(ch: Channel, data: string | Uint8Array<ArrayBuffer>) {
    if (this.open) this.bc.postMessage({ from: this.side, ch, data } satisfies Packet);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.bc.postMessage({ from: this.side, bye: true } satisfies Packet);
    this.bc.close();
    this.onClose();
  }
}
