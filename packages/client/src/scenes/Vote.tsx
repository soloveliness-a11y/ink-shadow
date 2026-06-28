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
  // 终局倒数(全部投完后) → 唱票动画
  const [countdown, setCountdown] = useState<{ n: number; key: number } | null>(null);
  const [tallyPhase, setTallyPhase] = useState(false);
  const [revealedVotes, setRevealedVotes] = useState<Array<{ voter: string; target: string }>>([]);
  const prevVotedCount = useRef<number>(0);
  const selectedChar = view?.publicCharacters.find((c) => c.id === selected);
  const voteMode = view?.currentPhase?.voteMode ?? 'char';
  const teamTargets = voteMode === 'team' ? (view?.currentPhase?.restrictVoteTargets ?? []) : [];
  const factionLabel = (f: string): string => ({ red: '红方阵营', blue: '蓝方阵营', neutral: '中立' } as Record<string, string>)[f] ?? `${f} 阵营`;
  const selectedLabel = voteMode === 'team'
    ? (selected ? factionLabel(selected) : '尚未选择阵营')
    : (selectedChar?.name ?? '尚未选择嫌疑人');
  const votedIds = new Set(Object.keys(view?.votesPublic ?? {}));
  const requiredIds = view?.phaseProgress?.requiredCharIds ?? [];
  const pendingIds = requiredIds.filter((id) => !votedIds.has(id));
  const myVoteTarget = hasVoted && typeof hasVoted === 'string' && hasVoted !== '__voted__'
    ? view?.publicCharacters.find((c) => c.id === hasVoted)?.name
    : undefined;

  const suspects = view?.publicCharacters.filter(
    (c) => c.id !== myCharId && !c.isVictim,
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

  // 乐观回退:如果服务端拒绝投票(view 中无我的投票记录),重置 submitted
  useEffect(() => {
    if (!submitted) return;
    if (hasVoted) return;
    // submitted 为 true 但 view 中没有我的投票 → 服务端可能拒绝了
    // 给一个短暂宽限期再检查,避免 stateSync 延迟误判
    const t = window.setTimeout(() => {
      const nowHasVoted = myCharId && view?.votesPublic?.[myCharId];
      if (!nowHasVoted) {
        setSubmitted(false);
        pushToast('投票未成功,请重试', 'warn', 2000);
      }
    }, 2000);
    return () => window.clearTimeout(t);
  }, [submitted, hasVoted, myCharId, view?.votesPublic]);

  // P0-3: 倒数仅在"我投出且投完时恰为最后一人"触发,避免每个玩家都看到全屏倒数
  // 平票重投(pendingIds 从 0 变非空)时立即清理倒数,避免空窗
  useEffect(() => {
    if (pendingIds.length > 0) {
      // 平票重投:清掉可能残留的倒数
      if (countdown) setCountdown(null);
      prevVotedCount.current = votedIds.size;
      return;
    }
    // 仅在我刚投出(submitted 刚变 true)且全员投完时触发
    if (submitted && votedIds.size > prevVotedCount.current && pendingIds.length === 0) {
      setCountdown({ n: 3, key: Date.now() });
    }
    prevVotedCount.current = votedIds.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votedIds.size, pendingIds.length, submitted]);

  useEffect(() => {
    if (!countdown) return;
    if (countdown.n <= 0) {
      setCountdown(null);
      // 倒数结束 → 进入唱票阶段
      if (!tallyPhase) {
        setTallyPhase(true);
        setRevealedVotes([]);
      }
      return;
    }
    const t = window.setTimeout(() => {
      setCountdown({ n: countdown.n - 1, key: countdown.key });
    }, 900);
    return () => window.clearTimeout(t);
  }, [countdown, tallyPhase]);

  // 唱票动画:逐票揭示
  const allVoteEntries = view?.votesPublic
    ? Object.entries(view.votesPublic)
        .filter(([, t]) => t !== '__voted__')
        .map(([voterId, targetId]) => ({
          voter: view.publicCharacters.find(c => c.id === voterId)?.name ?? voterId,
          target: view.publicCharacters.find(c => c.id === targetId)?.name ?? String(targetId),
        }))
    : [];

  useEffect(() => {
    if (!tallyPhase) return;
    if (revealedVotes.length >= allVoteEntries.length) return;
    const t = window.setTimeout(() => {
      setRevealedVotes((prev) => [...prev, allVoteEntries[prev.length]!]);
    }, 800);
    return () => window.clearTimeout(t);
  }, [tallyPhase, revealedVotes.length, allVoteEntries]);

  return (
    <div className="vote-stage">
      <PhaseStatus />
      <div className="vote-heading">
        <div className="scene-heading">{view?.currentPhase?.title ?? '投票环节'}</div>
        <div className="scene-subheading">
          {voteMode === 'team'
            ? '选择你支持的阵营(过半阵营获胜)'
            : isTiebreaker
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
            {voteMode === 'team'
              ? teamTargets.map((faction) => {
                  const isSelected = selected === faction;
                  return (
                    <div
                      key={faction}
                      role="button"
                      tabIndex={0}
                      aria-label={`选择${factionLabel(faction)}`}
                      className={`portrait-card vote-suspect-card${isSelected ? ' accused' : ''}${submitted ? ' locked' : ''}`}
                      onClick={() => chooseSuspect(faction)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseSuspect(faction); } }}
                    >
                      <div className="portrait-fallback">{factionLabel(faction).charAt(0)}</div>
                      <div className="portrait-overlay">
                        <div className="portrait-name">{factionLabel(faction)}</div>
                      </div>
                      {isSelected && <div className="portrait-check vote-check">✓</div>}
                    </div>
                  );
                })
              : filteredSuspects?.map((c) => {
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
                        <div className="portrait-sub portrait-sub-clamp">{c.publicProfile}</div>
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
              <div className={`vote-confirm-name${selected ? ' active' : ''}`}>
                {selectedLabel}
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

      {/* 倒计时 → 唱票动画 */}
      {countdown && (
        <div className="vote-countdown-overlay" key={countdown.key}>
          <div className="vote-countdown-number">{countdown.n > 0 ? countdown.n : 'GO'}</div>
        </div>
      )}

      {/* 唱票阶段:逐票揭示 */}
      {tallyPhase && (
        <div className="vote-tally-overlay">
          <div className="vote-tally-card">
            <div className="vote-tally-header">
              <span className="vote-tally-line" /> 唱票 <span className="vote-tally-line" />
            </div>
            <div className="vote-tally-list">
              {revealedVotes.map((v, i) => (
                <div key={i} className="vote-tally-row" style={{ animationDelay: '0ms' }}>
                  <span className="vote-tally-voter">{v.voter}</span>
                  <span className="vote-tally-arrow">→</span>
                  <span className="vote-tally-target">{v.target}</span>
                </div>
              ))}
              {revealedVotes.length < allVoteEntries.length && (
                <div className="vote-tally-pending">
                  <span className="vote-tally-dot" />
                  <span className="vote-tally-dot" />
                  <span className="vote-tally-dot" />
                </div>
              )}
            </div>
            {revealedVotes.length >= allVoteEntries.length && (
              <div className="vote-tally-done">
                <span>票型已全部揭示</span>
                <button className="btn btn-primary btn-sm" onClick={() => setTallyPhase(false)}>关闭</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
