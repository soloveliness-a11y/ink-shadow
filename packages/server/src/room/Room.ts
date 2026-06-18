import { randomUUID } from 'node:crypto';
import type { Script, ScriptMeta, RuntimeState, ClientIntent, ServerMessage, RoomSnapshot } from '@mmg/schema';
import { PhaseEngine, type Broadcaster } from '../engine/PhaseEngine.js';
import { buildView, buildViewBatch } from '../view.js';
import { DmService, type DmConfig } from '../dm/DmService.js';
import { BotRunner } from './BotRunner.js';
import { SnapshotStore } from './SnapshotStore.js';

type SendFn = (playerId: string, msg: ServerMessage) => void;

/**
 * 单房间:可选本 → 角色分配 → 游戏运行。
 * 所有状态变更方法同步执行(单线程事件循环,无竞态)。
 *
 * 测试模式的 bot 自动行动 与 状态快照 已抽出独立类:
 *  - BotRunner:轮询调度 bot 在各环节的自动行为(见 BotRunner.ts)
 *  - SnapshotStore:测试回退用的状态快照栈(见 SnapshotStore.ts)
 */
export class Room {
  readonly roomCode: string;
  private script: Script | null = null;
  private hostId: string | null = null;
  private state: RuntimeState;
  private engine: PhaseEngine | null = null;
  private sendFn: SendFn;
  private playerSockets = new Map<string, { charId?: string }>();
  private isTestMode = false;
  private botIds: string[] = [];
  private availableScripts: ScriptMeta[] = [];
  private getScriptFn: ((scriptId: string) => Script | undefined) | null = null;
  private snapshots = new SnapshotStore();
  private botRunner = new BotRunner({
    getState: () => this.state,
    getScript: () => this.script,
    getEngine: () => this.engine,
    isTestMode: () => this.isTestMode,
    botIds: () => this.botIds,
  });
  private phaseHistory: string[] = [];
  private kickedTokens = new Set<string>();
  private dmService: DmService;
  private dmFullConfig: DmConfig | null = null;
  private onBroadcastFn: (() => void) | null = null;
  private static MAX_LOG = 500;

  constructor(sendFn: SendFn, dmConfig: DmConfig | null = null) {
    this.roomCode = generateRoomCode();
    this.sendFn = sendFn;
    this.dmService = new DmService(dmConfig);

    this.state = {
      roomCode: this.roomCode,
      scriptId: '',
      status: 'lobby',
      players: [],
      currentPhaseId: '',
      phaseRuntime: { phaseId: '', startedAt: Date.now(), actedCharIds: [] },
      revealedClues: [],
      acquiredClues: {},
      votes: {},
      theories: {},
      flags: {},
      teams: {},
      resources: {},
      counters: {},
      log: [],
    };
  }

  /** 设置剧本查询能力(由 RoomManager 注入) */

  /**
   * 销毁房间:清理 botRunner 轮询定时器与 engine 倒计时(B4)。
   * RoomManager 在移除房间(cleanFinishedRooms / 关机)前必须调用,
   * 否则测试模式的 bot setTimeout 会持续触达已废弃的房间直到进程退出。
   */
  destroy(): void {
    this.botRunner.stop();
    this.engine?.dispose();
  }
  setScriptProvider(metas: ScriptMeta[], getFn: (id: string) => Script | undefined): void {
    this.availableScripts = metas;
    this.getScriptFn = getFn;
  }

  /** 房主选择剧本(空 id = 取消选择) */
  selectScript(hostId: string, scriptId: string): { error?: string } {
    if (hostId !== this.hostId) return { error: 'not_host' };
    if (this.state.status !== 'lobby') return { error: 'not_in_lobby' };

    if (!scriptId) {
      // 取消选择
      this.script = null;
      this.state.scriptId = '';
      this.engine = null;
      for (const p of this.state.players) {
        p.charId = undefined;
        p.ready = false;
      }
      this.broadcastState();
      return {};
    }

    if (!this.getScriptFn) return { error: 'no_script_provider' };

    const script = this.getScriptFn(scriptId);
    if (!script) return { error: 'script_not_found' };

    // 切换剧本:清除角色分配
    if (this.script && this.script.meta.id !== scriptId) {
      for (const p of this.state.players) {
        p.charId = undefined;
        p.ready = false;
      }
    }

    this.script = script;
    this.state.scriptId = scriptId;
    this.engine = new PhaseEngine(script, this.state, this.createBroadcaster());
    this.broadcastState();
    return {};
  }

