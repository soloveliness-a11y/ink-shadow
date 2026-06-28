import type { ClientIntent, ServerMessage } from '@mmg/schema';

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
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: ClientIntent[] = [];
  private static MAX_QUEUE = 200;
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
    // #6: 队列加上限,断网期间持续 push 不致 OOM;丢弃最旧意图(如已过期的投票)
    this.queue.push(intent);
    if (this.queue.length > GameConnection.MAX_QUEUE) {
      this.queue.splice(0, this.queue.length - GameConnection.MAX_QUEUE);
    }
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
    // #1: disconnect 后可能仍有已排队的重连回调,此处拦截避免建幽灵连接
    if (!this.shouldReconnect) return;
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
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (typeof msg === 'object' && msg !== null && 'kind' in msg) {
          this.listener(msg);
        }
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
    // #1: 保存 handle,disc/connect 期间可取消;doConnect 内也有 shouldReconnect 守卫
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const wait = this.retryDelay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.shouldReconnect) return;
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
