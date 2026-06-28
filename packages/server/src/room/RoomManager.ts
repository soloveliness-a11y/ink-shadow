import type { Script, ScriptMeta } from '@mmg/schema';
import type { ServerMessage, RoomSnapshot } from '@mmg/schema';
import { zRoomSnapshot } from '@mmg/schema';
import { Room } from './Room.js';
import type { DmConfig } from '../dm/DmService.js';
import { ensureDir, debouncedWrite, readJsonFile, scanDirectory, deleteFile, cancelDebouncedWrite } from '../persistence.js';
import { join } from 'node:path';

/** 已完成房间最大存活时间(30 分钟) */
const FINISHED_ROOM_TTL_MS = 30 * 60_000;

/**
 * 房间池:管理所有活跃房间。剧本预加载进 registry,开房时按 id 取。
 * 支持持久化到磁盘（JSON 文件），服务器重启后自动恢复。
 */
export class RoomManager {
  private scripts = new Map<string, Script>();
  private rooms = new Map<string, Room>();
  private sendFn: (playerId: string, msg: ServerMessage) => void;
  private dmConfig: DmConfig | null;
  private cleanupHandle: ReturnType<typeof setInterval> | null = null;
  private dataDir: string;

  constructor(sendFn: (playerId: string, msg: ServerMessage) => void, dmConfig: DmConfig | null = null, dataDir = 'data/rooms') {
    this.sendFn = sendFn;
    this.dmConfig = dmConfig;
    this.dataDir = dataDir;
    // 每 5 分钟清理一次已结束房间
    this.cleanupHandle = setInterval(() => this.cleanFinishedRooms(), 5 * 60_000);
  }

  /** 持久化数据目录（供优雅关机等外部场景使用） */
  get dataDirectory(): string { return this.dataDir; }

  /** 初始化持久化（异步）：创建目录 + 从磁盘恢复房间 */
  async initPersistence(): Promise<void> {
    await ensureDir(this.dataDir);
    await this.restoreFromDisk();
  }

  /** 注册剧本(服务器启动时加载) */
  registerScript(script: Script): void {
    this.scripts.set(script.meta.id, script);
  }

  /** 创建房间(不绑定剧本,等房主选本) */
  createRoom(): { roomCode: string } {
    // 防房间码碰撞:极低概率但一旦撞上会覆盖旧房间致全员掉线。重建直到不撞(上限 10 次兜底)。
    let room = new Room(this.sendFn, this.dmConfig);
    for (let i = 0; i < 10 && this.rooms.has(room.roomCode); i++) {
      room = new Room(this.sendFn, this.dmConfig);
    }
    if (this.rooms.has(room.roomCode)) {
      throw new Error('Failed to generate unique room code after 10 retries');
    }
    this.wirePersistence(room);
    this.rooms.set(room.roomCode, room);
    return { roomCode: room.roomCode };
  }

  /** 获取房间 */
  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  /** 列出可加入的公开房间 */
  listPublicRooms(): Array<{ roomCode: string; scriptTitle: string; playerCount: number; maxPlayers: number; hostName: string }> {
    const MAX_PLAYERS = 12;
    const results: Array<{ roomCode: string; scriptTitle: string; playerCount: number; maxPlayers: number; hostName: string }> = [];
    for (const [, room] of this.rooms) {
      const state = room.getState();
      if (state.status !== 'lobby') continue;
      const connectedCount = state.players.filter(p => p.connected).length;
      if (connectedCount >= MAX_PLAYERS) continue;
      const host = state.players.find(p => p.isHost);
      const script = room.getScript();
      results.push({
        roomCode: room.roomCode,
        scriptTitle: script?.meta.title ?? '未选剧本',
        playerCount: connectedCount,
        maxPlayers: MAX_PLAYERS,
        hostName: host?.nickname ?? '未知',
      });
    }
    return results;
  }

  /** 列出可用剧本元信息 */
  listScriptMetas(): ScriptMeta[] {
    return [...this.scripts.values()].map((s) => s.meta);
  }

  /** 获取剧本完整数据 */
  getScript(scriptId: string): Script | undefined {
    return this.scripts.get(scriptId);
  }

  /** 遍历所有房间（优雅关机时用） */
  *allRooms(): IterableIterator<[string, Room]> { yield* this.rooms; }

  /** 清理已结束 + 无在线玩家的房间,并检查掉线超时 */
  private cleanFinishedRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const state = room.getState();
      // 检查掉线超时自动踢出
      if (state.status === 'playing') {
        room.checkDisconnectedTimeout();
      }
      if (state.status !== 'finished') continue;
      const anyOnline = state.players.some(p => p.connected);
      if (!anyOnline || (now - state.phaseRuntime.startedAt > FINISHED_ROOM_TTL_MS)) {
        room.destroy();
        this.rooms.delete(code);
        this.removeSnapshot(code);
      }
    }
  }

  /** 停止清理定时器(测试用) */
  destroy(): void {
    if (this.cleanupHandle) {
      clearInterval(this.cleanupHandle);
      this.cleanupHandle = null;
    }
  }

  // ─── 持久化内部方法 ───

  /** 为房间绑定 broadcastState 后的持久化回调 */
  private wirePersistence(room: Room): void {
    room.setOnBroadcast(() => {
      const filePath = join(this.dataDir, `${room.roomCode}.json`);
      debouncedWrite(filePath, room.snapshot());
    });
  }

  /** 从磁盘恢复所有房间快照 */
  private async restoreFromDisk(): Promise<void> {
    const files = await scanDirectory(this.dataDir);
    if (files.length === 0) return;
    console.log(`  Restoring ${files.length} room(s) from disk...`);
    for (const filePath of files) {
      const data = await readJsonFile(filePath);
      if (!data) continue;
      try {
        const parsed = zRoomSnapshot.safeParse(data);
        if (!parsed.success) {
          console.warn(`    ✗ ${filePath}: invalid snapshot — ${parsed.error.issues.map(i => i.message).join(', ')}`);
          continue;
        }
        const snap = parsed.data;
        if (snap.version > 2) continue; // 拒绝未来版本;version 1(老)和 2(当前)都 restore(新字段全 optional,向前兼容)
        const room = Room.restore(snap, this.sendFn, (id) => this.getScript(id), this.listScriptMetas());
        this.wirePersistence(room);
        this.rooms.set(room.roomCode, room);
        console.log(`    ✓ ${room.roomCode} (${snap.state.status})`);
      } catch (err) {
        console.warn(`    ✗ ${filePath}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /** 删除房间快照文件（清理时调用） */
  removeSnapshot(roomCode: string): void {
    const filePath = join(this.dataDir, `${roomCode}.json`);
    cancelDebouncedWrite(filePath);
    deleteFile(filePath);
  }
}