  /** 玩家加入房间 */
  join(nickname: string, sessionToken?: string): { playerId: string; sessionToken: string } | { error: string } {
    // 被踢者带旧 token 重连 → 拒绝(双层防护的 server 兜底,防止竞态下挤回)
    if (sessionToken && this.kickedTokens.has(sessionToken)) {
      return { error: 'kicked' };
    }
    if (sessionToken) {
      const existing = this.state.players.find((p) => p.playerId === sessionToken);
      if (existing) {
        existing.nickname = nickname.trim() || existing.nickname;
        existing.connected = true;
        this.playerSockets.set(existing.playerId, { charId: existing.charId });
        this.sendToPlayer(existing.playerId, { kind: 'joined', playerId: existing.playerId, sessionToken: existing.playerId });
        this.sendToPlayer(existing.playerId, {
          kind: 'stateSync',
          view: buildView(this.script, this.state, existing.playerId, this.availableScripts, this.viewExtra()),
        });
        this.broadcastState();
        return { playerId: existing.playerId, sessionToken: existing.playerId };
      }
    }

    // 服务器重启后：按 nickname 匹配已断线玩家（token 不再有效）
    // 玩家用原昵称重连即可恢复身份
    if (sessionToken) {
      const byNickname = this.state.players.find(
        p => !p.connected && p.nickname === nickname.trim(),
      );
      if (byNickname) {
        byNickname.connected = true;
        this.playerSockets.set(byNickname.playerId, { charId: byNickname.charId });
        this.sendToPlayer(byNickname.playerId, { kind: 'joined', playerId: byNickname.playerId, sessionToken: byNickname.playerId });
        this.sendToPlayer(byNickname.playerId, {
          kind: 'stateSync',
          view: buildView(this.script, this.state, byNickname.playerId, this.availableScripts, this.viewExtra()),
        });
        this.broadcastState();
        return { playerId: byNickname.playerId, sessionToken: byNickname.playerId };
      }
    }

    if (this.state.status !== 'lobby') {
      return { error: 'room_not_joinable' };
    }

    // 新加入 — 上限统一 12,人数是否匹配剧本在开局(startAssigning)时校验,不在进房时拦。
    // 房主可在大厅踢人把人数调到与剧本角色数一致。
    const maxPlayers = 12;
    if (this.state.players.filter((p) => p.connected).length >= maxPlayers) {
      return { error: 'room_full' };
    }

    const playerId = randomUUID();
    const isHost = this.state.players.length === 0;
    if (isHost) this.hostId = playerId;

    this.state.players.push({
      playerId,
      charId: undefined,
      nickname,
      connected: true,
      ready: false,
      isHost,
    });
    this.playerSockets.set(playerId, {});

    // 加入成功
    this.sendToPlayer(playerId, { kind: 'joined', playerId, sessionToken: playerId });
    this.broadcastState();
    return { playerId, sessionToken: playerId };
  }

  /** 玩家断线 */
  disconnect(playerId: string): void {
    const p = this.state.players.find((x) => x.playerId === playerId);
    if (p) p.connected = false;
    this.playerSockets.delete(playerId);
    // 房主掉线 → 转移给下一个在线玩家,避免房间失去控制权(P0-2)
    if (p?.isHost) this.reassignHost(playerId);
    // 运行期:让引擎复查 sequential 指针/退出条件,防止卡在离线玩家身上(P0-1)
    if (this.state.status === 'playing') this.engine?.handleDisconnect();
    this.broadcastState();
  }

  /**
   * 把房主转移给下一个在线玩家(P0-2)。
   * 无其他在线玩家时保留原 hostId,等其重连恢复(重连不主动夺回,避免抖动)。
   */
  private reassignHost(leavingId: string): void {
    const next = this.state.players.find((x) => x.connected && x.playerId !== leavingId);
    if (!next) return;
    const old = this.state.players.find((x) => x.playerId === leavingId);
    if (old) old.isHost = false;
    next.isHost = true;
    this.hostId = next.playerId;
  }

