import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { ThemeSwitcher } from './ThemeSwitcher.js';
import type { JSX } from 'react';

export function Header() {
  const view = useGameStore((s) => s.view);
  const savedRoomCode = useGameStore((s) => s.roomCode);
  const roomCode = view?.roomCode || savedRoomCode;
  const phase = view?.currentPhase;
  const scriptTitle = view?.selectedScript?.title;
  const scriptId = view?.selectedScript?.id;
  const coverPath = view?.selectedScript?.cover?.asset?.path;
  const coverUrl = assetUrl(scriptId, coverPath);
  const playerId = useGameStore((s) => s.playerId);
  const me = view?.players.find((p) => p.playerId === playerId);
  const myChar = view?.publicCharacters.find((c) => c.id === me?.charId);
  const onlineCount = view?.players.filter((p) => p.connected).length ?? 0;
  const playerCount = view?.players.length ?? 0;
  const connStatus = useGameStore((s) => s.connectionStatus);

  let scriptMeta: JSX.Element | null = null;
  if (scriptTitle) {
    scriptMeta = (
      <div className="script-meta">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="script-thumb" loading="lazy" decoding="async" />
        ) : (
          <div className="script-thumb-fallback">{scriptTitle.charAt(0)}</div>
        )}
        <span className="script-name">{scriptTitle}</span>
        {phase && (<>
          <span className="script-divider">·</span>
          <span className="phase-name">{phase.title}</span>
        </>)}
        {myChar && (<>
          <span className="script-divider">·</span>
          <span className="phase-name">你是 {myChar.name}</span>
        </>)}
      </div>
    );
  }

  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">墨</span>
        <span>墨影 · 剧本杀</span>
      </div>
      {scriptMeta}
      <div className="header-status">
        {connStatus !== 'connected' && <ConnPill status={connStatus} />}
        {view?.isTestMode && <span className="header-pill">测试</span>}
        {playerCount > 0 && <span className="header-pill">{onlineCount}/{playerCount} 在线</span>}
        {me?.isHost && <span className="header-pill host">房主</span>}
        {roomCode && <span className="room-badge">{roomCode}</span>}
        <ThemeSwitcher />
      </div>
    </header>
  );
}

function ConnPill({ status }: { status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' }) {
  const label =
    status === 'reconnecting' ? '重连中…' :
    status === 'connecting' ? '连接中…' :
    status === 'disconnected' ? '待连接' : '已连接';
  return (
    <span className={`header-pill conn-pill conn-${status}`}>
      <span className="conn-dot" />
      {label}
    </span>
  );
}
