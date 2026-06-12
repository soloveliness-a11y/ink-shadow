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

  const skip = useCallback(() => {
    cancelledRef.current = true;
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
    let i = 0;
    const startTimer = window.setTimeout(() => {
      if (cancelledRef.current) return;
      const handle = window.setInterval(() => {
        if (cancelledRef.current) return;
        i += 1;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          window.clearInterval(handle);
          setDone(true);
        }
      }, speed);
    }, startDelay);
    return () => {
      cancelledRef.current = true;
      window.clearTimeout(startTimer);
    };
  }, [text, speed, startDelay, enabled]);

  return { displayed, done, skip };
}