  /**
   * 房主踢人(仅 lobby 阶段)。
   * 先发 kicked 消息再删人(sendFn 按 playerId 扫 session,删早了找不到);
   * 加入黑名单,阻止被踢者自动重连挤回。
   */
  kick(hostId: string, targetPlayerId: string): { error?: string } {
    if (hostId !== this.hostId) return { error: 'not_host' };
    if (this.state.status !== 'lobby') return { error: 'kick_not_allowed' };
    if (targetPlayerId === hostId) return { error: 'cannot_kick_self' };
    const target = this.state.players.find((p) => p.playerId === targetPlayerId);
    if (!target) return { error: 'player_not_found' };

    // 先通知被踢者(此时其 session 仍在,消息可达),再移除
    this.sendToPlayer(targetPlayerId, { kind: 'kicked' });
    this.state.players = this.state.players.filter((p) => p.playerId !== targetPlayerId);
    this.playerSockets.delete(targetPlayerId);
    this.kickedTokens.add(targetPlayerId);

    this.broadcastState();
    return {};
  }

  /** 开始角色分配 */
  startAssigning(hostId: string): { error?: string } {
    if (hostId !== this.hostId) return { error: 'not_host' };
    if (this.state.status !== 'lobby') return { error: 'not_in_lobby' };
    if (!this.script) return { error: 'no_script_selected' };

    const playableCount = this.script.characters.filter((c) => !c.isVictim).length;
    const onlineCount = this.state.players.filter((p) => p.connected).length;
    if (onlineCount !== playableCount) {
      return { error: `需要 ${playableCount} 名玩家,当前 ${onlineCount} 人` };
    }

    this.state.status = 'assigning';
    this.broadcastState();
    return {};
  }

  /** 手选角色 */
  selectChar(playerId: string, charId: string): { error?: string } {
    if (!this.script) return { error: 'no_script' };
    if (this.state.status !== 'assigning') return { error: 'not_in_assigning' };
    if (this.state.players.some((p) => p.charId === charId)) return { error: 'char_taken' };
    const p = this.state.players.find((x) => x.playerId === playerId);
    if (!p) return { error: 'player_not_found' };
    if (p.charId) return { error: 'already_assigned' };
    const playable = this.script.characters.filter((c) => !c.isVictim);
    if (!playable.some((c) => c.id === charId)) return { error: 'char_not_found' };

    p.charId = charId;
    this.playerSockets.set(playerId, { charId });

    // 私发角色信息
    this.sendToPlayer(playerId, { kind: 'assigned', charId });

    // 测试模式:测试员手选后,其余未选席位自动补齐,避免预览卡在选角。
    if (this.isTestMode) this.assignRemainingTestSeats(playerId);
    this.broadcastState();
    if (this.allAssigned()) {
      this.startPlaying();
    }
    return {};
  }

  /** 随机分配剩余未选角色的玩家 */
  randomAssign(hostId: string): { error?: string } {
    if (!this.script) return { error: 'no_script' };
    if (hostId !== this.hostId) return { error: 'not_host' };
    if (this.state.status !== 'assigning') return { error: 'not_in_assigning' };

    const playable = this.script.characters.filter((c) => !c.isVictim);
    const assigned = new Set(this.state.players.map((p) => p.charId).filter(Boolean));
    const unassigned = this.state.players.filter((p) => !p.charId);
    const available = playable.filter((c) => !assigned.has(c.id));

    for (const p of unassigned) {
      if (available.length === 0) break;
      const idx = Math.floor(Math.random() * available.length);
      const char = available.splice(idx, 1)[0]!;
      p.charId = char.id;
      this.playerSockets.set(p.playerId, { charId: char.id });
      this.sendToPlayer(p.playerId, { kind: 'assigned', charId: char.id });
    }

    this.broadcastState();
    if (this.allAssigned()) this.startPlaying();
    return {};
  }

