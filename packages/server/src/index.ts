import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { loadScript } from './loader.js';
import { RoomManager } from './room/RoomManager.js';
import { resolveDir, safeResolve } from './static.js';
import type { ClientIntent, ServerMessage } from '@mmg/schema';
import { zClientIntent, PROTOCOL_VERSION } from '@mmg/schema';
import type { LoadedScript } from './loader.js';

const PORT = Number(process.env.PORT ?? 8080);
// 支持绝对路径(部署友好)或相对 server 源码位置(P1-4)
const SCRIPT_DIR = resolveDir(process.env.SCRIPT_DIR ?? '../../../content', import.meta.url);
const CLIENT_DIR = resolveDir(process.env.CLIENT_DIR ?? '../../client/dist', import.meta.url);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
};

/** 扫描 content 目录,加载所有有效剧本包 */
function scanScripts(absBase: string): LoadedScript[] {
  const results: LoadedScript[] = [];
  if (!existsSync(absBase)) return results;

  for (const entry of readdirSync(absBase, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const dir = join(absBase, entry.name);
    const metaPath = join(dir, 'meta.json');
    const scriptPath = join(dir, 'script.json');

    if (existsSync(metaPath)) {
      // 新格式：拆分目录结构
      try {
        results.push(loadScript(metaPath));
      } catch (err) {
        console.warn(`  skip ${entry.name}: ${err instanceof Error ? err.message : err}`);
      }
    } else if (existsSync(scriptPath)) {
      // 旧格式：单一 script.json
      try {
        results.push(loadScript(scriptPath));
      } catch (err) {
        console.warn(`  skip ${entry.name}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Fallback: if nothing found, try _mock (dev helper)
  if (results.length === 0) {
    const mockDir = join(absBase, '_mock');
    if (existsSync(join(mockDir, 'meta.json'))) {
      results.push(loadScript(join(mockDir, 'meta.json')));
    } else if (existsSync(join(mockDir, 'script.json'))) {
      results.push(loadScript(join(mockDir, 'script.json')));
    }
  }
  return results;
}

/** 简易静态文件服务 */
function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;

  // /content/<scriptId>/... → content 目录,显式越界校验(P1-3)
  if (path.startsWith('/content/')) {
    const rel = path.replace(/^\/content\//, '');
    const filePath = safeResolve(SCRIPT_DIR, rel);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    serveFile(filePath, req, res);
    return;
  }

  // /ws → skip (handled by upgrade)
  if (path === '/ws') {
    res.writeHead(400);
    res.end('Use WebSocket');
    return;
  }

  // Everything else → client dist,同样走越界校验(P1-3)
  const requested = safeResolve(CLIENT_DIR, path === '/' ? 'index.html' : path);
  if (!requested) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // SPA fallback: if file doesn't exist, serve index.html
  if (!existsSync(requested) || statSync(requested).isDirectory()) {
    serveFile(join(CLIENT_DIR, 'index.html'), req, res);
    return;
  }

  serveFile(requested, req, res);
}

function serveFile(absPath: string, req: IncomingMessage, res: ServerResponse) {
  if (!existsSync(absPath) || !statSync(absPath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = extname(absPath).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  const stat = statSync(absPath);
  const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;

  // ETag 缓存:客户端发 If-None-Match → 304 节省带宽
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304);
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    'ETag': etag,
  });
  createReadStream(absPath).pipe(res);
}

export function startServer(): void {
  // 1. 加载剧本
  const scripts = scanScripts(SCRIPT_DIR);
  if (scripts.length === 0) {
    console.error('No scripts found in content directory.');
    process.exit(1);
  }
  console.log(`Loaded ${scripts.length} script(s): ${scripts.map(s => s.script.meta.title).join(', ')}`);
  const firstScriptId = scripts[0]!.script.meta.id;

  // 2. Room manager
  const playerIdx = new Map<string, Session>();
  const sendFn = (playerId: string, msg: ServerMessage) => {
    let session = playerIdx.get(playerId);
    // Pending join: playerId not yet indexed — scan by null + roomCode
    if (!session) {
      session = [...sessions.values()].find(s => s.playerId === null && s.roomCode);
      if (session) {
        session.playerId = playerId;
        playerIdx.set(playerId, session);
      }
    }
    if (session?.ws.readyState === WebSocket.OPEN) session.ws.send(JSON.stringify(msg));
  };
  const manager = new RoomManager(sendFn);
  for (const { script } of scripts) manager.registerScript(script);
  const scriptMetas = manager.listScriptMetas();

  // 3. HTTP server (static + WS upgrade)
  const server = createServer(serveStatic);

  const wss = new WebSocketServer({ noServer: true });
  const sessions = new Map<WebSocket, Session>();

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', ws => {
    const session: Session = { ws, playerId: null, roomCode: null, isAlive: true, msgCount: 0, msgWindowStart: Date.now() };
    sessions.set(ws, session);
    console.log(`+ connection (${sessions.size} total)`);

    // 心跳:收到 pong 标记存活。隧道/移动网络会回收空闲连接,靠 ping/pong 探活。
    ws.on('pong', () => { session.isAlive = true; });

    ws.on('message', raw => {
      // 速率限制:窗口内消息过多则踢掉
      const now = Date.now();
      if (now - session.msgWindowStart > RATE_LIMIT_WINDOW) {
        session.msgWindowStart = now;
        session.msgCount = 0;
      }
      session.msgCount++;
      if (session.msgCount > RATE_LIMIT_MAX) {
        send(ws, { kind: 'error', code: 'rate_limited', message: '消息过于频繁,请稍后再试' });
        ws.terminate();
        return;
      }

      let parsed: unknown;
      try { parsed = JSON.parse(raw.toString()); }
      catch { send(ws, { kind: 'error', code: 'parse_error', message: 'Invalid JSON' }); return; }
      // Zod 校验:拒绝畸形/恶意输入
      const result = zClientIntent.safeParse(parsed);
      if (!result.success) {
        send(ws, { kind: 'error', code: 'invalid_intent', message: 'Malformed intent' });
        return;
      }
      const intent = result.data;
      // 空文本拦截(发言/私信/理论)
      if ('text' in intent && typeof intent.text === 'string' && intent.text.trim().length === 0) {
        send(ws, { kind: 'error', code: 'empty_text', message: '文本不能为空' });
        return;
      }
      handleIntent(manager, session, intent, firstScriptId, playerIdx);
    });

    ws.on('close', () => {
      sessions.delete(ws);
      if (session.playerId) playerIdx.delete(session.playerId);
      if (session.roomCode && session.playerId) {
        manager.getRoom(session.roomCode)?.disconnect(session.playerId);
      }
      console.log(`- connection (${sessions.size} remaining)`);
    });
  });

  // 心跳巡检:每 30s 一轮。上轮未回 pong 的连接判定为死,terminate 触发客户端重连。
  const HEARTBEAT_MS = 30_000;
  const heartbeat = setInterval(() => {
    for (const [ws, session] of sessions) {
      if (!session.isAlive) { ws.terminate(); continue; }
      session.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  server.listen(PORT, () => {
    console.log(`Murder Mystery Game at http://localhost:${PORT}`);
    console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`  Scripts: ${scripts.map(s => s.script.meta.id).join(', ')}`);
  });
}

interface Session { ws: WebSocket; playerId: string | null; roomCode: string | null; isAlive: boolean; msgCount: number; msgWindowStart: number }

const RATE_LIMIT_WINDOW = 10_000; // 10s 窗口
const RATE_LIMIT_MAX = 40; // 窗口内最大消息数

function handleIntent(manager: RoomManager, session: Session, intent: ClientIntent, _fallbackScriptId: string, playerIdx: Map<string, Session>): void {
  switch (intent.kind) {
    case 'join': {
      // 协议版本校验:旧前端连新 server → 提示刷新,不继续 join(防静默故障)
      const cv = (intent as { clientVersion?: number }).clientVersion;
      if (typeof cv === 'number' && cv !== PROTOCOL_VERSION) {
        send(session.ws, { kind: 'error', code: 'version_mismatch', message: '游戏已更新,请刷新页面' });
        return;
      }
      let roomCode = intent.roomCode;
      let room = roomCode !== 'NEW' ? manager.getRoom(roomCode) : undefined;

      if (!room) {
        const created = manager.createRoom();
        roomCode = created.roomCode;
        room = manager.getRoom(roomCode)!;
        // 注入剧本查询能力
        room.setScriptProvider(manager.listScriptMetas(), (id) => manager.getScript(id));
      }

      // Pre-set roomCode so sendFn can find this session during room.join()
      session.roomCode = roomCode;

      const result = room.join(intent.nickname, intent.sessionToken);
      if ('error' in result) {
        session.roomCode = null;
        // 透传真实错误码(kicked/room_full/room_not_joinable),供前端映射中文 + 识别被踢
        send(session.ws, { kind: 'error', code: result.error, message: result.error });
        return;
      }
      if (!session.playerId) {
        session.playerId = result.playerId;
        playerIdx.set(result.playerId, session);
      }
      break;
    }
    case 'selectScript': {
      if (!session.roomCode || !session.playerId) return notInRoom(session.ws);
      const room = manager.getRoom(session.roomCode);
      if (!room) return;
      const result = room.selectScript(session.playerId, intent.scriptId);
      if (result.error) send(session.ws, { kind: 'error', code: 'script_select_failed', message: result.error });
      return;
    }
    case 'selectChar': {
      if (!session.roomCode || !session.playerId) return notInRoom(session.ws);
      const room = manager.getRoom(session.roomCode);
      if (!room) return;
      const result = room.selectChar(session.playerId, intent.charId);
      if (result.error) send(session.ws, { kind: 'error', code: result.error, message: result.error });
      break;
    }
    case 'startTest': {
      if (!session.roomCode || !session.playerId) return notInRoom(session.ws);
      const room = manager.getRoom(session.roomCode);
      if (!room) return;
      const result = room.startTestMode(session.playerId);
      if (result.error) send(session.ws, { kind: 'error', code: 'test_failed', message: result.error });
      return;
    }
    case 'kickPlayer': {
      if (!session.roomCode || !session.playerId) return notInRoom(session.ws);
      const room = manager.getRoom(session.roomCode);
      if (!room) return;
      const result = room.kick(session.playerId, intent.targetPlayerId);
      if (result.error) send(session.ws, { kind: 'error', code: result.error, message: result.error });
      return;
    }
    default: {
      if (!session.roomCode || !session.playerId) return notInRoom(session.ws);
      const room = manager.getRoom(session.roomCode);
      if (!room) return;
      const result = room.handleIntent(session.playerId, intent);
      if (result.error) send(session.ws, { kind: 'error', code: 'action_failed', message: result.error });
      break;
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function notInRoom(ws: WebSocket): void {
  send(ws, { kind: 'error', code: 'not_in_room', message: 'Please join a room first' });
}

startServer();
