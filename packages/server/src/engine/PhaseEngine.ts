import type {
  Script,
  Phase,
  RuntimeState,
  PhaseRuntime,
  ClientIntent,
  GameEvent,
} from '@mmg/schema';
import { selectNextPhase, tieCharIds } from './flow.js';

export interface Broadcaster {
  broadcastState(): void;
  event(evt: Omit<GameEvent, 'ts'>): void;
  sendToChar(charId: string, msg: unknown): void;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function ok(): ActionResult {
  return { ok: true };
}
function reject(msg: string): ActionResult {
  return { ok: false, error: msg };
}
function now(): number {
  return Date.now();
}

/**
 * ⭐ DAG 环节解释器 — M3 的心脏。
 * 通用解释器,不硬编码任何具体流程,完全由剧本的 phases+flow 驱动。
 */
export class PhaseEngine {
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private _blockAdvance = false;
  private _pendingAdvance = false;

  constructor(
    private script: Script,
    private state: RuntimeState,
    private bus: Broadcaster,
  ) {}

  get pendingAdvance(): boolean { return this._pendingAdvance; }

  /** 测试模式:阻止自动推进,等手动调用 executeAdvance */
  setBlockAdvance(block: boolean): void {
    this._blockAdvance = block;
  }

  /** 启动:进入 flow.entry */
  start(): void {
    this.enter(this.script.flow.entry);
  }

  /** 进入指定环节 */
  enter(phaseId: string): void {
    const phase = this.getPhase(phaseId);
    if (!phase) return;

    this.state.currentPhaseId = phaseId;

    // 平票决胜:解析 'tied' 为实际平票角色 ID(存入 runtime,不 mutate 共享 phase)
    let resolvedTargets: string[] | undefined;
    if (phase.restrictVoteTargets === 'tied') {
      const ids = this.state.tieCharIds ?? [];
      resolvedTargets = ids.length > 1 ? ids : undefined;
    } else if (Array.isArray(phase.restrictVoteTargets)) {
      resolvedTargets = phase.restrictVoteTargets;
    }

    // 决胜轮:清空投票记录
    if (phase.resetVotes) {
      this.state.votes = {};
    }

    this.state.phaseRuntime = this.initPhaseRuntime(phase);
    this.state.phaseRuntime.resolvedVoteTargets = resolvedTargets;

    // 应用解锁:开放可搜证线索 + 分幕剧情
    if (phase.unlocks?.clueIds) {
      for (const cid of phase.unlocks.clueIds) {
        if (!this.state.flags[`unlocked:${cid}`]) {
          this.state.flags[`unlocked:${cid}`] = true;
        }
      }
    }
    if (phase.unlocks?.storyKey) {
      this.state.flags[`story:${phase.unlocks.storyKey}`] = true;
    }

    // sequential:跳过开头已掉线的发言者,避免指针一开始就卡在离线玩家
    this.advanceTurnPointer(phase);

    this.bus.broadcastState();
    this.bus.event({ type: 'phase_enter', payload: { phaseId, phaseTitle: phase.title } });

    // 计时器环节:启动倒计时
    this.clearTimer();
    if (phase.exit.kind === 'timer' && phase.exit.timerSec) {
      this.timerHandle = setTimeout(() => {
        if (this.checkExit()) this.advance();
      }, phase.exit.timerSec * 1000);
    }
  }

  /** 处理玩家意图 */
  handleAction(charId: string, intent: ClientIntent): ActionResult {
    const phase = this.current();
    if (!phase) return reject('no_active_phase');

    // 1) 环节是否允许该操作
    if (!phase.allowedActions.includes(intent.kind as Phase['allowedActions'][number])) {
      return reject('action_not_allowed');
    }

    // 2) 参与者校验
    if (Array.isArray(phase.participants) && !phase.participants.includes(charId)) {
      return reject('not_participant');
    }

    // 3) 环节特定校验
    if (phase.kind === 'sequential' && !this.isCurrentTurn(charId, phase)) {
      return reject('not_your_turn');
    }

    // 4) 意图校验
    const check = this.validateIntent(charId, intent);
    if (!check.ok) return check;

    // 5) 执行(修改 state)
    this.executeIntent(charId, intent);

    // 6) 记录已行动
    this.markActed(charId, phase);

    this.bus.broadcastState();

    // 7) 检查推进
    if (this.checkExit()) this.advance();
    return ok();
  }

  /** 房主手动推进 */
  hostAdvance(charId: string): ActionResult {
    const phase = this.current();
    if (!phase) return reject('no_active_phase');
    if (phase.exit.kind !== 'hostAdvance') return reject('not_host_advance_phase');
    // 验证房主身份由外层 Room 负责,此处直接推进
    this.clearTimer();
    // 房主手动推进始终立即生效,不经过 blockAdvance(测试模式)拦截
    if (this._blockAdvance) this._pendingAdvance = false;
    this.doAdvance();
    return ok();
  }

