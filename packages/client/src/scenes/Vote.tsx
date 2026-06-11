import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { PhaseStatus } from '../components/PhaseStatus.js';
import { pushToast } from '../lib/toast.js';

export function VoteScene() {
  const view = useGameStore((s) => s.view);
  const send = useGameStore((s) => s.send);
  const playerId = useGameStore((s) => s.playerId);
  const myCharId = view?.players.find((p) => p.playerId === playerId)?.charId;
  const scriptId = view?.selectedScript?.id;
  const hasVoted = myCharId && view?.votesPublic?.[myCharId];
  const [selected, setSelected] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // 终局倒数(全部投完后)
  const [countdown, setCountdown] = useState<{ n: number; key: number } | null>(null);
  const prevVotedCount = useRef<number>(0);
  const selectedChar = view?.publicCharacters.find((c) => c.id === selected);
  const votedIds = new Set(Object.keys(view?.votesPublic ?? {}));
  const requiredIds = view?.phaseProgress?.requiredCharIds ?? [];
  const pendingIds = requiredIds.filter((id) => !votedIds.has(id));
  const myVoteTarget = hasVoted && hasVoted !== '__voted__'
    ? view?.publicCharacters.find((c) => c.id === hasVoted)?.name
    : undefined;

  const suspects = view?.publicCharacters.filter(
    (c) => c.id !== myCharId && !c.id.startsWith('c_victim'),
  );

  const restrictTargets = view?.currentPhase?.restrictVoteTargets;
  const isTiebreaker = !!restrictTargets;
  const filteredSuspects = restrictTargets
    ? suspects?.filter((c) => restrictTargets.includes(c.id))
    : suspects;

  const chooseSuspect = (charId: string) => {
    if (submitted || hasVoted) return;
    setSelected(charId);
    setConfirming(false);
  };

  const castVote = () => {
    if (!selected) return;
    setSubmitted(true);
    send({ kind: 'castVote', targetCharId: selected });
    const name = view?.publicCharacters.find((c) => c.id === selected)?.name ?? '该角色';
    pushToast(`已投给 ${name}`, 'success', 2200);
  };

  // 监看:全投完(pendingIds 从非空→空)触发 3-2-1 倒数
  useEffect(() => {
    const cur = votedIds.size;
    const prev = prevVotedCount.current;
    if (pendingIds.length === 0 && cur > 0 && cur > prev) {
      // 投出后新增 1 票,且现在没人在等,启动倒数
      setCountdown({ n: 3, key: Date.now() });
    }
    prevVotedCount.current = cur;
  }, [votedIds.size, pendingIds.length]);

  useEffect(() => {
    if (!countdown) return;
    if (countdown.n <= 0) {
      setCountdown(null);
      return;
    }
    const t = window.setTimeout(() => {
      setCountdown({ n: countdown.n - 1, key: countdown.key });
    }, 900);
    return () => window.clearTimeout(t);
  }, [countdown]);

  return (
    <div className="vote-stage">
      <PhaseStatus />
      <div className="vote-heading">
        <div className="scene-heading">{view?.currentPhase?.title ?? '投票环节'}</div>
        <div className="scene-subheading">
          {isTiebreaker
            ? `平票决胜 — 在 ${filteredSuspects?.map((c) => c.name).join('、')} 中选择`
            : '选择你认为的嫌疑人'}
        </div>
        {isTiebreaker && <div className="badge badge-crimson" style={{ marginTop: 8 }}>平票决胜轮</div>}
      </div>

      <div className="vote-status-board">
        <div className="summary-tile">
          <span>已投</span>
          <strong>{votedIds.size}/{requiredIds.length || suspects?.length || 0}</strong>
        </div>
        <div className="vote-roster">
          {requiredIds.map((id) => {
            const ch = view?.publicCharacters.find((c) => c.id === id);
            const voted = votedIds.has(id);
            return (
              <span key={id} className={`vote-chip${voted ? ' voted' : ''}`}>
                {ch?.name ?? id}
              </span>
            );
          })}
        </div>
        {pendingIds.length > 0 && (
          <div className="summary-note">
            等待 {pendingIds.map((id) => view?.publicCharacters.find((c) => c.id === id)?.name ?? id).join('、')} 投票
          </div>
        )}
        {pendingIds.length === 0 && (
          <div className="summary-note">投票完成,即将揭晓真相</div>
        )}
      </div>

      {hasVoted ? (
        <div className="vote-done">
          <span className="badge badge-sage vote-done-badge">已投票</span>
          {myVoteTarget && (
            <div className="vote-done-choice">
              你的选择：<strong>{myVoteTarget}</strong>
            </div>
          )}
          <div className="vote-waiting pulse">
            等待其他玩家投票...
          </div>
        </div>
      ) : (
        <>
          <div className="vote-suspect-grid">
            {filteredSuspects?.map((c) => {
              const isSelected = selected === c.id;
              const url = assetUrl(scriptId, c.avatar);
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`选择${c.name}`}
                  className={`portrait-card vote-suspect-card${isSelected ? ' accused' : ''}${submitted ? ' locked' : ''}`}
                  onClick={() => chooseSuspect(c.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseSuspect(c.id); } }}
                >
                  {url ? <img src={url} alt={c.name} loading="lazy" decoding="async" /> : <div className="portrait-fallback">{c.name.charAt(0)}</div>}
                  <div className="portrait-overlay">
                    <div className="portrait-name">{c.name}</div>
                    <div className="portrait-sub">{c.publicProfile.slice(0, 36)}</div>
                  </div>
                  {isSelected && (
                    <div className="portrait-check vote-check">✓</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="vote-confirm-panel">
            <div>
              <div className="vote-confirm-label">当前选择</div>
              <div className={`vote-confirm-name${selectedChar ? ' active' : ''}`}>
                {selectedChar?.name ?? '尚未选择嫌疑人'}
              </div>
              {selectedChar && (
                <p className="vote-confirm-profile">{selectedChar.publicProfile}</p>
              )}
            </div>
            {confirming ? (
              <div className="vote-confirm-actions">
                <span>投票后不可更改</span>
                <button
                  onClick={castVote}
                  disabled={!selected || submitted}
                  className="btn btn-danger"
                >
                  {submitted ? '已提交' : '确认投票'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={submitted}
                  className="btn btn-secondary"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => selected && setConfirming(true)}
                disabled={!selected}
                className="btn btn-danger"
              >
                准备投票
              </button>
            )}
          </div>
        </>
      )}

      {countdown && (
        <div className="vote-countdown-overlay" key={countdown.key}>
          <div className="vote-countdown-number">{countdown.n > 0 ? countdown.n : 'GO'}</div>
        </div>
      )}
    </div>
  );
}
