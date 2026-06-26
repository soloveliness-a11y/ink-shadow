import { useState, useMemo, useRef, useEffect } from 'react';
import { useGameStore, useHasActed, usePhaseEnded } from '../store/game.js';
import { CaseNotes } from '../scenes/Free/CaseNotes.js';
import { renderEvent } from '../scenes/Free/renderEvent.js';
import { assetUrl } from '../lib/asset.js';
import { SPEECH_MAX } from '../lib/limits.js';
import { pushToast } from '../lib/toast.js';
import './WaitingPanel.css';

type TabKey = 'clues' | 'timeline' | 'chat' | 'chars';

const TAB_LABELS: Record<TabKey, string> = {
  clues: '线索笔记',
  timeline: '时间线',
  chat: '私聊',
  chars: '角色',
};

export function WaitingPanel() {
  const status = useGameStore((s) => s.view?.status);
  const phaseKind = useGameStore((s) => s.view?.currentPhase?.kind);
  const hasActed = useHasActed();
  const phaseEnded = usePhaseEnded();
  const progress = useGameStore((s) => s.view?.phaseProgress);

  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('clues');

  // 只在 playing + 已行动 + 环节未结束 + 非 reveal/lobby/assigning 时显示
  const shouldShow = status === 'playing' && hasActed && !phaseEnded
    && phaseKind !== 'reveal' && phaseKind !== undefined;

  // 环节结束时自动折叠
  useEffect(() => {
    if (phaseEnded) setExpanded(false);
  }, [phaseEnded]);

  if (!shouldShow) return null;

  const actedCount = progress?.actedCount ?? 0;
  const totalRequired = progress?.totalRequired ?? 0;
  const pct = totalRequired > 0 ? Math.round((actedCount / totalRequired) * 100) : 0;

  return (
    <div className={`wp${expanded ? ' wp-expanded' : ''}`}>
      {/* 折叠态: pill */}
      {!expanded && (
        <button className="wp-pill" onClick={() => setExpanded(true)} aria-label="展开等待面板">
          <span className="wp-pill-icon">📋</span>
          <span className="wp-pill-text">等待中 ({actedCount}/{totalRequired})</span>
          <div className="wp-pill-bar">
            <div className="wp-pill-fill" style={{ width: `${pct}%` }} />
          </div>
        </button>
      )}

      {/* 展开态: panel */}
      {expanded && (
        <div className="wp-panel">
          <div className="wp-header">
            <div className="wp-header-info">
              <span className="wp-header-title">等待其他玩家</span>
              <span className="wp-header-progress">{actedCount}/{totalRequired} 已行动</span>
            </div>
            <button className="wp-close" onClick={() => setExpanded(false)} aria-label="折叠">收起 ▼</button>
          </div>

          <div className="wp-tabs">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((k) => (
              <button
                key={k}
                className={`wp-tab${activeTab === k ? ' active' : ''}`}
                onClick={() => setActiveTab(k)}
              >
                {TAB_LABELS[k]}
              </button>
            ))}
          </div>

          <div className="wp-body">
            {activeTab === 'clues' && <CluesNotesTab />}
            {activeTab === 'timeline' && <TimelineTab />}
            {activeTab === 'chat' && <ChatTab />}
            {activeTab === 'chars' && <CharsTab />}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tab 1: 线索 + 笔记 ─── */

function CluesNotesTab() {
  const view = useGameStore((s) => s.view);
  const send = useGameStore((s) => s.send);
  const myCharId = view?.self?.charId;
  const revealedClues = view?.revealedClues ?? [];
  const myClues = view?.self?.myClues ?? [];
  const scriptId = view?.selectedScript?.id ?? '';
  const [forwardClue, setForwardClue] = useState<string | null>(null);
  const noteKey = useMemo(() => {
    const pid = view?.self?.charId ?? '';
    return pid && scriptId ? `notes:${scriptId}:${pid}:wp` : null;
  }, [scriptId, view?.self?.charId]);

  const candidates = useMemo(() =>
    (view?.publicCharacters ?? []).filter(c => c.id !== myCharId && !c.isVictim),
    [view?.publicCharacters, myCharId],
  );

  const forwardTo = (targetId: string, clueTitle: string, clueContent: string) => {
    send({ kind: 'privateMessage', toCharId: targetId, text: `[线索转发] ${clueTitle}: ${clueContent.slice(0, 200)}` });
    pushToast(`已转发给${candidates.find(c => c.id === targetId)?.name ?? '对方'}`, 'success', 2000);
    setForwardClue(null);
  };

  return (
    <div className="wp-clues">
      {revealedClues.length > 0 && (
        <div className="wp-clues-section">
          <div className="section-label">已公开线索 ({revealedClues.length})</div>
          {revealedClues.map((cl) => (
            <div key={cl.id} className="wp-clue-card">
              <div className="wp-clue-head">
                <div className="wp-clue-title">{cl.title}</div>
                <button className="wp-clue-fwd" onClick={() => setForwardClue(forwardClue === cl.id ? null : cl.id)} title="转发给其他玩家">↗</button>
              </div>
              <div className="wp-clue-text">{cl.content}</div>
              {forwardClue === cl.id && (
                <div className="wp-clue-fwd-targets">
                  {candidates.map(c => (
                    <button key={c.id} className="wp-clue-fwd-btn" onClick={() => forwardTo(c.id, cl.title, cl.content)}>{c.name}</button>
                  ))}
                </div>
              )}
              {cl.visual?.asset?.path && (
                <img
                  src={assetUrl(scriptId, cl.visual.asset.path)}
                  alt={cl.title}
                  className="wp-clue-img"
                  loading="lazy"
                />
              )}
            </div>
          ))}
        </div>
      )}
      {myClues.length > 0 && (
        <div className="wp-clues-section">
          <div className="section-label">我的线索 ({myClues.length})</div>
          {myClues.map((cl) => (
            <div key={cl.id} className="wp-clue-card private">
              <div className="wp-clue-head">
                <div className="wp-clue-title">{cl.title}</div>
                <button className="wp-clue-fwd" onClick={() => setForwardClue(forwardClue === cl.id ? null : cl.id)} title="转发给其他玩家">↗</button>
              </div>
              <div className="wp-clue-text">{cl.content}</div>
              {forwardClue === cl.id && (
                <div className="wp-clue-fwd-targets">
                  {candidates.map(c => (
                    <button key={c.id} className="wp-clue-fwd-btn" onClick={() => forwardTo(c.id, cl.title, cl.content)}>{c.name}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {revealedClues.length === 0 && myClues.length === 0 && (
        <div className="empty-state compact">暂无线索</div>
      )}
      <div className="wp-divider" />
      <CaseNotes noteKey={noteKey} />
    </div>
  );
}

/* ─── Tab 2: 事件时间线 ─── */

function TimelineTab() {
  const view = useGameStore((s) => s.view);
  const events = useGameStore((s) => s.events);
  const myCharId = view?.self?.charId;

  const recentEvents = useMemo(() => events.slice(-20), [events]);

  if (recentEvents.length === 0) {
    return <div className="empty-state compact">暂无事件记录</div>;
  }

  return (
    <div className="wp-timeline">
      {recentEvents.map((e, i) => {
        const actor = view?.publicCharacters.find((c) => c.id === e.actorCharId)?.name;
        const isSelf = e.actorCharId === myCharId;
        const { icon, iconClass, content } = renderEvent(e, actor, isSelf);
        return (
          <div key={i} className="ev-row">
            <span className={`ev-icon ${iconClass}`}>{icon}</span>
            <span className="ev-content">{content}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Tab 3: 简化私聊 ─── */

function ChatTab() {
  const view = useGameStore((s) => s.view);
  const send = useGameStore((s) => s.send);
  const privateMessages = useGameStore((s) => s.privateMessages);
  const myCharId = view?.self?.charId;
  const [pmTarget, setPmTarget] = useState('');
  const [pmText, setPmText] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  const candidates = useMemo(() =>
    (view?.publicCharacters ?? []).filter((c) => c.id !== myCharId && !c.isVictim),
    [view?.publicCharacters, myCharId],
  );

  const currentThread = useMemo(() =>
    privateMessages.filter((msg) =>
      pmTarget && myCharId &&
      ((msg.fromCharId === myCharId && msg.toCharId === pmTarget) ||
       (msg.fromCharId === pmTarget && msg.toCharId === myCharId))
    ).slice(-15),
    [privateMessages, pmTarget, myCharId],
  );

  const pmTargetName = candidates.find((c) => c.id === pmTarget)?.name;

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [currentThread]);

  const sendPm = () => {
    const trimmed = pmText.trim();
    if (!trimmed || !pmTarget) return;
    send({ kind: 'privateMessage', toCharId: pmTarget, text: trimmed.slice(0, SPEECH_MAX) });
    setPmText('');
  };

  return (
    <div className="wp-chat">
      <select className="input wp-pm-select" value={pmTarget} onChange={(e) => setPmTarget(e.target.value)}>
        <option value="">选择私聊对象...</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <div className="wp-pm-thread" ref={threadRef}>
        {pmTarget ? (
          currentThread.length > 0 ? currentThread.map((msg, i) => {
            const mine = msg.fromCharId === myCharId;
            const name = mine ? '我' : candidates.find((c) => c.id === msg.fromCharId)?.name ?? '对方';
            return (
              <div key={`${msg.ts}-${i}`} className={`pm-msg${mine ? ' mine' : ''}`}>
                <div className="pm-author">{name}</div>
                <div>{msg.text}</div>
              </div>
            );
          }) : <div className="empty-state compact">还没有私信记录</div>
        ) : (
          <div className="empty-state compact">先选择一名角色</div>
        )}
      </div>
      <div className="wp-pm-bar">
        <input
          className="input"
          value={pmText}
          onChange={(e) => setPmText(e.target.value.slice(0, SPEECH_MAX))}
          onKeyDown={(e) => { if (e.key === 'Enter') sendPm(); }}
          placeholder={pmTargetName ? `发给 ${pmTargetName}...` : '输入私信...'}
          maxLength={SPEECH_MAX}
          disabled={!pmTarget}
        />
        <button onClick={sendPm} disabled={!pmText.trim() || !pmTarget} className="btn btn-primary btn-sm">发送</button>
      </div>
    </div>
  );
}

/* ─── Tab 4: 角色信息 ─── */

function CharsTab() {
  const view = useGameStore((s) => s.view);
  const myCharId = view?.self?.charId;
  const scriptId = view?.selectedScript?.id ?? '';
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const chars = useMemo(() =>
    (view?.publicCharacters ?? []).filter((c) => c.id !== myCharId),
    [view?.publicCharacters, myCharId],
  );

  return (
    <div className="wp-chars">
      {chars.map((c) => {
        const url = assetUrl(scriptId, c.avatar);
        const isOpen = expandedId === c.id;
        return (
          <div key={c.id} className={`wp-char-card${isOpen ? ' open' : ''}`}>
            <div className="wp-char-head" role="button" tabIndex={0}
              onClick={() => setExpandedId(isOpen ? null : c.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isOpen ? null : c.id); } }}
            >
              {url ? (
                <img src={url} alt={c.name} className="wp-char-avatar" loading="lazy" />
              ) : (
                <div className="wp-char-avatar wp-char-fallback">{c.name.charAt(0)}</div>
              )}
              <div className="wp-char-info">
                <div className="wp-char-name">{c.name}{c.isVictim && <span className="badge badge-crimson" style={{ marginLeft: 4, fontSize: 10 }}>死者</span>}</div>
                <div className="wp-char-sub">{c.publicProfile.slice(0, 50)}</div>
              </div>
              <span className="wp-char-toggle">{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && (
              <div className="wp-char-body">
                <p className="wp-char-profile">{c.publicProfile}</p>
                {(c.publicRelations ?? []).length > 0 && (
                  <div className="wp-char-relations">
                    <div className="section-label" style={{ fontSize: 11 }}>公开关系</div>
                    {(c.publicRelations ?? []).map((r, i) => (
                      <span key={i} className="board-relation-chip" style={{ fontSize: 11 }}>
                        <span className="board-relation-tag">{r.relation}</span>
                        <span className="board-relation-name">
                          {view?.publicCharacters.find((pc) => pc.id === r.targetCharId)?.name ?? r.targetCharId}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
