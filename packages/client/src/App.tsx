import { Suspense, lazy, useEffect } from 'react';
import { Trans } from '@lingui/macro';
import { I18nProvider } from '@lingui/react';
import { i18n, activateLocale } from './i18n.js';
import { useGameStore } from './store/game.js';
import { useKeyboardCompensation } from './hooks/useKeyboardCompensation.js';
import { LobbyScene } from './scenes/Lobby.js';
import { Header } from './components/Header.js';
import { CharacterSidebar } from './components/CharacterSidebar.js';
import { BgmControl } from './components/BgmControl.js';
import { ScriptBook } from './components/ScriptBook.js';
import { DmNarrative } from './components/DmNarrative.js';
import { WaitingPanel } from './components/WaitingPanel.js';
import { DmObserver } from './components/DmObserver.js';
import { ToastViewport } from './lib/toast-viewport.js';
import { useBgmUnlock } from './audio/useBgmState.js';
import { useBgmPhaseRouter } from './audio/useBgmPhaseRouter.js';

// 路由级懒加载：首屏只加载 Lobby，其余 scene 按需加载
const AssigningScene = lazy(() => import('./scenes/Assigning.js').then(m => ({ default: m.AssigningScene })));
const BriefingScene = lazy(() => import('./scenes/Briefing.js').then(m => ({ default: m.BriefingScene })));
const IntroScene = lazy(() => import('./scenes/Intro.js').then(m => ({ default: m.IntroScene })));
const FreeScene = lazy(() => import('./scenes/Free.js').then(m => ({ default: m.FreeScene })));
const VoteScene = lazy(() => import('./scenes/Vote.js').then(m => ({ default: m.VoteScene })));
const RevealScene = lazy(() => import('./scenes/Reveal.js').then(m => ({ default: m.RevealScene })));
const FinishedScene = lazy(() => import('./scenes/Reveal.js').then(m => ({ default: m.FinishedScene })));

export function App() {
  useEffect(() => {
    activateLocale('zh-CN');
  }, []);

  // P0-2: 移动端键盘弹起时补偿视口高度,避免输入框被遮挡
  useKeyboardCompensation();
  const status = useGameStore((s) => s.view?.status);
  const phaseKind = useGameStore((s) => s.view?.currentPhase?.kind);
  const phaseId = useGameStore((s) => s.view?.currentPhase?.id);
  const connected = useGameStore((s) => s.connected);
  const connect = useGameStore((s) => s.connect);
  const conn = useGameStore((s) => s.conn);
  const roomCode = useGameStore((s) => s.roomCode);
  const sessionToken = useGameStore((s) => s.sessionToken);
  const nickname = useGameStore((s) => s.nickname);
  // #1: 只订阅「是否有 view」(布尔),而非整个 view 对象 —— 否则每次 stateSync(讨论期每条发言/搜证)
  // 都会重渲 App 及其全部子树(Header/Sidebar/ScriptBook),抵消它们各自的细粒度 selector 收益。
  const hasView = useGameStore((s) => s.view !== null);

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
    <I18nProvider i18n={i18n}>
      <div className="stage-ambient" aria-hidden />
      <div className="stage-grain" aria-hidden />
      <div className="app-shell">
        <Header />
        <div className="app-body">
          <div className="main-content">
            <div className="main-inner">
              <SceneRoot
                connected={connected}
                hasView={hasView}
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
      {status === 'playing' && <WaitingPanel />}
      {(status === 'playing' || status === 'finished') && <DmObserver />}
      {(status === 'playing' || status === 'finished') && <ScriptBook />}
      <DmNarrative />
    </I18nProvider>
  );
}

function SceneRoot({ connected, hasView, status, phaseKind, phaseId }: {
  connected: boolean;
  hasView: boolean;
  status: string | undefined;
  phaseKind: string | undefined;
  phaseId: string | undefined;
}) {
  if (!connected) return <LobbyScene />;
  if (!hasView) return <LoadingScreen tip={<Trans>连接中...</Trans>} />;

  return (
    <div key={`${status}-${phaseId ?? phaseKind ?? 'none'}`} className="scene-fade">
      <Suspense fallback={<LoadingScreen tip={<Trans>加载中...</Trans>} />}>
        {status === 'lobby' && <LobbyScene />}
        {status === 'assigning' && <AssigningScene />}
        {status === 'playing' && phaseKind === 'briefing' && <BriefingScene />}
        {status === 'playing' && phaseKind === 'sequential' && <IntroScene />}
        {status === 'playing' && phaseKind === 'free' && <FreeScene />}
        {status === 'playing' && phaseKind === 'vote' && <VoteScene />}
        {status === 'playing' && phaseKind === 'reveal' && <RevealScene />}
        {status === 'finished' && <FinishedScene />}
        {status === 'playing' && !phaseKind && <LoadingScreen tip={<Trans>加载环节...</Trans>} />}
      </Suspense>
    </div>
  );
}

function LoadingScreen({ tip, tone }: { tip: React.ReactNode; tone?: 'error' }) {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p className={tone === 'error' ? 'is-error' : ''}>{tip}</p>
    </div>
  );
}
