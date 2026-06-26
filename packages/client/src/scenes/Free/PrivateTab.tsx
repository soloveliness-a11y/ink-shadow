import type { ClientIntent } from "@mmg/schema";
import { useEffect, useRef, useState } from 'react';
import { SPEECH_MAX } from '../../lib/limits.js';
import { counterColor } from './ChatTab.js';
import type { ClientStateView, PublicCharacter } from '@mmg/schema';

interface PmMessage {
  fromCharId: string;
  toCharId: string;
  text: string;
  ts: number;
}

interface PrivateTabProps {
  view: ClientStateView;
  myCharId: string | undefined;
  publicCharacters: PublicCharacter[];
  pmCandidates: PublicCharacter[];
  privateMessages: PmMessage[];
  pmStats: Map<string, { count: number; latestTs: number }>;
  lastSeenPmTs: number;
  pmTarget: string;
  onPmTargetChange: (target: string) => void;
  onUpdateLastSeen: () => void;
  send: (intent: ClientIntent) => void;
}

export function PrivateTab({
  view: _view, myCharId, publicCharacters, pmCandidates, privateMessages,
  pmStats, lastSeenPmTs, pmTarget, onPmTargetChange, onUpdateLastSeen, send,
}: PrivateTabProps) {
  const [pmText, setPmText] = useState('');
  const pmThreadRef = useRef<HTMLDivElement>(null);

  const currentThread = privateMessages.filter((msg) =>
    pmTarget && myCharId &&
    ((msg.fromCharId === myCharId && msg.toCharId === pmTarget) || (msg.fromCharId === pmTarget && msg.toCharId === myCharId))
  );
  const pmTargetName = publicCharacters.find((c) => c.id === pmTarget)?.name;

  // Auto-scroll pm-thread
  useEffect(() => {
    const el = pmThreadRef.current;
    if (!el) return;
    const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [currentThread]);

  const sendPrivate = () => {
    const trimmed = pmText.trim();
    if (!trimmed || !pmTarget) return;
    send({ kind: 'privateMessage', toCharId: pmTarget, text: trimmed.slice(0, SPEECH_MAX) });
    setPmText('');
  };

  const selectTarget = (id: string) => {
    onPmTargetChange(id);
    onUpdateLastSeen();
  };

  return (
    <div className="pm-workbench">
      <div className="pm-head">
        <div>
          <div className="pm-title">{pmTargetName ? `与 ${pmTargetName}` : '暗线私信'}</div>
          <div className="pm-sub">私信不会进入公共讨论记录。</div>
        </div>
        <span className="badge badge-muted">{currentThread.length} 条</span>
      </div>
      <select className="input pm-select" value={pmTarget} onChange={(e) => selectTarget(e.target.value)}>
        <option value="">选择对象...</option>
        {pmCandidates.map((c) => {
          const stat = pmStats.get(c.id);
          return (
            <option key={c.id} value={c.id}>
              {stat ? `${c.name} · ${stat.count}条` : c.name}
            </option>
          );
        })}
      </select>
      <div className="pm-target-row">
        {pmCandidates.map((c) => {
          const stat = pmStats.get(c.id);
          const active = pmTarget === c.id;
          const hasUnread = (stat?.latestTs ?? 0) > lastSeenPmTs;
          return (
            <button
              key={c.id}
              className={`pm-target-chip${active ? ' active' : ''}`}
              onClick={() => selectTarget(c.id)}
              style={{ position: 'relative' }}
            >
              <span>{c.name}</span>
              {stat && <strong>{stat.count}</strong>}
              {hasUnread && <span className="unread-dot" style={{ position: 'absolute', top: 2, right: 2 }} />}
            </button>
          );
        })}
      </div>
      <div className="pm-thread" ref={pmThreadRef}>
        {pmTarget ? (
          currentThread.length > 0 ? currentThread.slice(-20).map((msg, i) => {
            const mine = msg.fromCharId === myCharId;
            const name = mine ? '我' : publicCharacters.find((c) => c.id === msg.fromCharId)?.name ?? '对方';
            return (
              <div key={`${msg.ts}-${msg.fromCharId}-${i}`} className={`pm-msg${mine ? ' mine' : ''}`}>
                <div className="pm-author">{name}</div>
                <div>{msg.text}</div>
              </div>
            );
          }) : <div className="empty-state compact">还没有私信记录</div>
        ) : (
          <div className="empty-state compact">先选择一名角色</div>
        )}
      </div>
      <div className="composer-bar">
        <input className="input" value={pmText} onChange={(e) => setPmText(e.target.value.slice(0, SPEECH_MAX))} onKeyDown={(e) => {
          if (e.key === 'Enter') sendPrivate();
        }} placeholder={pmTargetName ? `发给 ${pmTargetName}...` : '输入私信内容...'} maxLength={SPEECH_MAX} />
        <div className="composer-counter" style={{ color: counterColor(pmText.length, SPEECH_MAX) }}>{pmText.length}/{SPEECH_MAX}</div>
        <button onClick={sendPrivate} disabled={!pmText.trim() || !pmTarget} className="btn btn-primary btn-sm">发送</button>
      </div>
    </div>
  );
}
