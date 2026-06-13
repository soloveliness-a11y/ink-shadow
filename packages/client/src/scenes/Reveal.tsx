import { useEffect, useState } from 'react';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { useExcerptSelection } from '../hooks/useExcerptSelection.js';

export function RevealScene() {
  const view = useGameStore((s) => s.view);
  const ending = view?.ending;
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 60); return () => clearTimeout(t); }, []);

  // 重新进入时,key 用 ending.title 强制重放(useTypewriter 内 effect 跟 ending 变化)
  const narrative = useTypewriter(ending?.narrative ?? '', {
    speed: 24,
    startDelay: 800,
    enabled: !!ending,
  });
  const truth = useTypewriter(ending?.truthReveal ?? '', {
    speed: 22,
    startDelay: (ending?.narrative?.length ?? 0) * 24 + 1400,
    enabled: !!ending,
  });

  const excerpt = useExcerptSelection({
    selector: '.reveal-narrative, .reveal-truth',
    resolveSource: () => '真相揭晓',
  });

  return (
    <div className={`reveal-stage${show ? ' show' : ''}`} onMouseUp={excerpt.onMouseUp}>
      <div className="reveal-card">
        <div className="reveal-eyebrow">
          <span className="reveal-line" /> 真相揭晓 <span className="reveal-line" />
        </div>

        {ending ? (
          <>
            <h1 className="reveal-title">{ending.title}</h1>
            <div className="reveal-divider" />
            <p className="reveal-narrative">
              {narrative.displayed || '\u00A0'}
              <span className="briefing-caret">{!narrative.done ? '▍' : ''}</span>
            </p>
            <div className="reveal-divider" />
            <div className="section-label reveal-truth-label">案件真相</div>
            <p className="reveal-truth">
              {truth.displayed || '\u00A0'}
              <span className="briefing-caret">{!truth.done ? '▍' : ''}</span>
            </p>
            {(!narrative.done || !truth.done) && (
              <div className="reveal-skip">
                <button
                  onClick={() => { if (!narrative.done) narrative.skip(); if (!truth.done) truth.skip(); }}
                  className="btn btn-ghost"
                >
                  跳过 ▸▸
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="reveal-loading">真相即将揭晓…</p>
        )}
      </div>
      {excerpt.toolbar}
    </div>
  );
}

export function FinishedScene() {
  const view = useGameStore((s) => s.view);
  const coverUrl = assetUrl(view?.selectedScript?.id, view?.selectedScript?.cover?.asset?.path);
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 60); return () => clearTimeout(t); }, []);

  return (
    <div className={`reveal-stage finished${show ? ' show' : ''}`}>
      <div className="reveal-card">
        <div className="badge badge-sage reveal-finished-badge">游戏结束</div>

        {coverUrl && (
          <img src={coverUrl} alt="" className="reveal-cover" loading="lazy" decoding="async" />
        )}

        <RevealRecap />

        <div className="reveal-divider" />
        <div className="reveal-thanks">感谢各位的精彩推理</div>
        <button onClick={() => window.location.reload()} className="btn btn-secondary btn-lg">返回大厅</button>
      </div>
    </div>
  );
}

function RevealRecap() {
  const view = useGameStore((s) => s.view);
  if (!view) return null;

  const speakCount = view.log.filter((e) => e.type === 'speak').length;
  const searchCount = view.log.filter((e) => e.type === 'search_clue').length;
  const revealCount = view.log.filter((e) => e.type === 'reveal_clue').length;
  const voteCount = view.log.filter((e) => e.type === 'vote_cast').length;

  // 票型汇总
  const votesPublic = view.votesPublic;
  const voteEntries = votesPublic ? Object.entries(votesPublic).filter(([_, t]) => t !== '__voted__') : [];
  const voteTally = new Map<string, number>();
  for (const [_, targetId] of voteEntries) {
    voteTally.set(targetId, (voteTally.get(targetId) ?? 0) + 1);
  }

  return (
    <div className="reveal-recap">
      <div className="section-label reveal-truth-label">本局复盘</div>
      <div className="reveal-recap-grid">
        <RecapMetric label="公开线索" value={view.revealedClues.length} />
        <RecapMetric label="搜证行动" value={searchCount} />
        <RecapMetric label="公开发言" value={speakCount} />
        <RecapMetric label="投票记录" value={voteCount} />
      </div>
      {revealCount > 0 && (
        <p className="reveal-recap-note">共有 {revealCount} 次线索公开推动了案情讨论。</p>
      )}
      {voteEntries.length > 0 && (
        <div className="reveal-event-list">
          <div className="reveal-event-row" style={{ color: 'var(--accent)', fontWeight: 600, borderBottom: '1px solid var(--s4)' }}>
            <span>投票</span>
            <strong>票型结果</strong>
          </div>
          {voteEntries.map(([voterId, targetId]) => {
            const voter = view.publicCharacters.find(c => c.id === voterId)?.name ?? voterId;
            const target = view.publicCharacters.find(c => c.id === targetId)?.name ?? targetId;
            return (
              <div key={`vote-${voterId}`} className="reveal-event-row">
                <span>投票</span>
                <strong>{voter} → {target}</strong>
              </div>
            );
          })}
        </div>
      )}

      {/* 玩家推理 */}
      {view.ending?.theories && Object.keys(view.ending.theories).length > 0 && (
        <div className="reveal-theories">
          <div className="section-label reveal-truth-label">玩家推理</div>
          {Object.entries(view.ending.theories).map(([charId, theory]) => {
            const charName = view.publicCharacters.find(c => c.id === charId)?.name ?? charId;
            return (
              <div key={charId} className="reveal-theory-card">
                <div className="reveal-theory-author">{charName}</div>
                <p className="reveal-theory-text">{theory}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecapMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="reveal-recap-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