  /** 测试模式:填充 bot,自动分配,自动推进 */
  startTestMode(hostId: string): { error?: string } {
    if (hostId !== this.hostId) return { error: 'not_host' };
    if (this.state.status !== 'lobby') return { error: 'not_in_lobby' };

    // 自动选第一个可用剧本
    if (!this.script) {
      if (!this.availableScripts.length) return { error: 'no_scripts_available' };
      const firstId = this.availableScripts[0]!.id;
      const selResult = this.selectScript(hostId, firstId);
      if (selResult.error) return selResult;
    }

    this.isTestMode = true;
    const playable = this.script!.characters.filter((c) => !c.isVictim);

    // 填充 bot 玩家,但保留测试员手选角色
    const botNames = ['探长', '书记官', '旁观者', '路人甲', '路人乙'];
    const needed = playable.length - this.state.players.length;
    for (let i = 0; i < needed; i++) {
      const botId = `bot_${i}`;
      this.state.players.push({
        playerId: botId,
        charId: undefined,
        nickname: botNames[i] ?? `Bot${i + 1}`,
        connected: true,
        ready: false,
        isHost: false,
      });
      this.playerSockets.set(botId, {});
      this.botIds.push(botId);
    }

    this.state.status = 'assigning';
    this.broadcastState();
    return {};
  }

  /** 处理游戏中的玩家意图 */
  handleIntent(playerId: string, intent: ClientIntent): { error?: string } {
    if (!this.script) return { error: 'no_script' };

    // Lobby: host can start assigning without a charId
    if (intent.kind === 'hostAdvance' && this.state.status === 'lobby') {
      return this.startAssigning(playerId);
    }

    // 测试模式:手动推进/回退
    if (intent.kind === 'manualAdvance') {
      if (!this.isTestMode) return { error: 'not_test_mode' };
      const p = this.state.players.find(x => x.playerId === playerId);
      if (!p?.isHost) return { error: 'not_host' };
      if (!this.engine?.executeAdvance()) return { error: 'no_pending_advance' };
      return {};
    }
    if (intent.kind === 'rollbackPhase') {
      if (!this.isTestMode) return { error: 'not_test_mode' };
      const p = this.state.players.find(x => x.playerId === playerId);
      if (!p?.isHost) return { error: 'not_host' };
      return this.rollbackSnapshot();
    }

    // AI DM 配置（仅房主，任意阶段可配）
    // 合并策略：有 apiKey → 更新 dmFullConfig；没 key 但 enabled → 用已存配置重建
    if (intent.kind === 'configureDm') {
      const p = this.state.players.find(x => x.playerId === playerId);
      if (!p?.isHost) return { error: 'not_host' };

      // 有 key → 持久化到服务端内存（不再回传客户端）
      if (intent.apiKey) {
        this.dmFullConfig = {
          provider: intent.provider ?? 'anthropic',
          apiKey: intent.apiKey,
          apiUrl: intent.apiUrl,
          model: intent.model ?? 'claude-haiku-4-5',
        };
      }

      if (intent.enabled && this.dmFullConfig) {
        this.dmService = new DmService(this.dmFullConfig);
      } else {
        this.dmService = new DmService(null);
      }
      this.broadcastState();
      return {};
    }

    const p = this.state.players.find((x) => x.playerId === playerId);
    if (!p?.charId) return { error: 'no_char' };

    if (intent.kind === 'hostAdvance') {
      if (!p.isHost) return { error: 'not_host' };
      return this.engine!.hostAdvance(p.charId);
    }

    return this.engine!.handleAction(p.charId, intent);
  }

  getState(): Readonly<RuntimeState> {
    return this.state;
  }

  getScript(): Readonly<Script> | null {
    return this.script;
  }

  // ─── 持久化 ───

  /** 设置 broadcastState 后的回调（RoomManager 用来触发防抖写盘） */
  setOnBroadcast(fn: () => void): void { this.onBroadcastFn = fn; }

  /** 序列化当前房间为快照 */
  snapshot(): RoomSnapshot {
    return {
      version: 2,
      state: structuredClone(this.state),
      hostId: this.hostId ?? '',
      scriptId: this.state.scriptId,
      isTestMode: this.isTestMode,
      botIds: [...this.botIds],
      phaseHistory: [...this.phaseHistory],
      // 安全:apiKey 不落盘(防明文密钥写入磁盘)。仅存 provider/apiUrl/model 供恢复后回显。
      dmConfig: this.dmFullConfig
        ? { provider: this.dmFullConfig.provider, apiUrl: this.dmFullConfig.apiUrl, model: this.dmFullConfig.model }
        : null,
      kickedTokens: [...this.kickedTokens],
      savedAt: new Date().toISOString(),
    };
  }

