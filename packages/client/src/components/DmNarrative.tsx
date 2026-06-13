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
  const status = useGameStore((s) => s.view?.status);

  if (status !== 'playing' && status !== 'finished') return null;
  if (dmNarratives.length === 0) return null;

  return <DmNarrativeInner narratives={dmNarratives} />;
}

function DmNarrativeInner({ narratives }: { narratives: Array<{ text: string; ts: number }> }) {
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
            {typewriter.displayed || ' '}
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
              {history.map((n, i) => (
                <p key={`${n.ts}-${i}`} className="dm-narrative-history-item">{n.text}</p>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
