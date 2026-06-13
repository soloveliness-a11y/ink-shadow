/**
 * Timer audio feedback — Web Audio API, no files needed.
 * Short beeps for countdown urgency. Respects browser autoplay policy:
 * silent until user interaction unlocks AudioContext (same gate as BGM).
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Short single beep (~60ms) */
export function playTick() {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.08, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.06);
}

/** Double-beep warning (~180ms) */
export function playWarning() {
  const ac = getCtx();
  if (!ac) return;
  [0, 0.1].forEach((offset) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.12, ac.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + offset + 0.07);
    osc.connect(gain).connect(ac.destination);
    osc.start(ac.currentTime + offset);
    osc.stop(ac.currentTime + offset + 0.07);
  });
}
