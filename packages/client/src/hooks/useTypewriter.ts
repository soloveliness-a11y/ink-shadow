import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 逐字显现文本。支持 skip() 立即显示全部。
 */
export function useTypewriter(
  text: string,
  options: { speed?: number; startDelay?: number; enabled?: boolean } = {},
): { displayed: string; done: boolean; skip: () => void } {
  const { speed = 28, startDelay = 80, enabled = true } = options;
  const [displayed, setDisplayed] = useState(enabled ? '' : text);
  const [done, setDone] = useState(!enabled);
  const cancelledRef = useRef(false);
  // #8: 保存 interval handle,使 cleanup 能在 startTimer 已 fire 后清理 interval,避免泄漏
  const intervalRef = useRef<number | null>(null);

  const skip = useCallback(() => {
    cancelledRef.current = true;
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setDisplayed(text);
    setDone(true);
  }, [text]);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      setDone(true);
      return;
    }
    setDisplayed('');
    setDone(false);
    cancelledRef.current = false;
    intervalRef.current = null;
    let i = 0;
    const startTimer = window.setTimeout(() => {
      if (cancelledRef.current) return;
      intervalRef.current = window.setInterval(() => {
        if (cancelledRef.current) return;
        i += 1;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setDone(true);
        }
      }, speed);
    }, startDelay);
    return () => {
      cancelledRef.current = true;
      window.clearTimeout(startTimer);
      // #8: startTimer 已 fire 进入 interval 阶段时,这里清掉它
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [text, speed, startDelay, enabled]);

  return { displayed, done, skip };
}
