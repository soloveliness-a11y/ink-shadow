import type { PhaseFlow, PhaseEdge, FlowCondition, RuntimeState } from '@mmg/schema';

/**
 * 从 DAG 中选择下一个环节。按 edges 顺序求值 condition,命中第一条即转移。
 * 无命中 → 返回 null(终局)。
 */
export function selectNextPhase(flow: PhaseFlow, state: RuntimeState, fromPhaseId: string): string | null {
  const candidates = flow.edges.filter((e: PhaseEdge) => e.from === fromPhaseId);

  for (const edge of candidates) {
    if (evaluateFlowCondition(edge.condition, state)) return edge.to;
  }
  const revealFallback = candidates.find((e) => e.condition?.kind === 'voteResult');
  if (revealFallback) return revealFallback.to;
  return null;
}

/** 统计票数:targetCharId -> 票数 */
export function tallyVotes(votes: Record<string, string>): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) {
    tally[target] = (tally[target] ?? 0) + 1;
  }
  return tally;
}

/** 多数票唯一胜者(平票/无票返回 null) */
export function majorityWinner(votes: Record<string, string>): string | null {
  const tally = tallyVotes(votes);
  const maxVotes = Math.max(0, ...Object.values(tally));
  if (maxVotes === 0) return null;
  const winners = Object.entries(tally).filter(([, v]) => v === maxVotes).map(([k]) => k);
  return winners.length === 1 ? winners[0]! : null;
}

/** 返回平票角色 ID 数组(最高票且多人共享);无票或无平票返回空数组 */
export function tieCharIds(votes: Record<string, string>): string[] {
  const tally = tallyVotes(votes);
  const maxVotes = Math.max(0, ...Object.values(tally));
  if (maxVotes === 0) return [];
  const winners = Object.entries(tally).filter(([, v]) => v === maxVotes).map(([k]) => k);
  return winners.length > 1 ? winners : [];
}

/**
 * 求值流程/结局条件。flow edge 与 ending 共用同一 FlowCondition 契约,
 * 因此判定逻辑必须单点实现,杜绝"DAG 实际走向"与"展示结局"漂移(P1-5)。
 */
export function evaluateFlowCondition(cond: FlowCondition | undefined, state: RuntimeState): boolean {
  if (!cond || cond.kind === 'always') return true;

  if (cond.kind === 'voteResult') {
    return majorityWinner(state.votes) === cond.equalsCharId;
  }

  if (cond.kind === 'voteTie') {
    return majorityWinner(state.votes) === null && Object.keys(state.votes).length > 0;
  }

  if (cond.kind === 'flag') {
    return !!state.flags[cond.flag] === cond.equals;
  }

  return false;
}
