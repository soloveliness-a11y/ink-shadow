import type { ClientIntent } from "@mmg/schema";
import { useEffect, useMemo, useRef, useState } from 'react';
import { SPEECH_MAX } from '../../lib/limits.js';
import type { ClientStateView, PublicCharacter } from '@mmg/schema';

interface ChatTabProps {
  view: ClientStateView;
  myCharId: string | undefined;
  publicCharacters: PublicCharacter[];
  mentionCandidates: PublicCharacter[];
  send: (intent: ClientIntent) => void;
}

export function ChatTab({ view, myCharId, publicCharacters, mentionCandidates, send }: ChatTabProps) {
  const [chatText, setChatText] = useState('');
  const [mentionPicker, setMentionPicker] = useState<{ anchor: number; options: { id: string; name: string }[] } | null>(null);
  const [_isScrolledUp, setIsScrolledUp] = useState(false);
  const [hasNewMsg, setHasNewMsg] = useState(false);
  const chatThreadRef = useRef<HTMLDivElement>(null);
  const prevLogLenRef = useRef(0);

  // #9: memoize 发言日志过滤(log 随对局增长,每次渲染重算 filter)
  const speechLog = useMemo(
    () => view?.log.filter(e => e.type === 'speak') ?? [],
    [view?.log],
  );

  // Detect scroll position
  const handleScroll = () => {
    const el = chatThreadRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
    setIsScrolledUp(!nearBottom);
    if (nearBottom) setHasNewMsg(false);
  };

  // Auto-scroll chat-thread when new messages arrive (only if near bottom)
  useEffect(() => {
    const el = chatThreadRef.current;
    if (!el) return;
    const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    } else if (speechLog.length > prevLogLenRef.current) {
      setHasNewMsg(true);
    }
    prevLogLenRef.current = speechLog.length;
  }, [speechLog]);

  const scrollToBottom = () => {
    const el = chatThreadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setHasNewMsg(false);
  };

  const sendChat = () => {
    const trimmed = chatText.trim();
    if (!trimmed) return;
    send({ kind: 'speak', text: trimmed.slice(0, SPEECH_MAX) });
    setChatText('');
  };

  const onChatChange = (val: string) => {
    setChatText(val.slice(0, SPEECH_MAX));
    const caret = val.length;
    const lastSlash = val.lastIndexOf('/');
    if (lastSlash >= 0 && lastSlash === caret - 1) {
      const opts = mentionCandidates
        .filter((c) => c.name)
        .map((c) => ({ id: c.id, name: c.name }));
      if (opts.length) {
        setMentionPicker({ anchor: lastSlash, options: opts });
        return;
      }
    }
    const lastAt = val.lastIndexOf('@');
    if (lastAt >= 0) {
      const tail = val.slice(lastAt + 1);
      if (!/\s/.test(tail)) {
        const opts = mentionCandidates
          .filter((c) => c.name.includes(tail))
          .map((c) => ({ id: c.id, name: c.name }));
        setMentionPicker({ anchor: lastAt, options: opts });
        return;
      }
    }
    if (mentionPicker) setMentionPicker(null);
  };

  const insertMention = (name: string) => {
    if (!mentionPicker) return;
    const before = chatText.slice(0, mentionPicker.anchor);
    const after = chatText.slice(mentionPicker.anchor);
    const merged = `${before}@${name} ${after.replace(/^[/@]\S*/, '')}`.trimEnd();
    setChatText(merged.slice(0, SPEECH_MAX));
    setMentionPicker(null);
  };

  return (
    <div className="chat-workbench">
      <div className="chat-thread" ref={chatThreadRef} onScroll={handleScroll}>
        {speechLog.length > 0 ? speechLog.slice(-14).map((e, i) => {
          const speaker = publicCharacters.find((c) => c.id === e.actorCharId)?.name ?? '???';
          const isSelf = e.actorCharId === myCharId;
          return (
            <div key={`${e.ts}-speak-${i}`} className={`chat-message${isSelf ? ' mine' : ''}`}>
              <div className="chat-speaker">{speaker}</div>
              <div className="chat-text">{String((e.payload as Record<string, string>)?.text ?? '')}</div>
            </div>
          );
        }) : (
          <div className="empty-state">还没有公开发言。第一句话往往最容易暴露立场。</div>
        )}
        {hasNewMsg && (
          <button className="chat-new-msg-pill" onClick={scrollToBottom}>
            ↓ 新消息
          </button>
        )}
      </div>
      <div className="composer-bar">
        <div className="composer-wrap">
          <input
            className="input"
            value={chatText}
            onChange={(e) => onChatChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !mentionPicker) sendChat();
              if (e.key === 'Escape' && mentionPicker) setMentionPicker(null);
            }}
            placeholder="公开发言... 输入 / 或 @ 提及角色"
            maxLength={SPEECH_MAX}
          />
          {mentionPicker && mentionPicker.options.length > 0 && (
            <div className="mention-picker" role="listbox">
              {mentionPicker.options.slice(0, 6).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); insertMention(opt.name); }}
                >
                  <span className="mention-at">@</span>{opt.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="composer-counter" aria-live="polite" style={{ color: counterColor(chatText.length, SPEECH_MAX) }}>
          {chatText.length}/{SPEECH_MAX}
        </div>
        <button onClick={sendChat} disabled={!chatText.trim()} className="btn btn-primary btn-sm">发送</button>
      </div>
    </div>
  );
}

export function counterColor(len: number, max: number): string {
  const pct = len / max;
  if (pct >= 0.95) return 'var(--crimson, #C45454)';
  if (pct >= 0.80) return '#D49B4F';
  return 'var(--tm)';
}
