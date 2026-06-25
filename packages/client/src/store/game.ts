import { create } from 'zustand';
import type { ClientStateView, ClientIntent, GameEvent, ServerMessage } from '@mmg/schema';
import { PROTOCOL_VERSION } from '@mmg/schema';
import { GameConnection, createGameUrl, type ConnectionStatus } from '../net/connection.js';
import { pushToast } from '../lib/toast.js';
import { friendlyError } from '../lib/errorMap.js';
import { assetUrl } from '../lib/asset.js';

interface GameState {
  connected: boolean;
  connectionStatus: ConnectionStatus;
  playerId: string | null;
  sessionToken: string | null;
  roomCode: string | null;
  nickname: string | null;
  view: ClientStateView | null;
  events: GameEvent[];
  privateMessages: Array<{ fromCharId: string; toCharId: string; text: string; ts: number }>;
  dmNarratives: Array<{ text: string; charId?: string; ts: number }>;
  error: string | null;
  conn: GameConnection | null;
  /** 已看到的 phase_enter event key,避免重复 toast */
  seenPhaseKey: string | null;

  // Actions
  connect: (url?: string) => void;
  disconnect: () => void;
  send: (intent: ClientIntent) => void;
  joinRoom: (roomCode: string, nickname: string) => void;
}

const MAX_EVENTS = 200;
const MAX_PRIVATE = 100;
let phaseToastTimer: number | undefined;

/**
 * 后台预加载剧本图片资源。优先级:头像 > 场景 > 线索缩略图。
 * 用 new Image() 触发浏览器缓存,不阻塞渲染。
 * 保持引用防止 GC 回收导致预加载被取消。
 */
const preloadedImages: HTMLImageElement[] = [];
function preloadAssets(view: ClientStateView): void {
  const scriptId = view.selectedScript?.id;
  if (!scriptId) return;

  const urls: string[] = [];

  // 头像(最高优先)
  for (const c of view.publicCharacters) {
    const u = assetUrl(scriptId, c.avatar);
    if (u) urls.push(u);
  }

  // 场景图
  for (const sc of view.publicScenes ?? []) {
    const u = assetUrl(scriptId, sc.image);
    if (u) urls.push(u);
  }

  // 已获取线索缩略图
  for (const cl of view.self?.myClues ?? []) {
    const u = assetUrl(scriptId, cl.visual?.asset?.path);
    if (u) urls.push(u);
  }

  // 后台拉取,持有引用防止 GC 中断加载
  // 先构建新数组再一次性替换,避免清空在途图片引用
  const fresh: HTMLImageElement[] = [];
  for (const url of urls) {
    const img = new Image();
    img.src = url;
    fresh.push(img);
  }
  preloadedImages.length = 0;
  preloadedImages.push(...fresh);
}

/**
 * 处理服务端推送消息,驱动 store 状态变更。
 * 提取为独立函数以便单元测试。
 */
