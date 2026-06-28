import type { ReactNode } from 'react';
import type { GameEvent } from '@mmg/schema';

export function renderEvent(e: GameEvent, actor: string | undefined, isSelf: boolean): {
  icon: string;
  iconClass: string;
  content: ReactNode;
} {
  const payload = (e.payload ?? {}) as Record<string, string>;
  const actorName = actor ?? '未知角色';
  if (e.type === 'speak') {
    return {
      icon: '💬',
      iconClass: 'ev-chat',
      content: (
        <>
          <strong className={isSelf ? 'ev-self' : 'ev-speaker'}>{actorName}</strong>
          : {String(payload.text ?? '')}
        </>
      ),
    };
  }
  if (e.type === 'search_clue') {
    return {
      icon: '🔍',
      iconClass: 'ev-search',
      content: (
        <>
          <strong>{actorName}</strong> 搜索了 <span className="ev-accent">{payload.clueTitle ?? '线索'}</span>
        </>
      ),
    };
  }
  if (e.type === 'reveal_clue') {
    return {
      icon: '📢',
      iconClass: 'ev-reveal',
      content: (
        <>
          <strong>{actorName}</strong> 公开线索：<span className="ev-accent">{payload.clueTitle ?? '线索'}</span>
        </>
      ),
    };
  }
  if (e.type === 'phase_enter') {
    return {
      icon: '📋',
      iconClass: 'ev-phase',
      content: <span className="ev-muted">进入：{payload.phaseTitle ?? '新环节'}</span>,
    };
  }
  if (e.type === 'vote_cast') {
    return {
      icon: '🗳️',
      iconClass: 'ev-reveal',
      content: (
        <>
          <strong>{actorName}</strong> 已投票
        </>
      ),
    };
  }
  if (e.type === 'submit_theory') {
    return {
      icon: '💡',
      iconClass: 'ev-theory',
      content: (
        <>
          <strong>{actorName}</strong> 提交了推理
        </>
      ),
    };
  }
  return {
    icon: e.type.charAt(0),
    iconClass: 'ev-phase',
    content: <span className="ev-dim">{e.type}</span>,
  };
}
