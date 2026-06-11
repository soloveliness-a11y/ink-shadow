import { useEffect, useState } from 'react';

/**
 * 逐字显现文本。Reveal.tsx 揭示 narrative/truthReveal 用。
 * 支持 onDone 回调,可在打字完成时触发下一步。
 */
export function useTypewriter(
  text: string,
  options: { speed?: number; startDelay?: number; enabled?: boolean } = {},
): { displayed: string; done: boolean } {
  const { speed = 28, startDelay = 80, enabled = true } = options;
  const [displayed, setDisplayed] = useState(enabled ? '' : text);
  const [done, setDone] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      setDone(true);
      return;
    }
    setDisplayed('');
    setDone(false);
    let i = 0;
    let cancelled = false;
    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      const handle = window.setInterval(() => {
        if (cancelled) return;
        i += 1;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          window.clearInterval(handle);
          setDone(true);
        }
      }, speed);
    }, startDelay);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
    };
  }, [text, speed, startDelay, enabled]);

  return { displayed, done };
}
