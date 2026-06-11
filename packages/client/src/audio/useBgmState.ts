/**
 * useBgmState - 订阅 BGM 引擎状态的 React Hook
 */
import { useEffect, useSyncExternalStore } from 'react';
import { bgmEngine, type BgmEngineState } from './bgmEngine.js';

const subscribe = (cb: () => void) => bgmEngine.subscribe(() => cb());
const getSnapshot = (): BgmEngineState => {
  // getSnapshot 每次返回新对象会导致无限循环, 所以固定返回 engine 内部状态引用
  // 这里我们用 useSyncExternalStore 的标准模式: 缓存同一引用
  return snapshotCache;
};
let snapshotCache: BgmEngineState = {
  currentSlot: null,
  currentTrackId: null,
  volume: 0.55,
  muted: false,
  isPlaying: false,
  unlocked: false,
};
bgmEngine.subscribe((s) => { snapshotCache = s; });

export function useBgmState(): BgmEngineState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 解锁 BGM (用户首次交互后调用) */
export function useBgmUnlock() {
  useEffect(() => {
    const handler = () => {
      bgmEngine.unlock();
      // 解锁一次后即可移除, 不需要持续监听
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);
}
