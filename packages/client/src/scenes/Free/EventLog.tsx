import { useMemo } from 'react';
import { renderEvent } from './renderEvent.js';
import type { ClientStateView, PublicCharacter } from '@mmg/schema';

interface EventLogProps {
  view: ClientStateView;
  myCharId: string | undefined;
  publicCharacters: PublicCharacter[];
}

export function EventLog({ view, myCharId, publicCharacters }: EventLogProps) {
  const recentActions = useMemo(
    () => view.log.filter((e) => ['search_clue', 'reveal_clue', 'speak', 'privateMessage'].includes(e.type)).slice(-5),
    [view.log],
  );
  const eventLog = useMemo(
    () => view.log.slice(-30),
    [view.log],
  );

  return (
    <>
      <div className="section-label">事件记录</div>
      {recentActions.length > 0 && (
        <div className="recent-actions">
          {recentActions.map((e, i) => {
            const actor = publicCharacters.find((c) => c.id === e.actorCharId)?.name;
            const rendered = renderEvent(e, actor, e.actorCharId === myCharId);
            return (
              <div key={`${e.ts}-${e.type}-${i}`} className="recent-action">
                <span className={`ev-icon ${rendered.iconClass}`}>{rendered.icon}</span>
                <span>{rendered.content}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="free-event-log">
        {eventLog.length > 0 ? eventLog.map((e, i) => {
          const actor = publicCharacters.find((c) => c.id === e.actorCharId)?.name;
          const isSelf = e.actorCharId === myCharId;
          const rendered = renderEvent(e, actor, isSelf);
          return (
            <div key={`${e.ts}-${e.type}-${i}`} className="free-event-row">
              <div className={`ev-icon ${rendered.iconClass}`}>{rendered.icon}</div>
              <div>{rendered.content}</div>
            </div>
          );
        }) : (
          <div className="empty-state compact">夜色尚静,还未有人留下痕迹</div>
        )}
      </div>
    </>
  );
}
