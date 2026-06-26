import { useEffect, useState } from 'react';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { useExcerptSelection } from '../hooks/useExcerptSelection.js';
import { useCallback, useRef } from 'react';
import { pushToast } from '../lib/toast.js';
import { recordGame } from '../lib/achievements.js';

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
  const playerId = useGameStore((s) => s.playerId);
  const coverUrl = assetUrl(view?.selectedScript?.id, view?.selectedScript?.cover?.asset?.path);
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 60); return () => clearTimeout(t); }, []);

  // 记录战绩（仅一次）
  const recordedRef = useRef(false);
  useEffect(() => {
    if (recordedRef.current || !view || !playerId) return;
    recordedRef.current = true;
    const myCharId = view.players.find(p => p.playerId === playerId)?.charId;
    const myChar = myCharId ? view.publicCharacters.find(c => c.id === myCharId) : undefined;
    const myVoteTargetId = myCharId && view.votesPublic ? (view.votesPublic[myCharId] as string | undefined) : undefined;
    const myVoteTarget = myVoteTargetId && myVoteTargetId !== '__voted__'
      ? view.publicCharacters.find(c => c.id === myVoteTargetId)?.name ?? null : null;
    const voteEntries = view.votesPublic ? Object.entries(view.votesPublic).filter(([, t]) => t !== '__voted__') : [];
    const voteTally = new Map<string, number>();
    for (const [, tid] of voteEntries) voteTally.set(tid as string, (voteTally.get(tid as string) ?? 0) + 1);
    const topTargetId = [...voteTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const topTarget = topTargetId ? view.publicCharacters.find(c => c.id === topTargetId)?.name ?? null : null;
    const isCorrect = !!myVoteTargetId && myVoteTargetId === topTargetId;
    const unlocked = recordGame({
      scriptId: view.selectedScript?.id ?? '',
      scriptTitle: view.selectedScript?.title ?? '未知剧本',
      charName: myChar?.name ?? '未知角色',
      myVoteTarget,
      topVotedTarget: topTarget,
      myCluesFound: view.self?.myClues?.length ?? 0,
      totalRevealedClues: view.revealedClues.length,
      isCorrectVote: isCorrect,
      playedAt: Date.now(),
    });
    if (unlocked.length > 0) {
      pushToast(`解锁新成就！`, 'success', 3000);
    }
  }, [view, playerId]);

  return (
    <div className={`reveal-stage finished${show ? ' show' : ''}`}>
      <div className="reveal-card">
        <div className="badge badge-sage reveal-finished-badge">游戏结束</div>

        {coverUrl && (
          <img src={coverUrl} alt="" className="reveal-cover" loading="lazy" decoding="async" />
        )}

        <RevealRecap />

        <div className="reveal-divider" />
        <TheoryComparison />

        <div className="reveal-divider" />
        <div className="reveal-thanks">感谢各位的精彩推理</div>
        <div className="reveal-actions">
          <RecapCardButton />
          <button onClick={() => window.location.reload()} className="btn btn-secondary btn-lg">返回大厅</button>
        </div>
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
  const voteEntries = votesPublic ? Object.entries(votesPublic).filter(([, t]) => t !== '__voted__') : [];
  const voteTally = new Map<string, number>();
  for (const [, targetId] of voteEntries) {
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

function TheoryComparison() {
  const view = useGameStore((s) => s.view);
  const playerId = useGameStore((s) => s.playerId);
  if (!view) return null;

  const myCharId = view.players.find(p => p.playerId === playerId)?.charId;
  const votesPublic = view.votesPublic;
  const ending = view.ending;

  // 我投了谁
  const myVoteTargetId = myCharId && votesPublic ? (votesPublic[myCharId] as string | undefined) : undefined;
  const myVoteTarget = myVoteTargetId && myVoteTargetId !== '__voted__'
    ? view.publicCharacters.find(c => c.id === myVoteTargetId)?.name
    : undefined;

  // 票型汇总
  const voteEntries = votesPublic
    ? Object.entries(votesPublic).filter(([, t]) => t !== '__voted__')
    : [];
  const voteTally = new Map<string, number>();
  for (const [, targetId] of voteEntries) {
    const tid = targetId as string;
    voteTally.set(tid, (voteTally.get(tid) ?? 0) + 1);
  }
  // 得票最多的人
  const topTargetId = [...voteTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topTargetName = topTargetId ? view.publicCharacters.find(c => c.id === topTargetId)?.name : undefined;

  // 我的推理
  const myTheory = myCharId && ending?.theories?.[myCharId];

  const hasAnyContent = myVoteTarget || myTheory || (ending?.truthReveal);
  if (!hasAnyContent) return null;

  return (
    <div className="reveal-compare">
      <div className="section-label reveal-truth-label">推理回顾</div>

      {/* 投票对比 */}
      {myVoteTarget && (
        <div className="reveal-compare-grid">
          <div className="reveal-compare-card">
            <div className="reveal-compare-label">你的投票</div>
            <div className="reveal-compare-value">{myVoteTarget}</div>
          </div>
          <div className="reveal-compare-card">
            <div className="reveal-compare-label">全场最高票</div>
            <div className="reveal-compare-value">{topTargetName ?? '—'}</div>
          </div>
        </div>
      )}

      {/* 票型明细 */}
      {voteEntries.length > 0 && (
        <div className="reveal-event-list" style={{ marginTop: 12 }}>
          {voteEntries.map(([voterId, targetId]) => {
            const voter = view.publicCharacters.find(c => c.id === voterId)?.name ?? voterId;
            const target = view.publicCharacters.find(c => c.id === targetId)?.name ?? String(targetId);
            const isMine = voterId === myCharId;
            return (
              <div key={voterId} className="reveal-event-row" style={isMine ? { fontWeight: 700, color: 'var(--accent)' } : undefined}>
                <span>{isMine ? '你的投票' : '投票'}</span>
                <strong>{voter} → {target}</strong>
              </div>
            );
          })}
        </div>
      )}

      {/* 我的推理 vs 真相 */}
      {myTheory && ending?.truthReveal && (
        <div className="reveal-compare-grid" style={{ marginTop: 12 }}>
          <div className="reveal-compare-card">
            <div className="reveal-compare-label">你的推理</div>
            <p className="reveal-compare-value" style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.6 }}>{myTheory}</p>
          </div>
          <div className="reveal-compare-card">
            <div className="reveal-compare-label">案件真相</div>
            <p className="reveal-compare-value" style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.6 }}>{ending.truthReveal.slice(0, 300)}{ending.truthReveal.length > 300 ? '…' : ''}</p>
          </div>
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

function RecapCardButton() {
  const view = useGameStore((s) => s.view);
  const playerId = useGameStore((s) => s.playerId);
  const [generating, setGenerating] = useState(false);

  const generate = useCallback(async () => {
    if (!view) return;
    setGenerating(true);
    try {
      const myCharId = view.players.find(p => p.playerId === playerId)?.charId;
      const myChar = myCharId ? view.publicCharacters.find(c => c.id === myCharId) : undefined;
      const myVoteTargetId = myCharId && view.votesPublic ? (view.votesPublic[myCharId] as string | undefined) : undefined;
      const myVoteTarget = myVoteTargetId && myVoteTargetId !== '__voted__'
        ? view.publicCharacters.find(c => c.id === myVoteTargetId)?.name : undefined;
      const myClues = view.self?.myClues?.length ?? 0;
      const revealedClues = view.revealedClues.length;
      const speakCount = view.log.filter(e => e.type === 'speak').length;
      const searchCount = view.log.filter(e => e.type === 'search_clue').length;

      const W = 600, H = 800;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // 背景
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#1a1520');
      grad.addColorStop(1, '#0a0910');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 纹理
      ctx.globalAlpha = 0.03;
      for (let i = 0; i < 150; i++) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
      }
      ctx.globalAlpha = 1;

      // 标题
      ctx.fillStyle = '#c4a66a';
      ctx.font = 'bold 14px sans-serif, "Noto Sans SC"';
      ctx.textAlign = 'center';
      ctx.fillText('推理成绩单', W / 2, 50);

      // 剧本名
      ctx.fillStyle = '#e8e4dc';
      ctx.font = 'bold 28px serif, "Noto Serif SC", Georgia';
      ctx.fillText(view.selectedScript?.title ?? '剧本杀', W / 2, 100);

      // 角色名
      if (myChar) {
        ctx.fillStyle = '#8a8578';
        ctx.font = '16px sans-serif, "Noto Sans SC"';
        ctx.fillText(`扮演: ${myChar.name}`, W / 2, 140);
      }

      // 分隔线
      ctx.strokeStyle = 'rgba(196, 166, 106, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, 170);
      ctx.lineTo(W - 60, 170);
      ctx.stroke();

      // 数据卡片
      const metrics = [
        { label: '持有线索', value: `${myClues}` },
        { label: '公开线索', value: `${revealedClues}` },
        { label: '搜证行动', value: `${searchCount}` },
        { label: '发言次数', value: `${speakCount}` },
      ];

      const cardW = 100, cardH = 70, gap = 16;
      const totalW = metrics.length * cardW + (metrics.length - 1) * gap;
      const startX = (W - totalW) / 2;

      metrics.forEach((m, i) => {
        const x = startX + i * (cardW + gap);
        const y = 200;
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath();
        ctx.roundRect(x, y, cardW, cardH, 8);
        ctx.fill();
        ctx.fillStyle = '#e8e4dc';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(m.value, x + cardW / 2, y + 35);
        ctx.fillStyle = '#6a6560';
        ctx.font = '11px sans-serif, "Noto Sans SC"';
        ctx.fillText(m.label, x + cardW / 2, y + 58);
      });

      // 投票结果
      if (myVoteTarget) {
        ctx.fillStyle = '#8a8578';
        ctx.font = '14px sans-serif, "Noto Sans SC"';
        ctx.textAlign = 'center';
        ctx.fillText('你的投票', W / 2, 320);
        ctx.fillStyle = '#c4a66a';
        ctx.font = 'bold 20px sans-serif, "Noto Sans SC"';
        ctx.fillText(myVoteTarget, W / 2, 350);
      }

      // 结局标题
      if (view.ending?.title) {
        ctx.fillStyle = '#e8e4dc';
        ctx.font = 'bold 18px serif, "Noto Serif SC"';
        ctx.textAlign = 'center';
        ctx.fillText(view.ending.title, W / 2, 410);
      }

      // 底部品牌
      ctx.fillStyle = '#4a4540';
      ctx.font = '12px sans-serif, "Noto Sans SC"';
      ctx.textAlign = 'center';
      ctx.fillText('墨影 · AI剧本杀', W / 2, H - 30);

      // 日期
      ctx.fillStyle = '#3a3530';
      ctx.font = '10px sans-serif';
      ctx.fillText(new Date().toLocaleDateString('zh-CN'), W / 2, H - 14);

      canvas.toBlob((blob) => {
        if (!blob) { pushToast('生成失败', 'error'); setGenerating(false); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `推理成绩单-${view.selectedScript?.title ?? '剧本杀'}.png`;
        a.click();
        URL.revokeObjectURL(url);
        pushToast('成绩单已保存', 'success', 2000);
        setGenerating(false);
      }, 'image/png', 0.92);
    } catch {
      pushToast('生成失败', 'error');
      setGenerating(false);
    }
  }, [view, playerId]);

  return (
    <button onClick={generate} disabled={generating} className="btn btn-primary btn-lg">
      {generating ? '生成中...' : '保存推理成绩单'}
    </button>
  );
}
