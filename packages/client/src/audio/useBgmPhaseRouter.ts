/**
 * useBgmPhaseRouter - 把 game store 的 phase 变化映射到 BGM 槽位
 *
 * 调用方式: 在 App.tsx 顶层放一次即可
 */
import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/game.js';
import { bgmEngine } from './bgmEngine.js';
import type { BgmSlot } from './bgmSlots.js';

function resolveSlot(status: string | undefined, phaseKind: string | undefined): BgmSlot | null {
  if (status === 'lobby' || status === undefined) return 'lobby';
  if (status === 'finished') return 'finished';
  if (status === 'assigning') return 'briefing';
  if (status === 'playing') {
    switch (phaseKind) {
      case 'briefing': return 'briefing';
      case 'intro': return 'intro';
      case 'free': return 'free';
      case 'vote': return 'vote';
      case 'reveal': return 'reveal';
      default: return null;
    }
  }
  return null;
}

export function useBgmPhaseRouter() {
  const status = useGameStore((s) => s.view?.status);
  const phaseKind = useGameStore((s) => s.view?.currentPhase?.kind);
  const lastSlotRef = useRef<BgmSlot | null>(null);

  useEffect(() => {
    const slot = resolveSlot(status, phaseKind);
    if (slot && slot !== lastSlotRef.current) {
      lastSlotRef.current = slot;
      bgmEngine.playSlot(slot);
    }
  }, [status, phaseKind]);
}
