import { useGameStore } from '../store/game.js';

export function EndingPaths() {
  const view = useGameStore((s) => s.view);
  if (!view?.votesPublic || !view.ending) return null;

  const chars = view.publicCharacters;
  const entries = Object.entries(view.votesPublic).filter(([, t]) => t !== '__voted__');
  if (entries.length === 0) return null;

  const tally = new Map<string, number>();
  for (const [, tid] of entries) {
    tally.set(tid, (tally.get(tid) ?? 0) + 1);
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const totalVotes = entries.length;
  const maxVotes = sorted[0]?.[1] ?? 0;
  const topSuspects = sorted.filter(([, v]) => v === maxVotes);
  const isTie = topSuspects.length > 1;

  return (
    <div className="ending-paths">
      <div className="section-label reveal-truth-label">投票结果</div>

      <div className="ending-tally">
        {sorted.map(([charId, count]) => {
          const name = chars.find((c) => c.id === charId)?.name ?? charId;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isTop = count === maxVotes;
          return (
            <div key={charId} className={`ending-tally-row${isTop ? ' top' : ''}`}>
              <span className="ending-tally-name">{name}</span>
              <div className="ending-tally-bar-wrap">
                <div className="ending-tally-bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="ending-tally-count">{count}票</span>
            </div>
          );
        })}
      </div>

      <div className="ending-paths-divider" />

      <div className="section-label reveal-truth-label">可能的结局</div>
      <div className="ending-path-cards">
        {topSuspects.map(([charId]) => {
          const name = chars.find((c) => c.id === charId)?.name ?? charId;
          return (
            <div key={charId} className="ending-path-card">
              <div className="ending-path-arrow">
                {isTie ? '⚖️' : '▸'}
              </div>
              <div className="ending-path-body">
                <div className="ending-path-hypothesis">
                  若 <strong>{name}</strong> 是凶手
                </div>
                <div className="ending-path-result">
                  → 触发对应结局分支
                </div>
              </div>
            </div>
          );
        })}
        {isTie && (
          <div className="ending-path-card ending-path-tie">
            <div className="ending-path-arrow">⚡</div>
            <div className="ending-path-body">
              <div className="ending-path-hypothesis">
                平票决选
              </div>
              <div className="ending-path-result">
                {topSuspects.map(([id]) => chars.find((c) => c.id === id)?.name ?? id).join('、')}
                {' '}票数相同，触发额外判定
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ending-paths-divider" />

      <div className="section-label reveal-truth-label">实际结局</div>
      <div className="ending-actual">
        <div className="ending-actual-title">{view.ending.title}</div>
        <p className="ending-actual-narrative">
          {view.ending.narrative.length > 200
            ? view.ending.narrative.slice(0, 200) + '…'
            : view.ending.narrative}
        </p>
      </div>
    </div>
  );
}