  /** 从快照恢复房间（服务器重启后） */
  static restore(
    snap: RoomSnapshot,
    sendFn: SendFn,
    getScriptFn: (id: string) => Script | undefined,
    scriptMetas: ScriptMeta[],
  ): Room {
    // 安全:apiKey 不落盘,重启后 DM 默认关闭。房主需重新 configureDm 填 key 才能恢复旁白。
    const room = new Room(sendFn, null);
    // 恢复状态
    (room as any).roomCode = snap.state.roomCode;
    (room as any).state = snap.state;
    (room as any).hostId = snap.hostId || null;
    (room as any).isTestMode = snap.isTestMode;
    (room as any).botIds = snap.botIds;
    (room as any).phaseHistory = snap.phaseHistory;
    (room as any).kickedTokens = new Set(snap.kickedTokens);
    // dmFullConfig 不从快照恢复(无 apiKey),保持 null
    // 所有玩家标记为断线（需重新连接）
    for (const p of room.state.players) {
      p.connected = false;
    }
    // 重建剧本和引擎
    room.setScriptProvider(scriptMetas, getScriptFn);
    if (snap.scriptId) {
      const script = getScriptFn(snap.scriptId);
      if (script) {
        (room as any).script = script;
        if (snap.state.status === 'playing') {
          const engine = new PhaseEngine(script, room.state, (room as any).createBroadcaster());
          if (room.isTestMode) engine.setBlockAdvance(true);
          (room as any).engine = engine;
        }
      }
    }
    return room;
  }

  // ─── 内部 ───

  private allAssigned(): boolean {
    return this.state.players.every((p) => p.charId);
  }

  private assignRemainingTestSeats(testerId: string): void {
    if (!this.script) return;
    const assigned = new Set(this.state.players.map((p) => p.charId).filter(Boolean));
    const available = this.script.characters.filter((c) => !c.isVictim && !assigned.has(c.id));
    const unassigned = this.state.players.filter((p) => p.playerId !== testerId && !p.charId);

    for (const p of unassigned) {
      const char = available.shift();
      if (!char) return;
      p.charId = char.id;
      this.playerSockets.set(p.playerId, { charId: char.id });
      this.sendToPlayer(p.playerId, { kind: 'assigned', charId: char.id });
    }
  }

  private startPlaying(): void {
    if (!this.script || !this.engine) return;
    this.state.status = 'playing';
    this.state.flags['story:opening'] = true;

    // ★ 私密线索自动归属: 每个玩家的 private 线索直接注入 acquiredClues
    for (const p of this.state.players) {
      if (!p.charId) continue;
      const privateClues = this.script.clues.filter(
        (c) => c.visibility === 'private' && c.ownerCharId === p.charId
      );
      if (privateClues.length > 0) {
        if (!this.state.acquiredClues[p.charId]) this.state.acquiredClues[p.charId] = [];
        const myAcquired = this.state.acquiredClues[p.charId]!;
        for (const c of privateClues) {
          if (!myAcquired.includes(c.id)) {
            myAcquired.push(c.id);
          }
        }
      }
    }

    // 测试模式:启用手动推进,保存初始快照,并启动 bot 自动行动
    if (this.isTestMode) {
      this.engine.setBlockAdvance(true);
      this.saveSnapshot();
      this.botRunner.schedule();
    }
    this.engine.start();
  }

  private createBroadcaster(): Broadcaster {
    return {
      broadcastState: () => {
        this.fanOutStateSync();
      },
      event: (evt) => {
        const full = { ...evt, ts: Date.now() };
        this.state.log.push(full);
        // 防止 log 无限增长
        if (this.state.log.length > Room.MAX_LOG) {
          this.state.log = this.state.log.slice(-Room.MAX_LOG);
        }
        if (evt.type === 'flow_end') {
          this.state.status = 'finished';
        }
        if (evt.type === 'phase_enter') {
        const phase = this.script?.phases.find(p => p.id === (evt.payload as Record<string, string>)?.phaseId);
        if (phase) this.phaseHistory.push(phase.title);
          if (this.isTestMode) this.saveSnapshot();
        }
        for (const p of this.state.players) {
          if (p.connected) this.sendToPlayer(p.playerId, { kind: 'event', event: full });
        }
        // status 变 finished 后广播最终状态
        if (evt.type === 'flow_end') this.broadcastState();
        // AI DM: 异步生成旁白（不阻塞游戏流程）
        this.triggerDm(evt);
      },
      sendToChar: (charId, msg) => {
        const p = this.state.players.find((x) => x.charId === charId);
        if (p?.connected) this.sendToPlayer(p.playerId, msg as ServerMessage);
      },
    };
  }

