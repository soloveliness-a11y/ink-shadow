import { randomUUID } from 'node:crypto';
import type { Script, ScriptMeta, RuntimeState, ClientIntent, ServerMessage } from '@mmg/schema';
import { PhaseEngine, type Broadcaster } from '../engine/PhaseEngine.js';
import { buildView } from '../view.js';

type SendFn = (playerId: string, msg: ServerMessage) => void;

/**
 * 单房间:可选本 → 角色分配 → 游戏运行。
 * 所有状态变更方法同步执行(单线程事件循环,无竞态)。
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
  private stateSnapshots: RuntimeState[] = [];
  private phaseHistory: string[] = [];
  private kickedTokens = new Set<string>();
  private static MAX_LOG = 500;

  constructor(sendFn: SendFn) {
    this.roomCode = generateRoomCode();
    this.sendFn = sendFn;

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
      flags: {},
      log: [],
    };
  }

  /** 设置剧本查询能力(由 RoomManager 注入) */
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
      this.scheduleBots();
    }
    this.engine.start();
  }

  private createBroadcaster(): Broadcaster {
    return {
      broadcastState: () => {
        for (const p of this.state.players) {
          if (p.connected) {
            this.sendToPlayer(p.playerId, {
              kind: 'stateSync',
              view: buildView(this.script, this.state, p.playerId, this.availableScripts, this.viewExtra()),
            });
          }
        }
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
      },
      sendToChar: (charId, msg) => {
        const p = this.state.players.find((x) => x.charId === charId);
        if (p?.connected) this.sendToPlayer(p.playerId, msg as ServerMessage);
      },
    };
  }

  private viewExtra() {
    return {
      isTestMode: this.isTestMode || undefined,
      pendingAdvance: this.engine?.pendingAdvance || undefined,
      phaseHistory: this.phaseHistory.length > 0 ? this.phaseHistory : undefined,
    };
  }

  private sendToPlayer(playerId: string, msg: ServerMessage): void {
    this.sendFn(playerId, msg);
  }

  private broadcastState(): void {
    for (const p of this.state.players) {
      if (p.connected) {
        this.sendToPlayer(p.playerId, {
          kind: 'stateSync',
          view: buildView(this.script, this.state, p.playerId, this.availableScripts, this.viewExtra()),
        });
      }
    }
  }

  // ─── 状态快照(测试模式用) ───

  private saveSnapshot(): void {
    this.stateSnapshots.push(structuredClone(this.state));
  }

  private rollbackSnapshot(): { error?: string } {
    if (this.stateSnapshots.length < 2) return { error: 'no_snapshot' };
    this.stateSnapshots.pop(); // 丢弃当前状态
    const prev = this.stateSnapshots[this.stateSnapshots.length - 1]!;
    Object.assign(this.state, structuredClone(prev));
    // 重建 engine
    if (this.script) {
      this.engine = new PhaseEngine(this.script, this.state, this.createBroadcaster());
      this.engine.setBlockAdvance(true);
    }
    this.phaseHistory.pop();
    this.broadcastState();
    return {};
  }

  // ─── Bot 自动行动 ───

  private scheduleBots(): void {
    if (!this.isTestMode) return;
    setTimeout(() => this.autoPlayBots(), 800);
  }

  private autoPlayBots(): void {
    if (!this.isTestMode || this.state.status !== 'playing' || !this.script || !this.engine) return;

    const phase = this.script.phases.find(p => p.id === this.state.currentPhaseId);
    if (!phase) return;

    const allowed = new Set(phase.allowedActions || []);
    const rt = this.state.phaseRuntime;

    if (allowed.has('ready')) {
      for (const p of this.state.players) {
        if (p.charId && !rt.actedCharIds.includes(p.charId)) {
          this.engine.handleAction(p.charId, { kind: 'ready' });
        }
      }
    } else if (allowed.has('speak') && phase.kind === 'sequential' && phase.turnOrder) {
      const idx = rt.turnIndex ?? 0;
      const turnCharId = phase.turnOrder[idx];
      if (turnCharId && !rt.actedCharIds.includes(turnCharId)) {
        const charName = this.script.characters.find(c => c.id === turnCharId)?.name ?? '???';
        this.engine.handleAction(turnCharId, { kind: 'speak', text: `我是${charName}，目前没有特别的发现。` });
      }
    } else if (allowed.has('castVote')) {
      // 仅 bot 自动投票,测试员手动投
      const playable = this.script.characters.filter(c => !c.isVictim);
      for (const p of this.state.players) {
        if (!p.charId || !this.botIds.includes(p.playerId)) continue;
        if (p.charId in this.state.votes) continue;
        // 随机选一个其他角色作为投票目标
        const others = playable.filter(c => c.id !== p.charId);
        const target = others.length > 0
          ? others[Math.floor(Math.random() * others.length)]!.id
          : playable[0]!.id;
        this.engine.handleAction(p.charId, { kind: 'castVote', targetCharId: target });
      }
    } else if (allowed.has('searchClue')) {
      // bot 自动搜证 + 自动公开,测试员手动搜;bot 搜完后标记可推进
      const maxSearches = phase.maxSearches;
      const searchable = this.script.clues.filter(c =>
        c.visibility === 'searchable' && this.state.flags[`unlocked:${c.id}`]
      );
      // 已排除掉已被任何人获取的线索
      const allAcquiredIds = new Set(Object.values(this.state.acquiredClues).flat());
      const available = searchable.filter(c => !allAcquiredIds.has(c.id));

      let allBotsIdle = true;
      for (const p of this.state.players) {
        if (!p.charId || !this.botIds.includes(p.playerId)) continue;
        const acquired = new Set(this.state.acquiredClues[p.charId] ?? []);
        // 检查 bots 是否已用尽搜证次数
        const botCount = rt.searchCount?.[p.charId] ?? 0;
        if (maxSearches && botCount >= maxSearches) continue; // 次数用完,跳过
        if (available.length === 0) continue; // 无可搜线索,跳过

        // 还有次数且还有线索 → 搜索
        for (const clue of available) {
          if (!acquired.has(clue.id)) {
            const result = this.engine.handleAction(p.charId, { kind: 'searchClue', clueId: clue.id });
            if (result.ok) {
              // ★ 搜到后自动公开
              this.engine.handleAction(p.charId, { kind: 'revealClue', clueId: clue.id });
              // 立即更新 available 列表（该线索已被此人独占）
              available.splice(available.indexOf(clue), 1);
            }
            allBotsIdle = false;
            break;
          }
        }
      }
      // 所有bot次数用尽或所有线索已搜完 → 标记可推进
      if (allBotsIdle || available.length === 0) {
        this.engine.forceAdvance();
      }
    } else if (phase.exit.kind === 'hostAdvance' || phase.exit.kind === 'timer') {
      // hostAdvance/timer 阶段自动推进(blockAdvance 模式下转为 pending)
      this.engine.forceAdvance();
    }

    this.scheduleBots();
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