  /** 测试模式:强制推进当前环节(跳过 timer/allReady/allActed 等) */
  forceAdvance(): void {
    this.clearTimer();
    this.advance();
  }

  /**
   * 玩家掉线后复查(由 Room.disconnect 调用)。
   * sequential:跳过掉线指针;任意环节:若掉线后已满足退出条件则推进。
   * 防止环节卡在离线玩家身上(P0-1),并让"等所有在线玩家"的环节在掉线后自动重评。
   */
  handleDisconnect(): void {
    const phase = this.current();
    if (!phase) return;
    if (phase.kind === 'sequential' && phase.turnOrder) {
      this.advanceTurnPointer(phase);
    }
    if (this.checkExit()) this.advance();
  }

  // ─── 内部方法 ───

  private getPhase(id: string): Phase | undefined {
    return this.script.phases.find((p) => p.id === id);
  }

  private current(): Phase | undefined {
    return this.getPhase(this.state.currentPhaseId);
  }

  private initPhaseRuntime(phase: Phase): PhaseRuntime {
    return {
      phaseId: phase.id,
      turnIndex: phase.kind === 'sequential' && phase.turnOrder ? 0 : undefined,
      startedAt: now(),
      deadline: phase.exit.kind === 'timer' && phase.exit.timerSec ? now() + phase.exit.timerSec * 1000 : undefined,
      actedCharIds: [],
      searchCount: phase.maxSearches ? {} : undefined,
    };
  }

  private isCurrentTurn(charId: string, phase: Phase): boolean {
    if (!phase.turnOrder) return true;
    const rt = this.state.phaseRuntime;
    const idx = rt.turnIndex ?? 0;
    return phase.turnOrder[idx] === charId;
  }

  private markActed(charId: string, phase: Phase): void {
    const rt = this.state.phaseRuntime;
    if (!rt.actedCharIds.includes(charId)) {
      rt.actedCharIds.push(charId);
    }
    // sequential:当前发言者完成 → 指针前移,并跳过已掉线/已发言者
    if (phase.kind === 'sequential' && phase.turnOrder) {
      const idx = rt.turnIndex ?? 0;
      if (phase.turnOrder[idx] === charId) {
        rt.turnIndex = idx + 1;
      }
      this.advanceTurnPointer(phase);
    }
  }

  /** 某角色当前是否有在线玩家持有 */
  private isCharConnected(charId: string): boolean {
    const p = this.state.players.find((x) => x.charId === charId);
    return !!p?.connected;
  }

  /**
   * sequential:把 turnIndex 推进到下一个"在线且未发言"的成员。
   * 已发言或已掉线的成员一律跳过;全部跳过则停在末尾(length),由 checkExit 收尾。
   * 这是 P0-1 防卡死的核心:轮到的玩家掉线时,指针不会停在离线者身上。
   */
  private advanceTurnPointer(phase: Phase): void {
    if (phase.kind !== 'sequential' || !phase.turnOrder) return;
    const rt = this.state.phaseRuntime;
    let idx = rt.turnIndex ?? 0;
    while (idx < phase.turnOrder.length) {
      const cid = phase.turnOrder[idx]!;
      if (rt.actedCharIds.includes(cid) || !this.isCharConnected(cid)) idx++;
      else break;
    }
    rt.turnIndex = idx;
  }

  private validateIntent(charId: string, intent: ClientIntent): ActionResult {
    const phase = this.current();
    if (!phase) return reject('no_active_phase');
    switch (intent.kind) {
      case 'searchClue': {
        const clue = this.script.clues.find((c) => c.id === intent.clueId);
        if (!clue) return reject('clue_not_found');
        // 技能门控检查
        if (clue.requiredSkill) {
          const playerChar = this.script.characters.find((c) => c.id === charId);
          if (!playerChar?.skills?.includes(clue.requiredSkill)) {
            return reject(`skill_required:${clue.requiredSkill}`);
          }
        }
        // 已获取过（自己）
        if (this.state.acquiredClues[charId]?.includes(clue.id)) return reject('already_acquired');
        // ★ 线索独占：已被其他玩家获取
        for (const [otherId, ids] of Object.entries(this.state.acquiredClues)) {
          if (otherId !== charId && ids.includes(clue.id)) return reject('clue_taken');
        }
        // 可达性:public 或已解锁 或是持有者
        const unlocked = this.state.flags[`unlocked:${clue.id}`];
        if (clue.visibility === 'public') break;
        if (clue.visibility === 'private' && clue.ownerCharId !== charId) return reject('clue_private');
        if (clue.visibility === 'searchable' && !unlocked && clue.ownerCharId !== charId) return reject('clue_locked');
        // ★ 搜证次数限制
        if (phase?.maxSearches) {
          const rt = this.state.phaseRuntime;
          const count = rt.searchCount?.[charId] ?? 0;
          if (count >= phase.maxSearches) return reject('search_limit_reached');
        }
        break;
      }
      case 'revealClue': {
        const has = this.state.acquiredClues[charId]?.includes(intent.clueId);
        if (!has) return reject('clue_not_owned');
        if (this.state.revealedClues.includes(intent.clueId)) return reject('already_revealed');
        break;
      }
      case 'castVote': {
        if (this.state.votes[charId]) return reject('already_voted');
        const target = this.script.characters.find((c) => c.id === intent.targetCharId);
        if (!target) return reject('target_not_found');
        if (target.id === charId) return reject('cannot_vote_self');
        if (target.isVictim) return reject('cannot_vote_victim');
        // 决胜轮:限制投票目标(从 runtime 读取,非共享 phase)
        const restricted = this.state.phaseRuntime.resolvedVoteTargets;
        if (restricted && restricted.length > 0 && !restricted.includes(intent.targetCharId)) {
          return reject('target_restricted');
        }
        break;
      }
    }
    return ok();
  }

