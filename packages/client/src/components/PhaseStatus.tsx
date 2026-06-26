import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/game.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { playTick, playWarning } from '../audio/timerAudio.js';
import { renderEvent } from '../scenes/Free/renderEvent.js';

export function PhaseStatus() {
  const view = useGameStore((s) => s.view);
  const playerId = useGameStore((s) => s.playerId);
  const send = useGameStore((s) => s.send);
  const phase = view?.currentPhase;
  const progress = view?.phaseProgress;
  const [now, setNow] = useState(Date.now());
  const [advanceConfirm, setAdvanceConfirm] = useState(false);
  const [showHostLog, setShowHostLog] = useState(false);
  const events = useGameStore((s) => s.events);

  useEffect(() => {
    if (!phase?.deadline) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [phase?.deadline]);

  // Audio warnings for timer countdown
  const warnedRef = useRef(false);
  const lastTickSecRef = useRef(-1);
  useEffect(() => {
    if (!phase?.deadline) return;
    const remaining = phase.deadline - now;
    if (remaining <= 0) return;
    // 30s warning (fire once)
    if (remaining <= 30_000 && remaining > 29_000 && !warnedRef.current) {
      warnedRef.current = true;
      playWarning();
    }
    // Last 10s: tick every second
    if (remaining <= 10_000) {
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastTickSecRef.current && sec > 0) {
        lastTickSecRef.current = sec;
        playTick();
      }
    }
  }, [now, phase?.deadline]);

  // Reset audio refs when phase changes
  useEffect(() => {
    warnedRef.current = false;
    lastTickSecRef.current = -1;
  }, [phase?.id]);

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
          {phase.currentTime && (
            <span className="status-pill">🕐 {phase.currentTime}{phase.clockEnd ? ` / ${phase.clockEnd}` : ''}</span>
          )}
          {phase.maxRounds != null && (
            <span className="status-pill">🔍 第 {(phase.round ?? 0) + 1}/{phase.maxRounds} 轮</span>
          )}
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
            <>
              <button onClick={() => setAdvanceConfirm(true)} className="btn btn-secondary btn-sm">
                推进下一阶段
              </button>
              <ConfirmDialog
                open={advanceConfirm}
                title="确认推进"
                message="确定结束当前环节？所有玩家将进入下一阶段。"
                confirmLabel="推进"
                cancelLabel="取消"
                onConfirm={() => { send({ kind: 'hostAdvance' }); setAdvanceConfirm(false); }}
                onCancel={() => setAdvanceConfirm(false)}
              />
            </>
          )}
        </div>
      )}
      {/* 房主可强制推进计时环节 */}
      {progress.exitKind === 'timer' && isHost && (
        <div className="phase-host-control">
          <span>计时进行中，房主可提前结束。</span>
          <button onClick={() => setAdvanceConfirm(true)} className="btn btn-secondary btn-sm">
            提前结束计时
          </button>
          <ConfirmDialog
            open={advanceConfirm}
            title="提前结束计时"
            message="确定跳过剩余时间并推进到下一阶段？"
            confirmLabel="跳过"
            cancelLabel="取消"
            onConfirm={() => { send({ kind: 'hostAdvance' }); setAdvanceConfirm(false); }}
            onCancel={() => setAdvanceConfirm(false)}
          />
        </div>
      )}
      {view?.pendingAdvance && (
        <div className="phase-host-control">
          <span>{isHost ? '条件已满足，请推进到下一阶段。' : '等待房主推进。'}</span>
          {isHost && (
            <button onClick={() => send({ kind: 'manualAdvance' })} className="btn btn-primary btn-sm">
              推进下一阶段
            </button>
          )}
        </div>
      )}
      {/* 房主全局日志 */}
      {isHost && (
        <div className="phase-host-log">
          <button className="btn btn-ghost btn-xs" onClick={() => setShowHostLog(!showHostLog)}>
            {showHostLog ? '收起日志' : `全局日志 (${events.length})`}
          </button>
          {showHostLog && (
            <div className="host-log-list">
              {events.slice(-30).reverse().map((e, i) => {
                const actor = view?.publicCharacters.find(c => c.id === e.actorCharId)?.name;
                const { icon, iconClass, content } = renderEvent(e, actor, false);
                return (
                  <div key={i} className="ev-row" style={{ fontSize: 11, padding: '2px 0' }}>
                    <span className={`ev-icon ${iconClass}`} style={{ width: 16, height: 16, fontSize: 9 }}>{icon}</span>
                    <span className="ev-content">{content}</span>
                  </div>
                );
              })}
            </div>
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
