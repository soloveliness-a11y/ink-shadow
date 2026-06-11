import { useEffect, useRef, useState } from 'react';

/**
 * 数字 0→target 缓动(默认 600ms 缓出)。
 * 用于 summary-tile 数字、投票计数等"数字活起来"的场景。
 */
export function useCountUp(
  target: number,
  options: { duration?: number; enabled?: boolean } = {},
): number {
  const { duration = 600, enabled = true } = options;
  const [value, setValue] = useState(enabled ? 0 : target);
  const fromRef = useRef(enabled ? 0 : target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const start = fromRef.current;
    const delta = target - start;
    if (delta === 0) {
      setValue(target);
      return;
    }
    const t0 = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const elapsed = now - t0;
      const p = Math.min(1, elapsed / duration);
      const next = Math.round(start + delta * easeOut(p));
      setValue(next);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, enabled]);

  return value;
}
