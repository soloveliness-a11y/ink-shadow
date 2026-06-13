import type { Script, ScriptMeta } from '@mmg/schema';
import type { ServerMessage } from '@mmg/schema';
import type { RuntimeState } from '@mmg/schema';
import { Room } from './Room.js';
import type { DmConfig } from '../dm/DmService.js';

/** 已完成房间最大存活时间(30 分钟) */
const FINISHED_ROOM_TTL_MS = 30 * 60_000;

/**
 * 房间池:管理所有活跃房间。剧本预加载进 registry,开房时按 id 取。
 */
export class RoomManager {
  private scripts = new Map<string, Script>();
  private rooms = new Map<string, Room>();
  private sendFn: (playerId: string, msg: ServerMessage) => void;
  private dmConfig: DmConfig | null;
  private cleanupHandle: ReturnType<typeof setInterval> | null = null;

  constructor(sendFn: (playerId: string, msg: ServerMessage) => void, dmConfig: DmConfig | null = null) {
    this.sendFn = sendFn;
    this.dmConfig = dmConfig;
    // 每 5 分钟清理一次已结束房间
    this.cleanupHandle = setInterval(() => this.cleanFinishedRooms(), 5 * 60_000);
  }

  /** 注册剧本(服务器启动时加载) */
  registerScript(script: Script): void {
    this.scripts.set(script.meta.id, script);
  }

  /** 创建房间(不绑定剧本,等房主选本) */
  createRoom(): { roomCode: string } {
    const room = new Room(this.sendFn, this.dmConfig);
    this.rooms.set(room.roomCode, room);
    return { roomCode: room.roomCode };
  }

  /** 获取房间 */
  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  /** 列出可用剧本元信息 */
  listScriptMetas(): ScriptMeta[] {
    return [...this.scripts.values()].map((s) => s.meta);
  }

  /** 获取剧本完整数据 */
  getScript(scriptId: string): Script | undefined {
    return this.scripts.get(scriptId);
  }

  /** 清理已结束 + 无在线玩家的房间 */
  private cleanFinishedRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const state = room.getState();
      if (state.status !== 'finished') continue;
      const anyOnline = state.players.some(p => p.connected);
      if (!anyOnline || (now - state.phaseRuntime.startedAt > FINISHED_ROOM_TTL_MS)) {
        this.rooms.delete(code);
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
}
