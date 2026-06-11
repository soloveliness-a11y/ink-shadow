import { useEffect } from 'react';
import { useGameStore } from './store/game.js';
import { LobbyScene } from './scenes/Lobby.js';
import { BriefingScene } from './scenes/Briefing.js';
import { IntroScene } from './scenes/Intro.js';
import { FreeScene } from './scenes/Free.js';
import { VoteScene } from './scenes/Vote.js';
import { RevealScene, FinishedScene } from './scenes/Reveal.js';
import { AssigningScene } from './scenes/Assigning.js';
import { Header } from './components/Header.js';
import { CharacterSidebar } from './components/CharacterSidebar.js';
import { BgmControl } from './components/BgmControl.js';
import { ScriptBook } from './components/ScriptBook.js';
import { ToastViewport } from './lib/toast-viewport.js';
import { useBgmUnlock } from './audio/useBgmState.js';
import { useBgmPhaseRouter } from './audio/useBgmPhaseRouter.js';

export function App() {
  const status = useGameStore((s) => s.view?.status);
  const phaseKind = useGameStore((s) => s.view?.currentPhase?.kind);
  const phaseId = useGameStore((s) => s.view?.currentPhase?.id);
  const connected = useGameStore((s) => s.connected);
  const connect = useGameStore((s) => s.connect);
  const conn = useGameStore((s) => s.conn);
  const roomCode = useGameStore((s) => s.roomCode);
  const sessionToken = useGameStore((s) => s.sessionToken);
  const nickname = useGameStore((s) => s.nickname);
  const view = useGameStore((s) => s.view);

  // BGM: 用户首次交互后解锁 + 跟随 phase 切换
  useBgmUnlock();
  useBgmPhaseRouter();

  useEffect(() => {
    if (!conn && roomCode && sessionToken && nickname) connect();
  }, [conn, connect, nickname, roomCode, sessionToken]);

  useEffect(() => {
    document.querySelector('.main-content')?.scrollTo({ top: 0 });
  }, [phaseId, status]);

  // 离开确认(仅游戏中)
  useEffect(() => {
    if (status !== 'playing') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [status]);

  return (
    <>
      <div className="stage-ambient" aria-hidden />
      <div className="stage-grain" aria-hidden />
      <div className="app-shell">
        <Header />
        <div className="app-body">
          <div className="main-content">
            <div className="main-inner">
              <SceneRoot
                connected={connected}
                view={view}
                status={status}
                phaseKind={phaseKind}
                phaseId={phaseId}
              />
            </div>
          </div>
          {(status === 'playing' || status === 'finished') && <CharacterSidebar />}
        </div>
      </div>
      <ToastViewport />
      <BgmControl />
      {(status === 'playing' || status === 'finished') && <ScriptBook />}
    </>
  );
}

function SceneRoot({ connected, view, status, phaseKind, phaseId }: {
  connected: boolean;
  view: ReturnType<typeof useGameStore.getState>['view'];
  status: string | undefined;
  phaseKind: string | undefined;
  phaseId: string | undefined;
}) {
  if (!connected) return <LobbyScene />;
  if (!view) return <LoadingScreen tip="连接中..." />;

  return (
    <div key={`${status}-${phaseId ?? phaseKind ?? 'none'}`} className="scene-fade">
      {status === 'lobby' && <LobbyScene />}
      {status === 'assigning' && <AssigningScene />}
      {status === 'playing' && phaseKind === 'briefing' && <BriefingScene />}
      {status === 'playing' && phaseKind === 'sequential' && <IntroScene />}
      {status === 'playing' && phaseKind === 'free' && <FreeScene />}
      {status === 'playing' && phaseKind === 'vote' && <VoteScene />}
      {status === 'playing' && phaseKind === 'reveal' && <RevealScene />}
      {status === 'finished' && <FinishedScene />}
      {status === 'playing' && !phaseKind && <LoadingScreen tip="加载环节..." />}
    </div>
  );
}

function LoadingScreen({ tip, tone }: { tip: string; tone?: 'error' }) {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p className={tone === 'error' ? 'is-error' : ''}>{tip}</p>
    </div>
  );
}
