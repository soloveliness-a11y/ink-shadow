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
    // 清除上一轮平票残留:进入非决胜环节时丢弃 tieCharIds,
    // 否则它会一直留在 state 里,污染后续任何 restrictVoteTargets==='tied' 的环节(B1)。
    if (phase.restrictVoteTargets !== 'tied') {
      this.state.tieCharIds = undefined;
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
      const startPhaseId = phaseId; // R1: 闭包捕获启动时的 phaseId,防止回调触达时已推进到新环节导致连跳
      this.timerHandle = setTimeout(() => {
        if (this.state.currentPhaseId !== startPhaseId) return; // 已被正常推进,丢弃过期回调
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
    if (!['hostAdvance', 'timer'].includes(phase.exit.kind)) return reject('not_host_advance_phase');
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
      currentTime: phase.clock?.startTime,
      round: phase.maxRounds ? 0 : undefined,
      searchedThisRound: phase.maxRounds ? [] : undefined,
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
    // 被淘汰/死亡的角色(由 clue.onReveal eliminate 触发)不能再行动
    if (this.state.flags[`eliminated:${charId}`]) return { ok: false, error: 'eliminated' };
    const phase = this.current();
    if (!phase) return reject('no_active_phase');
    switch (intent.kind) {
      case 'searchClue': {
        const clue = this.script.clues.find((c) => c.id === intent.clueId);
        if (!clue) return reject('clue_not_found');
        // ★ 不能搜查自己角色所在区域
        const playerChar = this.script.characters.find((c) => c.id === charId);
        if (playerChar?.sceneId && clue.sceneId && playerChar.sceneId === clue.sceneId) {
          return reject('cannot_search_own_scene');
        }
        // 技能门控检查
        if (clue.requiredSkill) {
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
        if (clue.visibility === 'private') {
          // 秘密线索：已解锁且玩家有对应技能，或线索持有者
          if (clue.ownerCharId === charId) break;
          // requiredItem:持有指定物品(线索/道具)即可解锁 —— 岳麓山下持物解锁秘密线索
          if (unlocked && clue.requiredItem) {
            const held = this.state.acquiredClues[charId]?.includes(clue.requiredItem)
              || this.state.flags[`holds:${charId}:${clue.requiredItem}`];
            if (held) {
              const searchErr = this.checkSearchLimit(phase, charId);
              if (searchErr) return reject(searchErr);
              break;
            }
            return reject('clue_locked');
          }
          if (unlocked && clue.requiredSkill) {
            const playerChar = this.script.characters.find((c) => c.id === charId);
            if (playerChar?.skills?.includes(clue.requiredSkill)) {
              // R2: 他人用技能搜秘密线索也计入搜证次数/轮次限制(与 searchable 一致),
              // 防止有技能的角色无限搜 private 线索绕过 maxSearches。
              const searchErr = this.checkSearchLimit(phase, charId);
              if (searchErr) return reject(searchErr);
              break;
            }
          }
          return reject('clue_private');
        }
        if (clue.visibility === 'searchable' && !unlocked && clue.ownerCharId !== charId) return reject('clue_locked');
        // ★ 搜证次数限制 / 轮次搜查(每轮每人 1 次)
        const searchErr = this.checkSearchLimit(phase, charId);
        if (searchErr) return reject(searchErr);
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
        const voteMode = phase.voteMode ?? 'char';
        if (voteMode === 'char') {
          // 投角色(推理本):禁投死者/自己
          const target = this.script.characters.find((c) => c.id === intent.targetCharId);
          if (!target) return reject('target_not_found');
          if (target.id === charId) return reject('cannot_vote_self');
          if (target.isVictim) return reject('cannot_vote_victim');
          // 决胜轮:限制投票目标(从 runtime 读取,非共享 phase)
          const restricted = this.state.phaseRuntime.resolvedVoteTargets;
          if (restricted && restricted.length > 0 && !restricted.includes(intent.targetCharId)) {
            return reject('target_restricted');
          }
        } else {
          // 投阵营/提案:target 是 factionId/proposalId,放宽角色检查;受 restrictVoteTargets 约束
          const allowed = phase.restrictVoteTargets;
          if (Array.isArray(allowed) && !allowed.includes(intent.targetCharId)) {
            return reject('target_restricted');
          }
        }
        break;
      }
      case 'submitTheory': {
        if (!intent.text || !intent.text.trim()) return reject('empty_text');
        if (intent.text.length > 2000) return reject('theory_too_long');
        if (this.state.theories[charId]) return reject('already_submitted_theory');
        break;
      }
      case 'makeChoice': {
        const choice = phase.choice;
        if (!choice || choice.id !== intent.choiceId) return reject('no_active_choice');
        if (!choice.options.some((o) => o.id === intent.optionId)) return reject('invalid_choice_option');
        if (this.state.flags[`choice:${charId}:${choice.id}`]) return reject('already_chose');
        break;
      }
      case 'adjustCounter': {
        // delta 为整数即可,具体语义(投入/扣除)由剧本定义;负数允许(扣减)
        if (!Number.isInteger(intent.delta)) return reject('invalid_delta');
        break;
      }
      case 'adjustResource': {
        if (!Number.isInteger(intent.delta)) return reject('invalid_delta');
        // 扣减时不允许透支(持有量 < 扣减量)
        if (intent.delta < 0) {
          const current = this.state.resources?.[charId]?.[intent.resourceId] ?? 0;
          if (current + intent.delta < 0) return reject('insufficient_resource');
        }
        break;
      }
      case 'inspectCharItems': {
        // 强搜随身物品:目标必须存在且不是自己
        if (intent.targetCharId === charId) return reject('cannot_target_self');
        const exists = this.script.characters.some((c) => c.id === intent.targetCharId);
        if (!exists) return reject('target_not_found');
        // AP 扣减校验:phase.inspectCost(默认2)需有足够 AP(用 counters['ap:<charId>'] 追踪)
        const cost = phase?.inspectCost ?? 2;
        const apKey = `ap:${charId}`;
        const ap = this.state.counters?.[apKey];
        if (ap !== undefined && ap < cost) return reject('insufficient_ap');
        break;
      }
      case 'expose': {
        // 揭露过失:目标必须存在,每人只能揭露一次(flags 去重)
        if (intent.targetCharId === charId) return reject('cannot_target_self');
        const exists = this.script.characters.some((c) => c.id === intent.targetCharId);
        if (!exists) return reject('target_not_found');
        if (this.state.flags[`exposed:${charId}`]) return reject('already_exposed'); // 每人限1次
        break;
      }
      case 'privateMessage': {
        // 被淘汰角色不能发私信(与 speak 等一致)
        const targetExists = this.script.characters.some((c) => c.id === intent.toCharId);
        if (!targetExists) return reject('target_not_found');
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
        this.scanKeywordMemories(charId, intent.text);
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
        this.advanceClock();
        // ★ 轮次搜查:记录本轮已搜,全员搜完→下一轮
        const phase = this.current();
        if (phase?.maxRounds && rt.searchedThisRound) {
          rt.searchedThisRound.push(charId);
          const activeCount = this.state.players.filter((p) => p.connected && p.charId).length;
          if (rt.searchedThisRound.length >= activeCount) {
            rt.round = (rt.round ?? 0) + 1;
            rt.searchedThisRound = [];
            this.bus.event({ type: 'round_advanced', payload: { round: rt.round } });
          }
        }
        break;
      }
      case 'revealClue': {
        this.state.revealedClues.push(intent.clueId);
        const clue = this.script.clues.find((c) => c.id === intent.clueId);
        this.bus.event({ type: 'reveal_clue', actorCharId: charId, payload: { clueId: intent.clueId, clueTitle: clue?.title } });
        // onReveal:线索公开时触发的副作用(嗜睡蔷薇"某线索导致角色死亡"等)
        if (clue?.onReveal) {
          for (const eff of clue.onReveal) {
            if (eff.kind === 'setFlag') {
              this.state.flags[eff.flag] = true;
            } else if (eff.kind === 'eliminate') {
              // 标记角色淘汰/死亡:写 flag + 从 actedCharIds 移除(不再可行动)
              this.state.flags[`eliminated:${eff.charId}`] = true;
              this.state.phaseRuntime.actedCharIds = this.state.phaseRuntime.actedCharIds.filter((id) => id !== eff.charId);
              this.bus.event({ type: 'character_eliminated', payload: { charId: eff.charId, triggerClueId: clue.id } });
            } else if (eff.kind === 'adjustCounter') {
              this.applyAdjustCounter(eff.counter, eff.delta);
            } else if (eff.kind === 'giveClue') {
              const target = eff.toCharId ?? charId;
              if (!this.state.acquiredClues[target]) this.state.acquiredClues[target] = [];
              if (!this.state.acquiredClues[target].includes(eff.clueId)) this.state.acquiredClues[target].push(eff.clueId);
            }
          }
        }
        break;
      }
      case 'castVote': {
        this.state.votes[charId] = intent.targetCharId;
        this.bus.event({ type: 'vote_cast', actorCharId: charId });
        // 阵营投票(voteMode='team'):实时统计,某阵营过半 → 设 flag:team_<id>_won(供 teamWin 条件判定)
        const voteMode = this.current()?.voteMode ?? 'char';
        if (voteMode === 'team') {
          const counts: Record<string, number> = {};
          for (const t of Object.values(this.state.votes)) counts[t] = (counts[t] ?? 0) + 1;
          const total = Object.keys(this.state.votes).length;
          for (const [faction, count] of Object.entries(counts)) {
            if (total > 0 && count > total / 2) this.state.flags[`team_${faction}_won`] = true;
          }
        }
        break;
      }
      case 'privateMessage': {
        this.bus.sendToChar(intent.toCharId, { kind: 'privateMessage', fromCharId: charId, text: intent.text });
        break;
      }
      case 'submitTheory':
        this.state.theories[charId] = intent.text;
        // 事件不含推理文本（防作弊:推理在揭晓前私密）
        this.bus.event({ type: 'submit_theory', actorCharId: charId });
        break;
      case 'makeChoice': {
        const phase = this.current();
        const choice = phase?.choice;
        const opt = choice?.options.find((o) => o.id === intent.optionId);
        if (!choice || !opt) break;
        const flag = `choice:${charId}:${choice.id}`;
        if (this.state.flags[flag]) break;
        this.state.flags[flag] = true;
        // 记录该玩家的选择到 phaseRuntime.choices(供 settlePhaseOnExit 集体抉择结算)
        if (!this.state.phaseRuntime.choices) this.state.phaseRuntime.choices = {};
        this.state.phaseRuntime.choices[charId] = opt.id;
        let jumped = false;
        for (const eff of opt.effects) {
          if (eff.kind === 'giveClue') {
            if (!this.state.acquiredClues[charId]) this.state.acquiredClues[charId] = [];
            if (!this.state.acquiredClues[charId].includes(eff.clueId)) this.state.acquiredClues[charId].push(eff.clueId);
          } else if (eff.kind === 'setFlag') {
            this.state.flags[eff.flag] = true;
          } else if (eff.kind === 'advanceClock') {
            this.advanceClock();
          } else if (eff.kind === 'unlockStory') {
            this.state.flags[`story:${eff.storyKey}`] = true;
          } else if (eff.kind === 'jumpPhase') {
            jumped = true;
            this.bus.event({ type: 'choice_made', actorCharId: charId, payload: { choiceId: choice.id, optionId: opt.id, jumpedTo: eff.phaseId } });
            this.enter(eff.phaseId); // 抉择跳转(覆盖 flow)
          } else if (eff.kind === 'adjustCounter') {
            this.applyAdjustCounter(eff.counter, eff.delta);
          } else if (eff.kind === 'adjustResource') {
            this.applyAdjustResource(charId, eff.resourceId, eff.delta);
          } else if (eff.kind === 'adjustTeamScore') {
            this.applyAdjustTeamScore(eff.teamId, eff.delta);
          } else if (eff.kind === 'switchPersona') {
            // 双重人格切换:写 activePersona flag(孽岛疑云人格苏醒)
            this.state.flags[`persona:${eff.charId}`] = false; // 清除当前(占位,flags 是 boolean)
            this.state.flags[`persona:${eff.charId}:${eff.personaId}`] = true;
            this.bus.event({ type: 'persona_switched', payload: { charId: eff.charId, personaId: eff.personaId } });
          }
        }
        if (!jumped) this.bus.event({ type: 'choice_made', actorCharId: charId, payload: { choiceId: choice.id, optionId: opt.id } });
        break;
      }
      case 'adjustCounter': {
        this.applyAdjustCounter(intent.counter, intent.delta);
        this.bus.event({ type: 'counter_adjusted', actorCharId: charId, payload: { counter: intent.counter, delta: intent.delta } });
        break;
      }
      case 'adjustResource': {
        this.applyAdjustResource(charId, intent.resourceId, intent.delta);
        this.bus.event({ type: 'resource_adjusted', actorCharId: charId, payload: { resourceId: intent.resourceId, delta: intent.delta } });
        break;
      }
      case 'inspectCharItems': {
        // 强搜:花 AP 把目标的随身线索(ownerCharId=target)转给搜查者
        const phase = this.current();
        const cost = phase?.inspectCost ?? 2;
        const apKey = `ap:${charId}`;
        this.applyAdjustCounter(apKey, -cost);
        // 把目标持有的随身线索给到搜查者(去重)
        const givenIds: string[] = [];
        for (const clue of this.script.clues) {
          if (clue.ownerCharId === intent.targetCharId && clue.visibility !== 'public') {
            if (!this.state.acquiredClues[charId]?.includes(clue.id)) {
              if (!this.state.acquiredClues[charId]) this.state.acquiredClues[charId] = [];
              this.state.acquiredClues[charId].push(clue.id);
              givenIds.push(clue.id);
            }
          }
        }
        this.bus.event({ type: 'items_inspected', actorCharId: charId, payload: { targetCharId: intent.targetCharId, clueIds: givenIds } });
        break;
      }
      case 'expose': {
        // 揭露:扣目标推荐分(minor -1) + 标记揭露者已用 + major 失去推荐资格
        this.state.flags[`exposed:${charId}`] = true;
        if (intent.severity === 'major') {
          this.state.flags[`disqualified:${intent.targetCharId}`] = true;
        }
        this.applyAdjustCounter(`recommend:${intent.targetCharId}`, intent.severity === 'major' ? -99 : -1);
        this.bus.event({ type: 'character_exposed', actorCharId: charId, payload: { targetCharId: intent.targetCharId, severity: intent.severity } });
        break;
      }
    }
  }

  // ─── 机制本/阵营本/情感本:计数器/资源/阵营分 工具方法(第一期接通) ───

  /** 调整全局计数器(机制本:如回合分/证据强度)。 */
  private applyAdjustCounter(counter: string, delta: number): void {
    if (!this.state.counters) this.state.counters = {};
    this.state.counters[counter] = (this.state.counters[counter] ?? 0) + delta;
  }

  /** 调整玩家持有的资源(机制本:如筹码/道具)。 */
  private applyAdjustResource(charId: string, resourceId: string, delta: number): void {
    if (!this.state.resources) this.state.resources = {};
    if (!this.state.resources[charId]) this.state.resources[charId] = {};
    const bag = this.state.resources[charId]!;
    bag[resourceId] = (bag[resourceId] ?? 0) + delta;
  }

  /** 调整阵营分数(阵营本增强:如红蓝方积分)。 */
  private applyAdjustTeamScore(teamId: string, delta: number): void {
    if (!this.state.teams) this.state.teams = {};
    const team = this.state.teams[teamId] ?? { score: 0 };
    team.score = (team.score ?? 0) + delta;
    this.state.teams[teamId] = team;
  }

  /** 关键词触发记忆:扫描非发言者的 keywordMemories,命中 → 解锁 + 私发记忆给持有者 */
  private scanKeywordMemories(speakerCharId: string, text: string): void {
    for (const ch of this.script.characters) {
      if (ch.id === speakerCharId || !ch.keywordMemories) continue;
      for (const km of ch.keywordMemories) {
        const flag = `kwmem:${ch.id}:${km.id}`;
        if (this.state.flags[flag]) continue;
        if (text.includes(km.keyword)) {
          this.state.flags[flag] = true;
          this.bus.sendToChar(ch.id, { kind: 'keywordMemory', charId: ch.id, memId: km.id, keyword: km.keyword, text: km.text });
          // 不广播事件:记忆触发是私密的,仅持有人收到 keywordMemory;其他人不知
        }
      }
    }
  }

  /** 时钟前进 stepMin(clock phase 用,调查/抉择后推进游戏内时间) */
  private advanceClock(): void {
    const phase = this.current();
    if (!phase?.clock) return;
    const rt = this.state.phaseRuntime;
    if (!rt.currentTime) rt.currentTime = phase.clock.startTime;
    const [h, m] = rt.currentTime.split(':').map(Number);
    const total = (h ?? 0) * 60 + (m ?? 0) + phase.clock.stepMin;
    rt.currentTime = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    this.bus.event({ type: 'clock_advanced', payload: { currentTime: rt.currentTime } });
  }

  private setPlayerReady(charId: string, ready: boolean): void {
    const player = this.state.players.find((p) => p.charId === charId);
    if (player) player.ready = ready;
  }

  private checkExit(): boolean {
    const phase = this.current();
    if (!phase) return false;
    const rt = this.state.phaseRuntime;

    // 时钟到点(clock phase):currentTime >= endTime 即推进
    if (phase.clock && rt.currentTime && rt.currentTime >= phase.clock.endTime) {
      return true;
    }
    // 轮次搜查到上限(maxRounds phase):round >= maxRounds 即推进
    if (phase.maxRounds && (rt.round ?? 0) >= phase.maxRounds) {
      return true;
    }

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
    // 推进前结算当前环节的集体抉择/提案投票结果(写入 flag,供 selectNextPhase 条件判定)
    this.settlePhaseOnExit();
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

  /**
   * 环节退出前的结果结算(在 selectNextPhase 之前调用,确保 flow 条件能读到结果):
   *  - choice(集体抉择):收集所有玩家选择(phaseRuntime.choices)→ 多数票 → 写 flags
   *  - proposal 投票:统计 proposalId 票数 → 过半 → 写 flags[proposal_<id>_won]
   * 幂等:已结算的 choice 不重复结算(flag 检查)。
   */
  private settlePhaseOnExit(): void {
    const phase = this.current();
    if (!phase) return;

    // choice 集体抉择结算(全局多数票):从 phaseRuntime.choices 收集每人选的 optionId
    if (phase.choice) {
      const choiceId = phase.choice.id;
      if (!this.state.flags[`choiceResult:${choiceId}`]) {
        const choices = this.state.phaseRuntime.choices ?? {};
        const optCounts: Record<string, number> = {};
        for (const [, optId] of Object.entries(choices)) {
          optCounts[optId] = (optCounts[optId] ?? 0) + 1;
        }
        // 多数票(平票取票数最高中 options 定义顺序首个)
        let winner: string | null = null;
        let maxCnt = 0;
        for (const opt of phase.choice.options) {
          const c = optCounts[opt.id] ?? 0;
          if (c > maxCnt) { maxCnt = c; winner = opt.id; }
        }
        if (winner) {
          this.state.flags[`choiceResult:${choiceId}`] = true;
          // 预写所有可能的目标 value flag,flow 的 choiceResult 条件直接读
          this.state.flags[`choiceResultMatch:${choiceId}:${winner}`] = true;
        }
      }
    }

    // proposal 投票过半结算
    if (phase.voteMode === 'proposal' && phase.restrictVoteTargets) {
      const proposals = Array.isArray(phase.restrictVoteTargets) ? phase.restrictVoteTargets : [];
      const total = Object.keys(this.state.votes).length;
      for (const pid of proposals) {
        if (this.state.flags[`proposal_${pid}_won`]) continue;
        const cnt = Object.values(this.state.votes).filter((v) => v === pid).length;
        if (total > 0 && cnt > total / 2) this.state.flags[`proposal_${pid}_won`] = true;
      }
    }

    // recommend 加权推荐结算(珠帘异梦):每人投1人,目标得票×目标权重 = 推荐分;
    // 揭露已扣分(minor -1 / major 资格剥夺);排除被剥夺资格者,最高分当选
    if (phase.voteMode === 'recommend') {
      const scores: Record<string, number> = {};
      for (const [voterId, targetId] of Object.entries(this.state.votes)) {
        // 投票者自己不能投被剥夺资格者(资格检查)
        if (this.state.flags[`disqualified:${targetId}`]) continue;
        if (this.state.flags[`disqualified:${voterId}`]) continue; // 被剥夺者投票无效
        const target = this.script.characters.find((c) => c.id === targetId);
        const weight = target?.voteWeight ?? 1;
        scores[targetId] = (scores[targetId] ?? 0) + weight;
      }
      // 叠加 expose 扣分(counters['recommend:<charId>'] 已在 expose 时扣减)
      for (const char of this.script.characters) {
        const adj = this.state.counters?.[`recommend:${char.id}`];
        if (adj) scores[char.id] = (scores[char.id] ?? 0) + adj;
      }
      // 最高分当选(平票取 characters 定义顺序首个)
      let winner: string | null = null;
      let maxScore = -Infinity;
      for (const char of this.script.characters) {
        if (this.state.flags[`disqualified:${char.id}`]) continue;
        const s = scores[char.id] ?? 0;
        if (s > maxScore) { maxScore = s; winner = char.id; }
      }
      if (winner) this.state.flags[`recommend_won:${winner}`] = true;
    }
  }

  /**
   * 搜证次数/轮次限制检查(R2 抽出,searchable 与 private 共用)。
   * @returns 错误码;null 表示通过
   */
  private checkSearchLimit(phase: Phase | undefined, charId: string): string | null {
    if (phase?.maxSearches) {
      const count = this.state.phaseRuntime.searchCount?.[charId] ?? 0;
      if (count >= phase.maxSearches) return 'search_limit_reached';
    }
    if (phase?.maxRounds && this.state.phaseRuntime.searchedThisRound?.includes(charId)) {
      return 'already_searched_this_round';
    }
    return null;
  }

  private clearTimer(): void {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /**
   * 销毁引擎:清理倒计时定时器,防止房间移除后回调仍触达废弃 state(B4)。
   * 与 forceAdvance 不同:不推进流程,纯资源释放。
   */
  dispose(): void {
    this.clearTimer();
  }
}
