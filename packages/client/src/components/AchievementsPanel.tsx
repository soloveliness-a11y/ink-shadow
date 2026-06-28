import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getStats, getAllAchievements } from '../lib/achievements.js';

export function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const stats = useMemo(() => getStats(), []);
  const achievements = useMemo(() => getAllAchievements(stats.unlocked), [stats.unlocked]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = panel.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', handler); };
  }, [onClose]);

  return createPortal(
    <div className="ach-overlay" onClick={onClose}>
      <div className="ach-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="战绩与成就" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ach-header">
          <span className="ach-title">战绩与成就</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
        </div>

        <div className="ach-stats-grid">
          <div className="ach-stat">
            <span className="ach-stat-value">{stats.totalGames}</span>
            <span className="ach-stat-label">总场次</span>
          </div>
          <div className="ach-stat">
            <span className="ach-stat-value">{stats.winRate}%</span>
            <span className="ach-stat-label">正确率</span>
          </div>
          <div className="ach-stat">
            <span className="ach-stat-value">{stats.correctVotes}</span>
            <span className="ach-stat-label">正确指认</span>
          </div>
          <div className="ach-stat">
            <span className="ach-stat-value">{stats.totalCluesFound}</span>
            <span className="ach-stat-label">线索发现</span>
          </div>
        </div>

        <div className="section-label" style={{ margin: '16px 0 10px' }}>成就</div>
        <div className="ach-grid">
          {achievements.map((a) => (
            <div key={a.id} className={`ach-card${a.unlocked ? ' unlocked' : ''}`}>
              <div className="ach-icon">{a.icon}</div>
              <div className="ach-info">
                <div className="ach-name">{a.name}</div>
                <div className="ach-desc">{a.desc}</div>
              </div>
              {a.unlocked && <span className="ach-check">✓</span>}
            </div>
          ))}
        </div>

        {stats.records.length > 0 && (
          <>
            <div className="section-label" style={{ margin: '16px 0 10px' }}>最近记录</div>
            <div className="ach-history">
              {stats.records.slice(-5).reverse().map((r, i) => (
                <div key={i} className="ach-history-row">
                  <span className="ach-history-script">{r.scriptTitle}</span>
                  <span className="ach-history-char">{r.charName}</span>
                  <span className={`ach-history-vote${r.isCorrectVote ? ' correct' : ''}`}>
                    {r.isCorrectVote ? '✓ 正确' : '✗ 偏差'}
                  </span>
                  <span className="ach-history-date">{new Date(r.playedAt).toLocaleDateString('zh-CN')}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
