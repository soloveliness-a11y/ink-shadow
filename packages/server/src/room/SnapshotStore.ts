import type { RuntimeState } from '@mmg/schema';

/**
 * 测试模式的状态快照栈(从 Room 抽出)。
 *
 * 用途:测试员可在「推进到下一环节」后回退到上一环节,逐环节预览剧本。
 * 每次进入新 phase(phase_enter)前由 Room 调 push() 保存当前完整状态;
 * 回退时 Room 调 popToPrevious() 拿到上一份状态覆盖 this.state,并重建引擎。
 *
 * 设计:本类只负责快照的存与取(纯数据),不碰引擎重建/广播 —— 那是 Room 的职责,
 * 因为重建引擎需要 script + broadcaster,放在这里会造成耦合。
 */
export class SnapshotStore {
  private stack: RuntimeState[] = [];

  /** 当前栈深度(测试断言/调试用)。 */
  get depth(): number {
    return this.stack.length;
  }

  /** 保存当前状态的深拷贝。 */
  push(state: RuntimeState): void {
    this.stack.push(structuredClone(state));
  }

  /**
   * 回退到上一份快照。
   * @returns 上一份状态的深拷贝(供 Room 覆盖 this.state);不足 2 份时返回 null。
   *
   * 约定:栈顶 = 当前状态,栈顶下一份 = 上一环节。回退需丢弃当前 + 返回上一份,
   * 故要求 depth >= 2。返回的是拷贝,调用方覆盖时不会污染栈内数据。
   */
  popToPrevious(): RuntimeState | null {
    if (this.stack.length < 2) return null;
    this.stack.pop(); // 丢弃当前状态
    const prev = this.stack[this.stack.length - 1]!;
    return structuredClone(prev);
  }

  /** 清空(切剧本/离开测试模式时调用,避免跨局污染)。 */
  clear(): void {
    this.stack = [];
  }
}