export function handleServerMessage(
  msg: ServerMessage,
  getState: () => GameState,
  setState: (partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => void,
  exitKicked: () => void,
): void {
  switch (msg.kind) {
    case 'joined':
      setState((s) => {
        writeSession({
          roomCode: s.roomCode,
          nickname: s.nickname,
          sessionToken: msg.sessionToken,
        });
        return { playerId: msg.playerId, sessionToken: msg.sessionToken, connected: true, error: null };
      });
      break;
    case 'stateSync': {
      const newView = msg.view;
      const oldStatus = getState().view?.status;
      setState((s) => {
        writeSession({
          roomCode: newView.roomCode,
          nickname: s.nickname,
          sessionToken: s.sessionToken,
        });
        // 进入新 phase 时,如果是新 phaseId 则 toast 提示
        const phaseKey = newView.currentPhase ? `${newView.status}:${newView.currentPhase.id}` : null;
        const newPhase = phaseKey && phaseKey !== s.seenPhaseKey;
        // 微小延迟让 transition 跑完再 toast
        if (newPhase && phaseKey) {
          if (phaseToastTimer !== undefined) window.clearTimeout(phaseToastTimer);
          phaseToastTimer = window.setTimeout(() => {
            phaseToastTimer = undefined;
            const p = newView.currentPhase;
            if (!p) return;
            pushToast(`${p.title} · ${p.instruction}`, 'info', 4500);
          }, 350);
        }
        return {
          view: newView,
          roomCode: newView.roomCode,
          error: null,
          seenPhaseKey: phaseKey ?? s.seenPhaseKey,
        };
      });
      // 游戏开始(lobby/assigning → playing)时后台预加载资源
      if (newView.status === 'playing' && oldStatus && oldStatus !== 'playing') {
        preloadAssets(newView);
      }
      break;
    }
    case 'event':
      setState((s) => {
        const events = [...s.events, msg.event];
        if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
        return { events };
      });
      break;
    case 'privateMessage':
      setState((s) => {
        const list = [
          ...s.privateMessages,
          {
            fromCharId: msg.fromCharId,
            toCharId: currentCharId(s.view) ?? '',
            text: msg.text,
            ts: Date.now(),
          },
        ];
        if (list.length > MAX_PRIVATE) list.splice(0, list.length - MAX_PRIVATE);
        return { privateMessages: list };
      });
      break;
    case 'dmNarrative': {
      const dm = msg as { text: string; charId?: string };
      setState((s) => {
        const narrations = [...s.dmNarratives, { text: dm.text, charId: dm.charId, ts: Date.now() }];
        if (narrations.length > 50) narrations.splice(0, narrations.length - 50);
        return { dmNarratives: narrations };
      });
      break;
    }
    case 'keywordMemory':
      pushToast(`听到「${msg.keyword}」触发了一段记忆,已加入你的剧本`, 'info', 4000);
      break;
    case 'assigned':
      // assignment handled via stateSync
      break;
    case 'kicked':
      exitKicked();
      break;
    case 'error': {
      const code = (msg as { code?: string }).code;
      if (code === 'kicked') { exitKicked(); break; }
      setState({ error: friendlyError(code, msg.message) });
      pushToast(friendlyError(code, msg.message), 'error', 4000);
      break;
    }
  }
}

export const useGameStore = create<GameState>((set, get) => ({
  connected: false,
  connectionStatus: 'disconnected',
  playerId: null,
  sessionToken: null,
  roomCode: null,
  nickname: readSession().nickname,
  view: null,
  events: [],
  privateMessages: [],
  dmNarratives: [],
  error: null,
  conn: null,
  seenPhaseKey: null,

  connect: (url) => {
    // #3: 幂等守卫 — 已有连接时直接复用,避免 React 批处理下重复调用产生多条 WS + 多套重连
    const existing = get().conn;
    if (existing && (existing.connected || existing.currentStatus === 'connecting' || existing.currentStatus === 'reconnecting')) {
      return;
    }
    const wsUrl = url ?? createGameUrl('/ws');
    const saved = readSession();
    // 被踢:断连(停止自动重连)+ 清本地会话 + 回登录页
    const exitKicked = () => {
      get().conn?.disconnect();
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      set({ view: null, playerId: null, sessionToken: null, roomCode: null, conn: null, connected: false, connectionStatus: 'disconnected', error: null });
      pushToast('你已被房主移出房间', 'warn', 4000);
    };
    const conn = new GameConnection(wsUrl, (msg) => {
      handleServerMessage(msg, get, set, exitKicked);
    }, () => {
      const current = get();
      const roomCode = current.roomCode ?? saved.roomCode;
      const nickname = current.nickname ?? saved.nickname;
      const sessionToken = current.roomCode === 'NEW'
        ? undefined
        : current.roomCode && current.roomCode !== saved.roomCode
          ? current.sessionToken ?? undefined
          : current.sessionToken ?? saved.sessionToken;
      if (roomCode && nickname && sessionToken) {
        conn.send({ kind: 'join', roomCode, nickname, sessionToken, clientVersion: PROTOCOL_VERSION });
      }
    });

    // 订阅连接状态,触发 toast
    conn.onStatusChange((status) => {
      const prev = get().connectionStatus;
      set({ connectionStatus: status });
      if (status === 'reconnecting' && prev === 'connected') {
        pushToast('连接已断开,正在重连…', 'warn', 3000);
      } else if (status === 'connected' && (prev === 'reconnecting' || prev === 'connecting')) {
        // 只在确实经历掉线后才提示"重连成功",避免冷启动时刷屏
        if (prev === 'reconnecting') {
          pushToast('已重连', 'success', 1800);
        }
      }
    });

    conn.connect();
    set({
      conn,
      playerId: saved.sessionToken ?? null,
      sessionToken: saved.sessionToken ?? null,
      roomCode: saved.roomCode ?? null,
      nickname: saved.nickname ?? null,
    });
  },

  disconnect: () => {
    get().conn?.disconnect();
    set({ conn: null, connected: false, view: null, connectionStatus: 'disconnected' });
  },

  send: (intent) => {
    // C3: 断线期间发送非幂等操作时提示用户(消息会入队重连后发,但需让用户知晓)
    const conn = get().conn;
    const disconnected = conn && !conn.connected;
    if (disconnected) {
      const silentKinds = new Set(['join', 'configureDm']);
      if (!silentKinds.has(intent.kind)) {
        pushToast('连接中断,操作将在重连后发送', 'warn', 2500);
      }
    }
    conn?.send(intent);
    if (intent.kind === 'privateMessage') {
      const fromCharId = currentCharId(get().view);
      if (fromCharId) {
        set((s) => {
          const list = [
            ...s.privateMessages,
            { fromCharId, toCharId: intent.toCharId, text: intent.text, ts: Date.now() },
          ];
          if (list.length > MAX_PRIVATE) list.splice(0, list.length - MAX_PRIVATE);
          return { privateMessages: list };
        });
      }
    }
  },

  joinRoom: (roomCode, nickname) => {
    if (!get().conn) get().connect();
    const targetRoom = roomCode.trim() || 'NEW';
    const name = nickname.trim();
    const token = targetRoom !== 'NEW' && targetRoom === get().roomCode ? get().sessionToken ?? undefined : undefined;
    set({
      roomCode: targetRoom,
      nickname: name,
      sessionToken: token ?? null,
      playerId: token ?? null,
      view: null,
      error: null,
      seenPhaseKey: null,
    });
    get().conn?.send({ kind: 'join', roomCode: targetRoom, nickname: name, sessionToken: token, clientVersion: PROTOCOL_VERSION });
  },
}));

function currentCharId(view: ClientStateView | null): string | null {
  return view?.self?.charId ?? null;
}

const STORAGE_KEY = 'mmg:last-session';

function readSession(): { roomCode: string | null; nickname: string | null; sessionToken: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { roomCode: null, nickname: null, sessionToken: null };
    const parsed = JSON.parse(raw) as Partial<Record<'roomCode' | 'nickname' | 'sessionToken', string>>;
    return {
      roomCode: parsed.roomCode ?? null,
      nickname: parsed.nickname ?? null,
      sessionToken: parsed.sessionToken ?? null,
    };
  } catch {
    return { roomCode: null, nickname: null, sessionToken: null };
  }
}

function writeSession(session: { roomCode?: string | null; nickname?: string | null; sessionToken?: string | null }): void {
  try {
    const current = readSession();
    const next = {
      roomCode: session.roomCode ?? current.roomCode,
      nickname: session.nickname ?? current.nickname,
      sessionToken: session.sessionToken ?? current.sessionToken,
    };
    if (next.roomCode && next.nickname && next.sessionToken) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Browser storage can be disabled; reconnect simply becomes manual.
  }
}
