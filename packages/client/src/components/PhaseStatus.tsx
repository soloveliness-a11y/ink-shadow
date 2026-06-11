import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/game.js';

export function PhaseStatus() {
  const view = useGameStore((s) => s.view);
  const playerId = useGameStore((s) => s.playerId);
  const send = useGameStore((s) => s.send);
  const phase = view?.currentPhase;
  const progress = view?.phaseProgress;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!phase?.deadline) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [phase?.deadline]);

  const pendingNames = useMemo(() => {
    if (!progress || !['allReady', 'allActed', 'voteComplete'].includes(progress.exitKind)) return [];
    const ids = progress?.pendingCharIds ?? [];
    return ids
      .map((id) => view?.publicCharacters.find((c) => c.id === id)?.name ?? id)
      .filter(Boolean);
  }, [progress, view?.publicCharacters]);

  if (!phase || !progress) return null;

  const isHost = Boolean(view?.players.find((p) => p.playerId === playerId)?.isHost);
  const myCharId = view?.players.find((p) => p.playerId === playerId)?.charId;
  const myChar = view?.publicCharacters.find((c) => c.id === myCharId);
  const turnChar = view?.publicCharacters.find((c) => c.id === phase.turnCharId);
  const hasActed = Boolean(myCharId && progress.actedCharIds.includes(myCharId));
  const requiresMe = Boolean(myCharId && progress.requiredCharIds.includes(myCharId));
  const myTurn = Boolean(myCharId && phase.turnCharId === myCharId);
  const statusTone = myTurn || (requiresMe && !hasActed) ? 'ready' : hasActed ? 'done' : 'watch';
  const guidance = phase.turnCharId
    ? myTurn
      ? '轮到你行动。'
      : `当前轮到 ${turnChar?.name ?? '其他玩家'}。`
    : requiresMe
      ? hasActed
        ? '你已完成本环节行动。'
        : '本环节需要你的行动。'
      : myChar
        ? '你可以观察其他玩家的行动。'
        : '等待游戏状态同步。';
  const remaining = phase.deadline ? Math.max(0, phase.deadline - now) : null;
  const pct = progress.totalRequired > 0
    ? Math.round((progress.actedCount / progress.totalRequired) * 100)
    : 0;
  const isUrgent = remaining !== null && remaining < 30_000;
  const isCritical = remaining !== null && remaining < 15_000;

  return (
    <div className="phase-status">
      <div className="phase-status-main">
        <div>
          <div className="phase-status-title">{phase.title}</div>
          <div className="phase-status-sub">{phase.instruction}</div>
        </div>
        <div className="phase-status-metrics">
          {remaining !== null && (() => {
            const cls = isCritical ? ' status-pill-critical' : isUrgent ? ' status-pill-urgent' : '';
            const label = (isUrgent ? '⚠ ' : '') + formatDuration(remaining);
            return <span className={`status-pill${cls}`}>{label}</span>;
          })()}
          {progress.totalRequired > 0 && (
            <span className="status-pill">
              {progress.actedCount}/{progress.totalRequired}
            </span>
          )}
          <span className="status-pill status-pill-muted">{exitLabel(progress.exitKind)}</span>
        </div>
      </div>
      {progress.totalRequired > 0 && (
        <div className="phase-progress-track">
          <div className="phase-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {pendingNames.length > 0 && (
        <div className="phase-status-waiting">
          <span>等待</span>
          {pendingNames.map((name) => <strong key={name}>{name}</strong>)}
        </div>
      )}
      <div className={`phase-guidance ${statusTone}`}>
        <span className="phase-guidance-dot" />
        <span>{guidance}</span>
      </div>
      {progress.exitKind === 'hostAdvance' && (
        <div className="phase-host-control">
          <span>{isHost ? '本环节由房主判断讨论结束后推进。' : '本环节结束后由房主推进。'}</span>
          {isHost && (
            <button onClick={() => send({ kind: 'hostAdvance' })} className="btn btn-secondary btn-sm">
              推进下一阶段
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function exitLabel(kind: string): string {
  const map: Record<string, string> = {
    allReady: '全员就绪',
    allActed: '全员行动',
    timer: '计时结束',
    hostAdvance: '房主推进',
    voteComplete: '投票完成',
  };
  return map[kind] ?? kind;
}
