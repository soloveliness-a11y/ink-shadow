import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/game.js';
import { PhaseStatus } from '../components/PhaseStatus.js';
import { SPEECH_MAX } from '../lib/limits.js';

const PLACEHOLDER_PROMPTS = [
  '说出你的不在场证明...',
  '描述你和死者的关系...',
  '你注意到了什么可疑之处？',
  '分享你的行踪时间线...',
];

export function IntroScene() {
  const view = useGameStore((s) => s.view);
  const send = useGameStore((s) => s.send);
  const playerId = useGameStore((s) => s.playerId);
  const [text, setText] = useState('');
  const [placeholder] = useState(() => PLACEHOLDER_PROMPTS[Math.floor(Math.random() * PLACEHOLDER_PROMPTS.length)]);
  const logRef = useRef<HTMLDivElement>(null);

  const myCharId = view?.players.find((p) => p.playerId === playerId)?.charId;
  const isMyTurn = view?.currentPhase?.turnCharId === myCharId;

  const currentSpeaker = view?.publicCharacters.find((c) => c.id === view?.currentPhase?.turnCharId)?.name;
  const myChar = view?.publicCharacters.find((c) => c.id === myCharId);
  const publicCharacters = view?.publicCharacters ?? [];
  const turnOrder = view?.phaseProgress?.requiredCharIds ?? [];
  const actedIds = new Set(view?.phaseProgress?.actedCharIds ?? []);
  const speeches = view?.log.filter((e) => e.type === 'speak').slice(-8) ?? [];
  const speak = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    send({ kind: 'speak', text: trimmed.slice(0, SPEECH_MAX) });
    setText('');
  };

  // Auto-scroll speech log when new speeches arrive, but only if user hasn't scrolled up
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [speeches]);

  const turnOrderDisplay = turnOrder.length > 0 ? turnOrder : (view?.currentPhase?.turnCharId ? [view.currentPhase.turnCharId] : []);

  return (
    <div className="intro-stage">
      <PhaseStatus />
      <div className="intro-heading">
        <div className="scene-heading">{view?.currentPhase?.title}</div>
        {view?.currentPhase?.instruction && <div className="scene-subheading">{view.currentPhase.instruction}</div>}
      </div>

      <div className="stage-panel intro-current-panel">
        <div className="stage-current">
          <div>
            <div className="section-label">当前发言</div>
            <div className={`intro-current-speaker${isMyTurn ? ' mine' : ''}`}>
              {isMyTurn ? '轮到你了' : currentSpeaker ?? '等待中'}
            </div>
            {!isMyTurn && currentSpeaker && <div className="intro-current-tip">请听取对方的公开身份与案发时间线。</div>}
          </div>
          {myChar && (
            <div className="intro-brief">
              <span className="badge badge-accent">你的身份</span>
              <strong>{myChar.name}</strong>
              <span>{myChar.publicProfile}</span>
            </div>
          )}
        </div>
        {turnOrderDisplay.length > 0 && (
          <div className="turn-strip">
            {turnOrderDisplay.map((id) => {
              const ch = view?.publicCharacters.find((c) => c.id === id);
              const current = view?.currentPhase?.turnCharId === id;
              const done = actedIds.has(id);
              return (
                <div key={id} className={`turn-chip${current ? ' current' : ''}${done ? ' done' : ''}`}>
                  <span>{ch?.name ?? id}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="prompt-grid">
          <div><span>1</span>公开身份和与死者的关系</div>
          <div><span>2</span>案发前后的可公开行踪</div>
          <div><span>3</span>你认为可疑的人或矛盾点</div>
        </div>
      </div>

      {/* Speech input */}
      {isMyTurn ? (
        <div className="intro-speech-composer">
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, SPEECH_MAX))}
            onKeyDown={(e) => e.key === 'Enter' && speak()}
            placeholder={placeholder}
            maxLength={SPEECH_MAX}
          />
          <div className="composer-counter" aria-live="polite">
            {text.length}/{SPEECH_MAX}
          </div>
          <button onClick={speak} disabled={!text.trim()} className="btn btn-primary">
            发言
          </button>
        </div>
      ) : (
        <p className="intro-waiting">
          {currentSpeaker ? `等待 ${currentSpeaker} 发言…` : '正在准备发言顺序…'}
        </p>
      )}

      {/* Speech log */}
      <div className="intro-log" ref={logRef}>
        <div className="section-label">发言记录</div>
        {speeches.length > 0 ? speeches.map((e, i) => {
          const speaker = publicCharacters.find((c) => c.id === e.actorCharId)?.name ?? '???';
          const isSelf = e.actorCharId === myCharId;
          return (
            <div key={i} className="intro-log-row">
              <strong className={isSelf ? 'mine' : ''}>{speaker}:</strong>
              <span>{String((e.payload as Record<string, string>)?.text ?? '')}</span>
            </div>
          );
        }) : (
          <div className="empty-state compact">发言记录会在这里沉淀，方便下一轮抓矛盾。</div>
        )}
      </div>
    </div>
  );
}
