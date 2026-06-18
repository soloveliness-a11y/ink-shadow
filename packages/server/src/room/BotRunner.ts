import type { Script, RuntimeState } from '@mmg/schema';
import type { PhaseEngine } from '../engine/PhaseEngine.js';

/**
 * 测试模式 Bot 自动行动的上下文。
 * Room 在调度 bot 时实时读取自身字段,避免 BotRunner 持有 Room 引用形成耦合。
 */
export interface BotContext {
  getState: () => RuntimeState;
  getScript: () => Script | null;
  getEngine: () => PhaseEngine | null;
  isTestMode: () => boolean;
  botIds: () => readonly string[];
}

/**
 * 测试模式 Bot 自动行动调度器(从 Room 抽出,保持行为不变)。
 *
 * 策略:每 ~800ms 轮询一次,按当前环节 allowedActions 决定 bot 该做什么:
 *  - ready      → 所有未 ready 的角色(含真人?)直接 ready
 *  - speak      → 轮到谁谁发言(占位文本)
 *  - castVote   → 仅 bot 随机投票,测试员手动投
 *  - searchClue → bot 优先搜秘密线索、其次普通线索,搜完自动公开;全员搜尽或次数用尽则推进
 *  - submitTheory → bot 提交占位推理后推进
 *  - hostAdvance/timer → 直接推进(blockAdvance 模式下转 pending)
 *
 * 注意:测试员手选角色后,其余席位由 assignRemainingTestSeats 自动补齐为 bot。
 */
export class BotRunner {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private ctx: BotContext) {}

  /** 启动轮询(仅测试模式有效)。 */
  schedule(): void {
    if (!this.ctx.isTestMode()) return;
    this.timer = setTimeout(() => this.tick(), 800);
  }

  /** 停止轮询(Room 销毁/重置时调用,防止悬挂定时器)。 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const state = this.ctx.getState();
    const script = this.ctx.getScript();
    const engine = this.ctx.getEngine();
    if (!this.ctx.isTestMode() || state.status !== 'playing' || !script || !engine) return;

    const phase = script.phases.find((p) => p.id === state.currentPhaseId);
    if (!phase) return;

    const allowed = new Set(phase.allowedActions || []);
    const rt = state.phaseRuntime;
    const botIds = this.ctx.botIds();

    if (allowed.has('ready')) {
      for (const p of state.players) {
        if (p.charId && !rt.actedCharIds.includes(p.charId)) {
          engine.handleAction(p.charId, { kind: 'ready' });
        }
      }
    } else if (allowed.has('speak') && phase.kind === 'sequential' && phase.turnOrder) {
      const idx = rt.turnIndex ?? 0;
      const turnCharId = phase.turnOrder[idx];
      if (turnCharId && !rt.actedCharIds.includes(turnCharId)) {
        const charName = script.characters.find((c) => c.id === turnCharId)?.name ?? '???';
        engine.handleAction(turnCharId, { kind: 'speak', text: `我是${charName}，目前没有特别的发现。` });
      }
    } else if (allowed.has('castVote')) {
      // 仅 bot 自动投票,测试员手动投
      const playable = script.characters.filter((c) => !c.isVictim);
      for (const p of state.players) {
        if (!p.charId || !botIds.includes(p.playerId)) continue;
        if (p.charId in state.votes) continue;
        // 随机选一个其他角色作为投票目标
        const others = playable.filter((c) => c.id !== p.charId);
        const target = others.length > 0
          ? others[Math.floor(Math.random() * others.length)]!.id
          : playable[0]!.id;
        engine.handleAction(p.charId, { kind: 'castVote', targetCharId: target });
      }
    } else if (allowed.has('searchClue')) {
      // bot 自动搜证 + 自动公开,测试员手动搜;bot 搜完后标记可推进
      this.autoSearch(script, state, rt, engine, botIds, phase.maxSearches);
    } else if (allowed.has('submitTheory')) {
      // Bot 自动提交推理
      for (const p of state.players) {
        if (!p.charId || !botIds.includes(p.playerId)) continue;
        if (state.theories[p.charId]) continue;
        engine.handleAction(p.charId, { kind: 'submitTheory', text: '根据目前掌握的线索,我认为凶手另有其人。' });
      }
      // 全部提交后推进
      engine.forceAdvance();
    } else if (phase.exit.kind === 'hostAdvance' || phase.exit.kind === 'timer') {
      // hostAdvance/timer 阶段自动推进(blockAdvance 模式下转为 pending)
      engine.forceAdvance();
    }

    this.schedule();
  }

  /** searchClue 环节的 bot 行动:优先秘密线索,其次普通线索,搜尽或次数用尽则推进。 */
  private autoSearch(
    script: Script,
    state: RuntimeState,
    rt: RuntimeState['phaseRuntime'],
    engine: PhaseEngine,
    botIds: readonly string[],
    maxSearches: number | undefined,
  ): void {
    const allAcquiredIds = new Set(Object.values(state.acquiredClues).flat());

    // 构建 bot 角色 ID 集合
    const botCharIdArr: string[] = [];
    for (const p of state.players) {
      if (botIds.includes(p.playerId) && p.charId) botCharIdArr.push(p.charId);
    }

    // 分离秘密线索和普通线索
    const secretAvailable: typeof script.clues = [];
    const regularAvailable: typeof script.clues = [];
    for (const c of script.clues) {
      if (!state.flags[`unlocked:${c.id}`]) continue;
      if (allAcquiredIds.has(c.id)) continue;
      if (c.visibility === 'searchable') {
        regularAvailable.push(c);
      } else if (c.visibility === 'private' && c.requiredSkill) {
        // 检查 bot 角色是否有对应技能
        const skill = c.requiredSkill!;
        const hasSkill = script.characters.some(
          (ch) => ch.id && botCharIdArr.includes(ch.id) && ch.skills?.includes(skill),
        );
        if (hasSkill) secretAvailable.push(c);
      }
    }

    // 策略：优先搜秘密线索，再搜普通线索
    const available = [...secretAvailable, ...regularAvailable];

    let allBotsIdle = true;
    for (const p of state.players) {
      if (!p.charId || !botIds.includes(p.playerId)) continue;
      const acquired = new Set(state.acquiredClues[p.charId] ?? []);
      const botCount = rt.searchCount?.[p.charId] ?? 0;
      if (maxSearches && botCount >= maxSearches) continue;
      if (available.length === 0) continue;

      // 还有次数且还有线索 → 搜索
      for (const clue of available) {
        if (!acquired.has(clue.id)) {
          const result = engine.handleAction(p.charId, { kind: 'searchClue', clueId: clue.id });
          if (result.ok) {
            engine.handleAction(p.charId, { kind: 'revealClue', clueId: clue.id });
            available.splice(available.indexOf(clue), 1);
          }
          allBotsIdle = false;
          break;
        }
      }
    }
    // 所有bot次数用尽或所有线索已搜完 → 标记可推进
    if (allBotsIdle || available.length === 0) {
      engine.forceAdvance();
    }
  }
}
