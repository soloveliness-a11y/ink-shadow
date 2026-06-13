import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/game.js';
import { useTypewriter } from '../hooks/useTypewriter.js';

/**
 * AI DM 旁白浮动面板。
 * 渲染在画面右下角，新旁白到达时用打字机效果逐字显示。
 * 可折叠回看最近 5 条历史。
 */
export function DmNarrative() {
  const dmNarratives = useGameStore((s) => s.dmNarratives);
  const dmEnabled = useGameStore((s) => s.view?.dmEnabled);
  const status = useGameStore((s) => s.view?.status);

  if (status !== 'playing' && status !== 'finished') return null;
  if (!dmEnabled && dmNarratives.length === 0) return null;

  return <DmNarrativeInner narratives={dmNarratives} enabled={!!dmEnabled} />;
}

function DmNarrativeInner({ narratives, enabled }: { narratives: Array<{ text: string; ts: number }>; enabled: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const latest = narratives[narratives.length - 1];
  const prevLatestTs = useRef(latest?.ts);
  const [activeText, setActiveText] = useState(latest?.text ?? '');

  // 当新旁白到达时更新
  useEffect(() => {
    if (latest && latest.ts !== prevLatestTs.current) {
      prevLatestTs.current = latest.ts;
      setActiveText(latest.text);
      setExpanded(true);
    }
  }, [latest]);

  const typewriter = useTypewriter(activeText, {
    speed: 30,
    startDelay: 100,
    enabled: expanded,
  });

  // 没有旁白但 DM 已启用 → 显示就位图标
  if (narratives.length === 0) {
    return (
      <div className="dm-narrative-panel dm-standby">
        <div className="dm-narrative-toggle" title="说书人已就位，等待旁白...">
          <span className="dm-narrative-icon">🎭</span>
        </div>
      </div>
    );
  }

  const history = narratives.slice(0, -1).slice(-5).reverse();

  return (
    <div className={`dm-narrative-panel${expanded ? ' expanded' : ' collapsed'}`}>
      <button
        className="dm-narrative-toggle"
        onClick={() => setExpanded(!expanded)}
        title={expanded ? '收起旁白' : '说书人旁白'}
      >
        <span className="dm-narrative-icon">🎭</span>
        {!expanded && <span className="dm-narrative-badge" />}
      </button>

      {expanded && (
        <div className="dm-narrative-body">
          <div className="dm-narrative-label">说书人</div>
          <p className="dm-narrative-text">
            {typewriter.displayed || ' '}
            {!typewriter.done && <span className="dm-narrative-caret">▍</span>}
          </p>
          {!typewriter.done && (
            <button
              className="btn btn-ghost btn-xs dm-narrative-skip"
              onClick={() => typewriter.skip()}
            >
              跳过 ▸▸
            </button>
          )}

          {history.length > 0 && (
            <details className="dm-narrative-history">
              <summary>历史旁白 ({history.length})</summary>
              {history.map((n: { text: string; ts: number }, i: number) => (
                <p key={`${n.ts}-${i}`} className="dm-narrative-history-item">{n.text}</p>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
