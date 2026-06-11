import type { ClientIntent, ServerMessage } from '@mmg/schema';
import { zServerMessage } from '@mmg/schema';

type Listener = (msg: ServerMessage) => void;
type OpenListener = () => void;
type StatusListener = (status: ConnectionStatus) => void;

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/**
 * WebSocket 连接管理器。
 * 自动重连(指数退避),收 ServerMessage 派发给 listener。
 */
export class GameConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private listener: Listener;
  private onOpen?: OpenListener;
  private retryDelay = 1000;
  private maxRetry = 8000;
  private shouldReconnect = false;
  private queue: ClientIntent[] = [];
  private status: ConnectionStatus = 'disconnected';
  private statusListeners = new Set<StatusListener>();
  private lastReconnectAt = 0;

  constructor(url: string, listener: Listener, onOpen?: OpenListener) {
    this.url = url;
    this.listener = listener;
    this.onOpen = onOpen;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.setStatus('connecting');
    this.doConnect();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.retryDelay = 1000;
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  send(intent: ClientIntent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(intent));
      return;
    }
    this.queue.push(intent);
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentStatus(): ConnectionStatus {
    return this.status;
  }

  /** 订阅连接状态变化(用于 UI 显示重连/掉线徽章)。 */
  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const fn of this.statusListeners) fn(next);
  }

  private doConnect(): void {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.retryDelay = 1000;
      this.lastReconnectAt = Date.now();
      this.setStatus('connected');
      this.onOpen?.();
      this.flushQueue();
    };

    this.ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data as string);
        const result = zServerMessage.safeParse(parsed);
        if (!result.success) return; // 丢弃畸形消息
        this.listener(result.data);
      } catch {
        /* ignore malformed */
      }
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        this.setStatus(this.lastReconnectAt > 0 ? 'reconnecting' : 'connecting');
        this.scheduleReconnect();
      } else {
        this.setStatus('disconnected');
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private scheduleReconnect(): void {
    const wait = this.retryDelay;
    setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetry);
      this.doConnect();
    }, wait);
  }

  private flushQueue(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const pending = this.queue.splice(0);
    for (const intent of pending) {
      this.ws.send(JSON.stringify(intent));
    }
  }
}

export function createGameUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${path}`;
}
