import { useState, useMemo } from 'react';
import { useGameStore } from '../store/game.js';
import { renderEvent } from '../scenes/Free/renderEvent.js';
import type { GameEvent } from '@mmg/schema';

type TabKey = 'all' | 'private' | 'search' | 'speak';

const TAB_LABELS: Record<TabKey, string> = {
  all: '全部',
  private: '私聊',
  search: '搜证',
  speak: '发言',
};

const TAB_FILTERS: Record<TabKey, (e: GameEvent) => boolean> = {
  all: () => true,
  private: () => false,
  search: (e) => e.type === 'search_clue' || e.type === 'reveal_clue',
  speak: (e) => e.type === 'speak',
};

export function DmObserver() {
  const view = useGameStore((s) => s.view);
  const playerId = useGameStore((s) => s.playerId);
  const privateMessages = useGameStore((s) => s.privateMessages);

  const isHost = useMemo(
    () => view?.players.find((p) => p.playerId === playerId)?.isHost ?? false,
    [view?.players, playerId],
  );

  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  if (!isHost || !view) return null;

  const players = view.players;
  const chars = view.publicCharacters;

  const charName = (charId: string | undefined) =>
    chars.find((c) => c.id === charId)?.name ?? charId ?? '未知';

  const eventLog = view.log ?? [];

  return (
    <div className={`dm-obs${expanded ? ' dm-obs-expanded' : ''}`}>
      {!expanded && (
        <button className="dm-obs-pill" onClick={() => setExpanded(true)} aria-label="展开 DM 观察面板">
          <span className="dm-obs-pill-icon">👁</span>
          <span className="dm-obs-pill-text">DM 观察</span>
        </button>
      )}

      {expanded && (
        <div className="dm-obs-panel">
          <div className="dm-obs-header">
            <span className="dm-obs-title">DM 实时观察</span>
            <button className="dm-obs-close" onClick={() => setExpanded(false)}>收起 ▼</button>
          </div>

          <div className="dm-obs-tabs">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((k) => (
              <button
                key={k}
                className={`dm-obs-tab${activeTab === k ? ' active' : ''}`}
                onClick={() => setActiveTab(k)}
              >
                {TAB_LABELS[k]}
              </button>
            ))}
          </div>

          <div className="dm-obs-body">
            {activeTab === 'all' && (
              <EventList events={eventLog} chars={chars} />
            )}
            {activeTab === 'private' && (
              <PrivateList messages={privateMessages} charName={charName} />
            )}
            {activeTab === 'search' && (
              <EventList
                events={eventLog.filter(TAB_FILTERS.search)}
                chars={chars}
              />
            )}
            {activeTab === 'speak' && (
              <EventList
                events={eventLog.filter(TAB_FILTERS.speak)}
                chars={chars}
              />
            )}
          </div>

          <PlayerStatusCards players={players} chars={chars} eventLog={eventLog} privateMessages={privateMessages} />
        </div>
      )}
    </div>
  );
}

/* ─── Event List (all / search / speak) ─── */

function EventList({ events, chars }: {
  events: GameEvent[];
  chars: Array<{ id: string; name: string }>;
}) {
  const recent = useMemo(() => events.slice(-50).reverse(), [events]);

  if (recent.length === 0) {
    return <div className="dm-obs-empty">暂无事件</div>;
  }

  return (
    <div className="dm-obs-events">
      {recent.map((e, i) => {
        const actor = chars.find((c) => c.id === e.actorCharId)?.name;
        const { icon, iconClass, content } = renderEvent(e, actor, false);
        return (
          <div key={`${e.ts}-${i}`} className="ev-row">
            <span className={`ev-icon ${iconClass}`}>{icon}</span>
            <span className="ev-content">{content}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Private Messages ─── */

function PrivateList({ messages, charName }: {
  messages: Array<{ fromCharId: string; toCharId: string; text: string; ts: number }>;
  charName: (id: string) => string;
}) {
  const recent = useMemo(() => messages.slice(-50).reverse(), [messages]);

  if (recent.length === 0) {
    return <div className="dm-obs-empty">暂无私聊</div>;
  }

  return (
    <div className="dm-obs-pm">
      {recent.map((msg, i) => (
        <div key={`${msg.ts}-${i}`} className="dm-obs-pm-row">
          <span className="dm-obs-pm-arrow">→</span>
          <span className="dm-obs-pm-from">{charName(msg.fromCharId)}</span>
          <span className="dm-obs-pm-to">→ {charName(msg.toCharId)}</span>
          <span className="dm-obs-pm-text">{msg.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Player Status Cards ─── */

function PlayerStatusCards({ players, chars, eventLog, privateMessages }: {
  players: Array<{ playerId: string; charId?: string; nickname: string; connected: boolean; isHost: boolean }>;
  chars: Array<{ id: string; name: string }>;
  eventLog: GameEvent[];
  privateMessages: Array<{ fromCharId: string; toCharId: string; text: string; ts: number }>;
}) {
  const stats = useMemo(() => {
    const map: Record<string, { searches: number; reveals: number; speaks: number; pmSent: number }> = {};
    for (const e of eventLog) {
      const id = e.actorCharId;
      if (!id) continue;
      if (!map[id]) map[id] = { searches: 0, reveals: 0, speaks: 0, pmSent: 0 };
      if (e.type === 'search_clue') map[id].searches++;
      if (e.type === 'reveal_clue') map[id].reveals++;
      if (e.type === 'speak') map[id].speaks++;
    }
    for (const msg of privateMessages) {
      const id = msg.fromCharId;
      if (!map[id]) map[id] = { searches: 0, reveals: 0, speaks: 0, pmSent: 0 };
      map[id].pmSent++;
    }
    return map;
  }, [eventLog, privateMessages]);

  return (
    <div className="dm-obs-players">
      {players.map((p) => {
        const char = p.charId ? chars.find((c) => c.id === p.charId) : undefined;
        const s = p.charId ? stats[p.charId] : undefined;
        return (
          <div key={p.playerId} className="dm-obs-player-card">
            <div className="dm-obs-player-head">
              <span className={`dm-obs-dot${p.connected ? ' online' : ''}`} />
              <span className="dm-obs-player-name">{char?.name ?? p.nickname}</span>
              {p.isHost && <span className="badge badge-accent">HOST</span>}
            </div>
            {s && (
              <div className="dm-obs-player-stats">
                <span title="发言">💬 {s.speaks}</span>
                <span title="搜证">🔍 {s.searches}</span>
                <span title="公开线索">📢 {s.reveals}</span>
                <span title="私聊发送">✉️ {s.pmSent}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