  /** 异步触发 AI DM 旁白（不阻塞游戏流程） */
  private triggerDm(evt: Omit<import('@mmg/schema').GameEvent, 'ts'>): void {
    if (!this.dmService.isEnabled || !this.script) return;

    const payload = (evt.payload ?? {}) as Record<string, string>;
    // 补充角色名
    if (evt.actorCharId) {
      const ch = this.script.characters.find(c => c.id === evt.actorCharId);
      if (ch) payload.actorName = ch.name;
    }

    const ctx = {
      phaseTitle: this.script.phases.find(p => p.id === this.state.currentPhaseId)?.title ?? '',
      phaseKind: this.script.phases.find(p => p.id === this.state.currentPhaseId)?.kind ?? '',
      publicClueTitles: this.state.revealedClues
        .map(id => this.script!.clues.find(c => c.id === id)?.title)
        .filter(Boolean) as string[],
      scriptTitle: this.script.meta.title,
      characterNames: this.script.characters.filter(c => !c.isVictim).map(c => c.name),
    };

    // fire-and-forget: 不 await，LLM 返回后才推送
    this.dmService.onEvent(evt.type, payload, ctx).then((result) => {
      if (!result) return;
      // B3: LLM 响应(可达数秒)到达前房间可能已结束/销毁,丢弃避免推送到废弃状态
      if (this.state.status === 'finished') return;
      // 广播 DM 旁白给所有在线玩家
      for (const p of this.state.players) {
        if (p.connected) {
          this.sendToPlayer(p.playerId, { kind: 'dmNarrative', text: result.text, charId: result.charId });
        }
      }
    }).catch(() => { /* 静默放弃 */ });
  }

  private viewExtra() {
    return {
      isTestMode: this.isTestMode || undefined,
      dmEnabled: this.dmService.isEnabled || undefined,
      pendingAdvance: this.engine?.pendingAdvance || undefined,
      phaseHistory: this.phaseHistory.length > 0 ? this.phaseHistory : undefined,
    };
  }

  private sendToPlayer(playerId: string, msg: ServerMessage): void {
    this.sendFn(playerId, msg);
  }

  private broadcastState(): void {
    this.fanOutStateSync();
    // 通知 RoomManager 持久化（防抖写入）
    this.onBroadcastFn?.();
  }

  /**
   * 给所有在线玩家下发各自裁剪后的 stateSync。
   * 用 buildViewBatch 只算一次公共部分,再为每个玩家算私有部分 —— 取代原来的
   * N 次独立 buildView,把每广播的 O(N×全量) 降为 O(公共 + N×私有)。
   */
  private fanOutStateSync(): void {
    const connectedIds = this.state.players.filter((p) => p.connected).map((p) => p.playerId);
    if (connectedIds.length === 0) return;
    const extra = this.viewExtra();
    for (const { playerId, view } of buildViewBatch(this.script, this.state, connectedIds, this.availableScripts, extra)) {
      this.sendToPlayer(playerId, { kind: 'stateSync', view });
    }
  }

  // ─── 状态快照(测试模式用) ───

  private saveSnapshot(): void {
    this.snapshots.push(this.state);
  }

  private rollbackSnapshot(): { error?: string } {
    const prev = this.snapshots.popToPrevious();
    if (!prev) return { error: 'no_snapshot' };
    Object.assign(this.state, prev);
    // 重建 engine
    if (this.script) {
      this.engine = new PhaseEngine(this.script, this.state, this.createBroadcaster());
      this.engine.setBlockAdvance(true);
    }
    this.phaseHistory.pop();
    this.broadcastState();
    return {};
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
