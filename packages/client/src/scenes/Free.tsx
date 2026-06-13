import { useEffect, useRef, useState, useMemo } from 'react';
import { useGameStore } from '../store/game.js';
import { useExcerptSelection } from '../hooks/useExcerptSelection.js';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { Lightbox } from '../components/Visual.js';
import { PhaseStatus } from '../components/PhaseStatus.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { pushToast } from '../lib/toast.js';
import { SearchTab } from './Free/SearchTab.js';
import { ChatTab } from './Free/ChatTab.js';
import { CluesTab } from './Free/CluesTab.js';
import { PrivateTab } from './Free/PrivateTab.js';
import { TheoryTab } from './Free/TheoryTab.js';
import { CaseNotes } from './Free/CaseNotes.js';
import { EventLog } from './Free/EventLog.js';

type TabKey = 'search' | 'chat' | 'clues' | 'private' | 'theory';

export function FreeScene() {
  const view = useGameStore((s) => s.view);
  const send = useGameStore((s) => s.send);
  const privateMessages = useGameStore((s) => s.privateMessages);
  const [tab, setTab] = useState<TabKey>('search');
  const [lightbox, setLightbox] = useState<{ src: string; caption?: string } | null>(null);
  const [lastSeenPmTs, setLastSeenPmTs] = useState<number>(0);
  const [pmTarget, setPmTarget] = useState('');
  const [hostAdvanceConfirm, setHostAdvanceConfirm] = useState(false);
  const [timerSticky, setTimerSticky] = useState(false);

  // Sticky timer: detect when PhaseStatus scrolls out of view
  useEffect(() => {
    const target = document.querySelector('.phase-status');
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setTimerSticky(!entry.isIntersecting);
    }, { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [view?.currentPhase?.id]);

  // Phase narrative (collapsible)
  const [narrativeExpanded, setNarrativeExpanded] = useState(true);
  const [narrativeRead, setNarrativeRead] = useState(false);

  // Objectives (collapsible)
  const [objExpanded, setObjExpanded] = useState(false);

  // Mandatory reveal (collapsible)
  const [revealExpanded, setRevealExpanded] = useState(false);

  // Excerpt selection
  const excerpt = useExcerptSelection({
    selector: '.clue-card-text, .clue-card-title, .scene-detail-desc, .scene-detail-name',
    resolveSource: (el) => {
      const card = el.closest('.clue-card');
      const scene = el.closest('.scene-detail');
      if (card) return card.querySelector('.clue-card-title')?.textContent?.trim() || '线索卡';
      if (scene) return scene.querySelector('.scene-detail-name')?.textContent?.trim() || '场景';
      return '线索';
    },
  });

  // Derived state
  const self = view?.self;
  const phase = view?.currentPhase;
  const allowed = useMemo(() => new Set(phase?.allowedActions ?? []), [phase?.allowedActions]);
  const playerId = useGameStore((s) => s.playerId);
  const myCharId = view?.players.find((p) => p.playerId === playerId)?.charId;
  const scriptId = view?.selectedScript?.id;
  const isHost = view?.players.find((p) => p.playerId === playerId)?.isHost;
  const publicCharacters = view?.publicCharacters ?? [];
  const noteKey = scriptId && playerId ? `case-notes:${scriptId}:${playerId}` : null;

  // Memoized derivations
  const hasSearchable = (view?.searchableClues?.length ?? 0) > 0;
  const hasMyClues = (self?.myClues?.length ?? 0) > 0;
  const hasRevealed = (view?.revealedClues?.length ?? 0) > 0;

  const mentionCandidates = useMemo(
    () => publicCharacters.filter((c) => c.id !== myCharId),
    [publicCharacters, myCharId],
  );
  const pmCandidates = useMemo(
    () => publicCharacters.filter((c) => c.id !== myCharId && !c.isVictim),
    [publicCharacters, myCharId],
  );
  const pmStats = useMemo(() => {
    const stats = new Map<string, { count: number; latestTs: number }>();
    for (const msg of privateMessages) {
      if (!myCharId) continue;
      const otherId = msg.fromCharId === myCharId ? msg.toCharId : msg.toCharId === myCharId ? msg.fromCharId : null;
      if (!otherId) continue;
      const current = stats.get(otherId) ?? { count: 0, latestTs: 0 };
      stats.set(otherId, { count: current.count + 1, latestTs: Math.max(current.latestTs, msg.ts) });
    }
    return stats;
  }, [privateMessages, myCharId]);

  // Tab logic
  const tabs = useMemo(() => [
    { key: 'search' as const, label: '搜索', show: hasSearchable },
    { key: 'chat' as const, label: '讨论', show: allowed.has('speak') },
    { key: 'clues' as const, label: '线索', show: hasRevealed || hasMyClues },
    { key: 'private' as const, label: '私信', show: allowed.has('privateMessage') },
    { key: 'theory' as const, label: '推理', show: allowed.has('submitTheory') },
  ].filter(t => t.show), [hasSearchable, allowed, hasRevealed, hasMyClues]);
  const effectiveTab = tabs.some(t => t.key === tab) ? tab : tabs[0]?.key;

  // Clue tab flash
  const [clueTabFlash, setClueTabFlash] = useState(false);
  const lastSeenAcquiredCount = useRef<number>(0);
  useEffect(() => {
    const cur = self?.myClues?.length ?? 0;
    if (cur > lastSeenAcquiredCount.current) {
      lastSeenAcquiredCount.current = cur;
      setClueTabFlash(true);
      const t = window.setTimeout(() => setClueTabFlash(false), 1500);
      return () => window.clearTimeout(t);
    }
  }, [self?.myClues?.length]);

  // PM helpers
  const updateLastSeenPm = (newTarget: string, newTab: TabKey) => {
    if (newTab === 'private') {
      setLastSeenPmTs(Date.now());
    }
    setTab(newTab);
    if (newTarget !== pmTarget) {
      setPmTarget(newTarget);
      setLastSeenPmTs(Date.now());
    }
  };

  // Phase narrative typewriter
  const phaseNarrative = phase?.narrativeText ?? '';
  const narrative = useTypewriter(phaseNarrative, {
    speed: 22,
    startDelay: 300,
    enabled: narrativeExpanded && !narrativeRead,
  });

  const prevPhaseRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (phase?.id !== prevPhaseRef.current) {
      prevPhaseRef.current = phase?.id;
      setNarrativeExpanded(!!phaseNarrative);
      setNarrativeRead(false);
    }
  }, [phase?.id, phaseNarrative]);

  useEffect(() => {
    if (narrative.done && narrativeExpanded && phaseNarrative) {
      setNarrativeRead(true);
    }
  }, [narrative.done, narrativeExpanded, phaseNarrative]);

  return (
    <div onMouseUp={excerpt.onMouseUp}>
      <PhaseStatus />

      {/* Phase narrative (collapsible) */}
      {phaseNarrative && (
        <div className={`phase-narrative ${narrativeExpanded ? 'expanded' : 'collapsed'}`}>
          <button
            className="phase-narrative-toggle"
            onClick={() => {
              if (narrativeExpanded) {
                setNarrativeExpanded(false);
              } else {
                setNarrativeExpanded(true);
                setNarrativeRead(false);
              }
            }}
          >
            <span className="phase-narrative-icon">📖</span>
            <span className="phase-narrative-label">
              {narrativeExpanded ? '收起剧情' : '查看剧情'}
            </span>
            <span className={`phase-narrative-arrow ${narrativeExpanded ? 'up' : 'down'}`}>▾</span>
          </button>
          {narrativeExpanded && (
            <div className="phase-narrative-body">
              <p className="phase-narrative-text">
                {narrative.displayed || ' '}
                {!narrative.done && <span className="phase-narrative-caret">▍</span>}
              </p>
              {!narrative.done && (
                <button
                  className="btn btn-ghost btn-sm phase-narrative-skip"
                  onClick={() => narrative.skip()}
                >
                  跳过 ▸▸
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Objectives (collapsible) */}
      {self && self.objectives.length > 0 && (
        <div className={`phase-objectives ${objExpanded ? 'expanded' : 'collapsed'}`}>
          <button
            className="phase-objectives-toggle"
            onClick={() => setObjExpanded(!objExpanded)}
          >
            <span className="phase-objectives-icon">🎯</span>
            <span className="phase-objectives-label">
              {objExpanded ? '收起目标' : '我的目标'}
            </span>
            <span className="phase-objectives-count">{self.objectives.length}</span>
            <span className={`phase-objectives-arrow ${objExpanded ? 'up' : 'down'}`}>▾</span>
          </button>
          {objExpanded && (
            <div className="phase-objectives-body">
              <ul className="phase-objectives-list">
                {self.objectives.map((o) => (
                  <li key={o.id} className={`obj-${o.kind}`}>
                    <span className="obj-icon">{o.kind === 'main' ? '主' : o.kind === 'hidden' ? '隐' : '支'}</span>
                    <div className="phase-objectives-item">
                      <div className="phase-objectives-kind">
                        {o.kind === 'main' ? '主线目标' : o.kind === 'hidden' ? '隐藏目标' : '支线目标'}
                      </div>
                      <div className="phase-objectives-desc">{o.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Mandatory Reveal (collapsible) */}
      {self?.mandatoryReveal && self.mandatoryReveal.length > 0 && (
        <div className={`phase-objectives ${revealExpanded ? 'expanded' : 'collapsed'}`}>
          <button
            className="phase-objectives-toggle"
            onClick={() => setRevealExpanded(!revealExpanded)}
          >
            <span style={{ fontSize: '15px' }}>📢</span>
            <span className="phase-objectives-label">必须公开的信息</span>
            <span className="phase-objectives-count">{self.mandatoryReveal.length}</span>
            <span className={`phase-objectives-arrow ${revealExpanded ? 'up' : 'down'}`}>▾</span>
          </button>
          {revealExpanded && (
            <div className="phase-objectives-body">
              <p style={{ fontSize: '12px', color: 'var(--ts)', marginBottom: '8px' }}>
                当其他玩家向你提起这些话题时，你必须这样做。
              </p>
              <ul className="phase-objectives-list">
                {self.mandatoryReveal.map((item, i) => (
                  <li key={i}>
                    <span className="obj-icon" style={{ background: 'var(--accent-m)', color: 'var(--accent)' }}>必</span>
                    <div className="phase-objectives-item">
                      <div className="phase-objectives-desc">{item}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {allowed.has('searchClue') && (
      <div className="investigation-summary">
        <div className="summary-tile tile-accent">
          <span>可搜线索</span>
          <strong>{view?.searchableClues.length ?? 0}</strong>
        </div>
        <div className="summary-tile tile-sage">
          <span>我持有</span>
          <strong>{self?.myClues.length ?? 0}</strong>
        </div>
        <div className="summary-tile tile-teal">
          <span>已公开</span>
          <strong>{view?.revealedClues.length ?? 0}</strong>
        </div>
        {phase?.maxSearches != null && (
          <div className="summary-tile">
            <span>剩余搜索</span>
            <strong style={{ color: (phase.maxSearches - (phase.mySearchCount ?? 0)) <= 1 ? 'var(--crimson)' : 'var(--accent)' }}>
              {Math.max(0, phase.maxSearches - (phase.mySearchCount ?? 0))}/{phase.maxSearches}
            </strong>
          </div>
        )}
        <div className="summary-note">
          {allowed.has('searchClue')
            ? '每条线索仅一人可搜。搜到后选择公开或藏匿。'
            : '本轮以讨论和交换信息为主,整理公开线索中的矛盾。'}
        </div>
      </div>
      )}

      <div className="free-layout">
        {/* Left: Action panel */}
        <div className="free-action-panel">
          <div className="tabs">
            {tabs.map(t => (
              <button key={t.key} className={`tab${effectiveTab === t.key ? ' active' : ''}${t.key === 'clues' && clueTabFlash ? ' tab-flash' : ''}`} onClick={() => updateLastSeenPm(pmTarget, t.key)}>
                {t.label}
                {t.key === 'clues' && clueTabFlash && <span className="tab-dot" />}
              </button>
            ))}
          </div>

          <div className="free-tab-body">
            {effectiveTab === 'search' && (
              <SearchTab
                view={view!}
                myCharId={myCharId}
                scriptId={scriptId}
                canSearch={allowed.has('searchClue')}
                send={send}
                onLightbox={setLightbox}
              />
            )}

            {effectiveTab === 'chat' && allowed.has('speak') && (
              <ChatTab
                view={view!}
                myCharId={myCharId}
                publicCharacters={publicCharacters}
                mentionCandidates={mentionCandidates}
                send={send}
              />
            )}

            {effectiveTab === 'clues' && (
              <CluesTab
                view={view!}
                myCharId={myCharId}
                scriptId={scriptId}
                allowed={allowed}
                send={send}
                onLightbox={setLightbox}
              />
            )}

            {effectiveTab === 'private' && allowed.has('privateMessage') && (
              <PrivateTab
                view={view!}
                myCharId={myCharId}
                publicCharacters={publicCharacters}
                pmCandidates={pmCandidates}
                privateMessages={privateMessages}
                pmStats={pmStats}
                lastSeenPmTs={lastSeenPmTs}
                pmTarget={pmTarget}
                onPmTargetChange={setPmTarget}
                onUpdateLastSeen={() => setLastSeenPmTs(Date.now())}
                send={send}
              />
            )}

            {effectiveTab === 'theory' && allowed.has('submitTheory') && (
              <TheoryTab
                myTheory={self?.theory}
                send={send}
              />
            )}
          </div>

          {/* Host advance */}
          {isHost && phase?.allowedActions && view?.phaseProgress?.exitKind === 'hostAdvance' && (
            <div className="host-advance-bar">
              <button onClick={() => setHostAdvanceConfirm(true)} className="btn btn-secondary btn-block">
                结束讨论并推进
              </button>
              <ConfirmDialog
                open={hostAdvanceConfirm}
                title="确认推进"
                message="确定结束当前环节？所有玩家将进入下一阶段。"
                confirmLabel="推进"
                cancelLabel="取消"
                onConfirm={() => { send({ kind: 'hostAdvance' }); pushToast('已推进到下一阶段', 'info', 1800); setHostAdvanceConfirm(false); }}
                onCancel={() => setHostAdvanceConfirm(false)}
              />
            </div>
          )}
        </div>

        {/* Right: Event log */}
        <div className="free-event-panel">
          <CaseNotes noteKey={noteKey} />
          <EventLog
            view={view!}
            myCharId={myCharId}
            publicCharacters={publicCharacters}
          />
        </div>
      </div>
      {lightbox && <Lightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />}
      {/* Floating timer pill — appears when PhaseStatus scrolls out of view */}
      {timerSticky && phase?.deadline && (
        <FloatingTimer deadline={phase.deadline} />
      )}
      {excerpt.toolbar}
    </div>
  );
}

/** Sticky floating countdown pill */
function FloatingTimer({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, []);
  const remaining = Math.max(0, deadline - now);
  const isUrgent = remaining < 30_000;
  const isCritical = remaining < 15_000;
  const total = Math.ceil(remaining / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  const cls = isCritical ? 'status-pill-critical' : isUrgent ? 'status-pill-urgent' : '';
  return (
    <div className="timer-sticky-pill">
      <span className={`status-pill ${cls}`}>{isUrgent ? '⚠ ' : ''}{min}:{String(sec).padStart(2, '0')}</span>
    </div>
  );
}