  private executeIntent(charId: string, intent: ClientIntent): void {
    switch (intent.kind) {
      case 'ready':
        this.setPlayerReady(charId, true);
        break;
      case 'speak':
        this.bus.event({ type: 'speak', actorCharId: charId, payload: { text: intent.text } });
        break;
      case 'searchClue': {
        if (!this.state.acquiredClues[charId]) this.state.acquiredClues[charId] = [];
        this.state.acquiredClues[charId].push(intent.clueId);
        // ★ 递增搜证计数
        const rt = this.state.phaseRuntime;
        if (rt.searchCount) {
          rt.searchCount[charId] = (rt.searchCount[charId] ?? 0) + 1;
        }
        const clue = this.script.clues.find((c) => c.id === intent.clueId);
        // 技能触发秘密线索解锁
        if (clue?.linkedSecretClueId && clue.requiredSkill) {
          const playerChar = this.script.characters.find((c) => c.id === charId);
          if (playerChar?.skills?.includes(clue.requiredSkill)) {
            this.state.flags[`unlocked:${clue.linkedSecretClueId}`] = true;
          }
        }
        this.bus.event({ type: 'search_clue', actorCharId: charId, payload: { clueId: intent.clueId, clueTitle: clue?.title } });
        break;
      }
      case 'revealClue': {
        this.state.revealedClues.push(intent.clueId);
        const clue = this.script.clues.find((c) => c.id === intent.clueId);
        this.bus.event({ type: 'reveal_clue', actorCharId: charId, payload: { clueId: intent.clueId, clueTitle: clue?.title } });
        break;
      }
      case 'castVote': {
        this.state.votes[charId] = intent.targetCharId;
        this.bus.event({ type: 'vote_cast', actorCharId: charId });
        break;
      }
      case 'privateMessage': {
        this.bus.sendToChar(intent.toCharId, { kind: 'privateMessage', fromCharId: charId, text: intent.text });
        break;
      }
      case 'submitTheory':
        this.bus.event({ type: 'submit_theory', actorCharId: charId, payload: { text: intent.text } });
        break;
    }
  }

  private setPlayerReady(charId: string, ready: boolean): void {
    const player = this.state.players.find((p) => p.charId === charId);
    if (player) player.ready = ready;
  }

  private checkExit(): boolean {
    const phase = this.current();
    if (!phase) return false;
    const rt = this.state.phaseRuntime;

    // 只统计 connected 玩家
    const activePlayers = this.state.players.filter((p) => p.connected && p.charId);
    const activeCharIds = new Set(activePlayers.map((p) => p.charId!));

    switch (phase.exit.kind) {
      case 'allReady':
        return activePlayers.length > 0 && activePlayers.every((p) => rt.actedCharIds.includes(p.charId!));
      case 'allActed':
        return activePlayers.length > 0 && [...activeCharIds].every((id) => rt.actedCharIds.includes(id));
      case 'voteComplete':
        return activePlayers.length > 0 && [...activeCharIds].every((id) => id in this.state.votes);
      case 'timer':
        return rt.deadline != null && now() >= rt.deadline;
      case 'hostAdvance':
        return false;
    }
  }

  private advance(): void {
    // 测试手动推进模式:不自动推进,等外部调用
    if (this._blockAdvance) {
      this._pendingAdvance = true;
      this.bus.broadcastState();
      return;
    }
    this.doAdvance();
  }

  /** 手动执行被阻塞的推进(测试模式用) */
  executeAdvance(): boolean {
    if (!this._pendingAdvance) return false;
    this._pendingAdvance = false;
    this.doAdvance();
    return true;
  }

  private doAdvance(): void {
    const nextId = selectNextPhase(this.script.flow, this.state, this.state.currentPhaseId);
    this.clearTimer();
    if (nextId) {
      // Detect tie and store tied char IDs for tiebreaker phases
      const tied = tieCharIds(this.state.votes);
      if (tied.length > 1) {
        this.state.tieCharIds = tied;
      }
      this.enter(nextId);
    } else {
      this.bus.event({ type: 'flow_end' });
    }
  }

  private clearTimer(): void {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
