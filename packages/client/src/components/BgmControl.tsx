import { useBgmState } from '../audio/useBgmState.js';
import { bgmEngine } from '../audio/bgmEngine.js';
import './BgmControl.css';

export function BgmControl() {
  const { muted, currentSlot, unlocked, currentTrackId } = useBgmState();

  return (
    <div className="bgm-panel">
      {/* 随机切歌按钮 */}
      <button
        className="bgm-shuffle"
        onClick={() => bgmEngine.switchTrack()}
        title="换一首BGM"
        aria-label="换一首BGM"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 014-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      </button>

      {/* 静音按钮 */}
      <button
        className={`bgm-control ${muted ? 'is-muted' : ''}`}
        onClick={() => bgmEngine.toggleMute()}
        title={muted ? '开启 BGM' : '关闭 BGM'}
        aria-label={muted ? '开启 BGM' : '关闭 BGM'}
      >
        {muted ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 010 7.07" className={unlocked && currentSlot ? 'anim-wave' : ''} />
            <path d="M19.07 4.93a10 10 0 010 14.14" className={unlocked && currentSlot ? 'anim-wave-2' : ''} />
          </svg>
        )}
      </button>
    </div>
  );
}
