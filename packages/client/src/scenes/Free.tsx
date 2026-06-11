import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { useExcerptSelection } from '../hooks/useExcerptSelection.js';
import { Lightbox } from '../components/Visual.js';
import { PhaseStatus } from '../components/PhaseStatus.js';
import { pushToast } from '../lib/toast.js';
import { SPEECH_MAX, SEARCH_COOLDOWN_MS } from '../lib/limits.js';
import type { GameEvent } from '@mmg/schema';

export function FreeScene() {
  const view = useGameStore((s) => s.view);
  const send = useGameStore((s) => s.send);
  const privateMessages = useGameStore((s) => s.privateMessages);
  const [tab, setTab] = useState<'search' | 'chat' | 'clues' | 'private'>('search');
  const [chatText, setChatText] = useState('');
  const [pmText, setPmText] = useState('');
  const [pmTarget, setPmTarget] = useState('');
  const [caseNote, setCaseNote] = useState('');
  const [loadedNoteKey, setLoadedNoteKey] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; caption?: string } | null>(null);
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
  const [lastSeenPmTs, setLastSeenPmTs] = useState<number>(0);
  const [mentionPicker, setMentionPicker] = useState<{ anchor: number; options: { id: string; name: string }[] } | null>(null);
  const [searchCooldown, setSearchCooldown] = useState<number>(0);
  const chatThreadRef = useRef<HTMLDivElement>(null);
  const pmThreadRef = useRef<HTMLDivElement>(null);

  const self = view?.self;
  const phase = view?.currentPhase;
  const allowed = new Set(phase?.allowedActions ?? []);
  const playerId = useGameStore((s) => s.playerId);
  const myCharId = view?.players.find((p) => p.playerId === playerId)?.charId;
  const scriptId = view?.selectedScript?.id;
  const isHost = view?.players.find((p) => p.playerId === playerId)?.isHost;
  const publicCharacters = view?.publicCharacters ?? [];
  const noteKey = scriptId && playerId ? `case-notes:${scriptId}:${playerId}` : null;

  useEffect(() => {
    setCaseNote(readCaseNote(noteKey));
    setLoadedNoteKey(noteKey);
  }, [noteKey]);

  useEffect(() => {
    if (!noteKey || loadedNoteKey !== noteKey) return;
    writeCaseNote(noteKey, caseNote);
  }, [caseNote, loadedNoteKey, noteKey]);

  // 搜证冷却 timer
  useEffect(() => {
    if (searchCooldown <= 0) return;
    const t = window.setTimeout(() => setSearchCooldown((c) => Math.max(0, c - 100)), 100);
    return () => window.clearTimeout(t);
  }, [searchCooldown]);

  // 监听 search_clue event 触发 toast(我搜到了)
  const lastSeenSearchId = useRef<number>(-1);
  useEffect(() => {
    const recent = view?.log?.filter((e) => e.type === 'search_clue').slice(-3) ?? [];
    for (const e of recent) {
      if (e.ts > lastSeenSearchId.current && e.actorCharId === myCharId) {
        lastSeenSearchId.current = e.ts;
        const title = (e.payload as Record<string, string>)?.clueTitle ?? '线索';
        pushToast(`获得了线索:${title}`, 'success', 2200);
        break;
      }
    }
  }, [view?.log, myCharId]);

  const hasSearchable = (view?.searchableClues?.length ?? 0) > 0;
  const hasMyClues = (self?.myClues?.length ?? 0) > 0;
  const hasRevealed = (view?.revealedClues?.length ?? 0) > 0;
  const revealedIds = new Set(view?.revealedClues?.map((cl) => cl.id) ?? []);
  const myHiddenClues = self?.myClues?.filter((cl) => !revealedIds.has(cl.id)) ?? [];
  const myRevealedClues = self?.myClues?.filter((cl) => revealedIds.has(cl.id)) ?? [];
  const scenes = view?.publicScenes ?? [];
  const selectedSceneId = sceneId ?? scenes[0]?.id ?? null;
  const selectedScene = scenes.find((s) => s.id === selectedSceneId);
  const selectedSceneClues = view?.searchableClues?.filter((cl) => cl.sceneId === selectedSceneId) ?? [];
  const unscenedClues = view?.searchableClues?.filter((cl) => !cl.sceneId) ?? [];
  const speechLog = view?.log.filter(e => e.type === 'speak') ?? [];
  const recentActions = view?.log.filter((e) => ['search_clue', 'reveal_clue', 'speak', 'privateMessage'].includes(e.type)).slice(-5) ?? [];
  const eventLog = view?.log.slice(-30) ?? [];
  const currentThread = privateMessages.filter((msg) =>
    pmTarget && myCharId &&
    ((msg.fromCharId === myCharId && msg.toCharId === pmTarget) || (msg.fromCharId === pmTarget && msg.toCharId === myCharId))
  );
  const pmTargetName = view?.publicCharacters.find((c) => c.id === pmTarget)?.name;
  const pmCandidates = publicCharacters.filter((c) => c.id !== myCharId && !c.isVictim);
  const mentionCandidates = publicCharacters.filter((c) => c.id !== myCharId);
  const pmStats = new Map<string, { count: number; latestTs: number }>();
  for (const msg of privateMessages) {
    if (!myCharId) continue;
    const otherId = msg.fromCharId === myCharId ? msg.toCharId : msg.toCharId === myCharId ? msg.fromCharId : null;
    if (!otherId) continue;
    const current = pmStats.get(otherId) ?? { count: 0, latestTs: 0 };
    pmStats.set(otherId, { count: current.count + 1, latestTs: Math.max(current.latestTs, msg.ts) });
  }

  // Update lastSeenPmTs when switching pmTarget or switching to pm tab
  const updateLastSeenPm = (newTarget: string, newTab: typeof tab) => {
    if (newTab === 'private') {
      setLastSeenPmTs(Date.now());
    }
    setTab(newTab);
    if (newTarget !== pmTarget) {
      setPmTarget(newTarget);
      setLastSeenPmTs(Date.now());
    }
  };

  const sendChat = () => {
    const trimmed = chatText.trim();
    if (!trimmed) return;
    send({ kind: 'speak', text: trimmed.slice(0, SPEECH_MAX) });
    setChatText('');
  };

  const onChatChange = (val: string) => {
    setChatText(val.slice(0, SPEECH_MAX));
    // 检测最后一个 '/' 触发 @ 提及选择
    const caret = val.length;
    const lastSlash = val.lastIndexOf('/');
    if (lastSlash >= 0 && lastSlash === caret - 1) {
      // 显示以 / 开头的选择
      const opts = mentionCandidates
        .filter((c) => c.name)
        .map((c) => ({ id: c.id, name: c.name }));
      if (opts.length) {
        setMentionPicker({ anchor: lastSlash, options: opts });
        return;
      }
    }
    // 检测 "@" 后面接文字
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
    const after = chatText.slice(mentionPicker.anchor); // 通常是 '/'
    // 替换 / 之后的部分为 @name
    const merged = `${before}@${name} ${after.replace(/^[/@]\S*/, '')}`.trimEnd();
    setChatText(merged.slice(0, SPEECH_MAX));
    setMentionPicker(null);
  };

  const sendPrivate = () => {
    const trimmed = pmText.trim();
    if (!trimmed || !pmTarget) return;
    send({ kind: 'privateMessage', toCharId: pmTarget, text: trimmed.slice(0, SPEECH_MAX) });
    setPmText('');
  };

  const doSearchClue = (clueId: string, title: string) => {
    if (searchCooldown > 0) {
      pushToast('操作太快,稍候再试', 'warn', 1400);
      return;
    }
    send({ kind: 'searchClue', clueId });
    setSearchCooldown(SEARCH_COOLDOWN_MS);
    // 乐观提示
    pushToast(`正在搜索:${title}`, 'info', 1200);
  };

  // (线索卡/场景摘录逻辑已抽到 useExcerptSelection hook,见 excerpt.onMouseUp / excerpt.toolbar)

  // Auto-scroll chat-thread when new messages arrive
  useEffect(() => {
    const el = chatThreadRef.current;
    if (!el) return;
    const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [speechLog]);

  // Auto-scroll pm-thread when new messages arrive
  useEffect(() => {
    const el = pmThreadRef.current;
    if (!el) return;
    const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [currentThread]);

  const tabs = [
    { key: 'search' as const, label: '搜索', show: hasSearchable },
    { key: 'chat' as const, label: '讨论', show: allowed.has('speak') },
    { key: 'clues' as const, label: '线索', show: hasRevealed || hasMyClues },
    { key: 'private' as const, label: '私信', show: allowed.has('privateMessage') },
  ].filter(t => t.show);
  const effectiveTab = tabs.some(t => t.key === tab) ? tab : tabs[0]?.key;

  // 新搜到线索时,clues tab 闪一下(?)
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

  return (
    <div onMouseUp={excerpt.onMouseUp}>
      <PhaseStatus />

      <div className="investigation-summary">
        <div className="summary-tile">
          <span>可搜线索</span>
          <strong>{view?.searchableClues.length ?? 0}</strong>
        </div>
        <div className="summary-tile">
          <span>我持有</span>
          <strong>{self?.myClues.length ?? 0}</strong>
        </div>
        <div className="summary-tile">
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
            {/* Search */}
            {effectiveTab === 'search' && (
              <div className="search-layout">
                {scenes.length > 0 && (
                  <div className="scene-list">
                    {scenes.map((sc) => {
                      const img = assetUrl(scriptId, sc.image);
                      const clueCount = view?.searchableClues?.filter((cl) => cl.sceneId === sc.id).length ?? 0;
                      const progress = view?.sceneSearchProgress?.[sc.id];
                      const exhausted = progress && progress.total > 0 && (progress.total - progress.acquired) === 0;
                      const active = selectedSceneId === sc.id;
                      return (
                        <button key={sc.id} className={`scene-chip${active ? ' active' : ''}${exhausted ? ' exhausted' : ''}`} onClick={() => setSceneId(sc.id)}>
                          {img ? <img src={img} alt={sc.name} loading="lazy" decoding="async" /> : <span className="scene-chip-fallback">{sc.name.charAt(0)}</span>}
                          <span>
                            <strong>{sc.name}</strong>
                            <small>{progress ? `${progress.acquired}/${progress.total} 已搜` : `${clueCount} 条可搜`}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedScene && (
                  <div className="scene-detail">
                    {assetUrl(scriptId, selectedScene.image) && (
                      <img
                        src={assetUrl(scriptId, selectedScene.image)}
                        alt={selectedScene.name}
                        className="scene-hero"
                        loading="lazy"
                        decoding="async"
                        onClick={() => {
                          const src = assetUrl(scriptId, selectedScene.image);
                          if (src) setLightbox({ src, caption: selectedScene.name });
                        }}
                      />
                    )}
                    <div className="scene-detail-name">{selectedScene.name}</div>
                    <p className="scene-detail-desc">{selectedScene.description}</p>
                  </div>
                )}

                <div className="search-clue-list">
                  {selectedSceneClues.length > 0 && (
                    <div className="section-label">待搜索线索</div>
                  )}
                  {selectedSceneClues.map((cl) => (
                    <SearchClueRow
                      key={cl.id}
                      title={cl.title}
                      onSearch={() => doSearchClue(cl.id, cl.title)}
                      canSearch={allowed.has('searchClue')}
                      cooldown={searchCooldown}
                    />
                  ))}
                  {unscenedClues.length > 0 && (
                    <>
                      <div className="section-label section-label-spaced">其他线索</div>
                      {unscenedClues.map((cl) => (
                        <SearchClueRow
                          key={cl.id}
                          title={cl.title}
                          onSearch={() => doSearchClue(cl.id, cl.title)}
                          canSearch={allowed.has('searchClue')}
                          cooldown={searchCooldown}
                        />
                      ))}
                    </>
                  )}
                </div>
                {selectedSceneClues.length === 0 && unscenedClues.length === 0 && selectedScene ? (
                  <div className="empty-state compact">该地点暂无更多线索可搜</div>
                ) : (!view?.searchableClues || view.searchableClues.length === 0) && !selectedScene ? (
                  <div className="empty-state compact">当前没有可搜索的线索</div>
                ) : null}
              </div>
            )}

            {/* Chat */}
            {effectiveTab === 'chat' && allowed.has('speak') && (
              <div className="chat-workbench">
                <div className="chat-thread" ref={chatThreadRef}>
                  {speechLog.length > 0 ? speechLog.slice(-14).map((e, i) => {
                    const speaker = publicCharacters.find((c) => c.id === e.actorCharId)?.name ?? '???';
                    const isSelf = e.actorCharId === myCharId;
                    return (
                      <div key={i} className={`chat-message${isSelf ? ' mine' : ''}`}>
                        <div className="chat-speaker">{speaker}</div>
                        <div className="chat-text">{String((e.payload as Record<string, string>)?.text ?? '')}</div>
                      </div>
                    );
                  }) : (
                    <div className="empty-state">还没有公开发言。第一句话往往最容易暴露立场。</div>
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
                  <div className="composer-counter" aria-live="polite">
                    {chatText.length}/{SPEECH_MAX}
                  </div>
                  <button onClick={sendChat} disabled={!chatText.trim()} className="btn btn-primary btn-sm">发送</button>
                </div>
              </div>
            )}

            {/* Clues */}
            {effectiveTab === 'clues' && (
              <div>
                {hasRevealed && (
                  <>
                    <div className="section-label">公共线索</div>
                    {view?.revealedClues.map((cl) => {
                      const cu = assetUrl(scriptId, cl.visual?.asset?.path);
                      return (
                        <ClueCard
                          key={cl.id}
                          title={cl.title}
                          content={cl.content}
                          image={cu}
                          badge={<span className="badge badge-sage">已公开</span>}
                          onImage={() => cu && setLightbox({ src: cu, caption: cl.title })}
                        />
                      );
                    })}
                  </>
                )}
                {myHiddenClues.length > 0 && (
                  <>
                    <div className="section-label section-label-spaced">我的未公开线索</div>
                    {myHiddenClues.map((cl) => {
                      const cu = assetUrl(scriptId, cl.visual?.asset?.path);
                      return (
                        <ClueCard
                          key={cl.id}
                          title={cl.title}
                          content={cl.content}
                          image={cu}
                          badge={<span className="badge badge-teal">仅你持有</span>}
                          action={allowed.has('revealClue') ? <RevealClueButton title={cl.title} onConfirm={() => { send({ kind: 'revealClue', clueId: cl.id }); pushToast('已公开线索', 'success', 1800); }} /> : undefined}
                          onImage={() => cu && setLightbox({ src: cu, caption: cl.title })}
                        />
                      );
                    })}
                  </>
                )}
                {myRevealedClues.length > 0 && (
                  <>
                    <div className="section-label section-label-spaced">我已公开的线索</div>
                    {myRevealedClues.map((cl) => {
                      const cu = assetUrl(scriptId, cl.visual?.asset?.path);
                      return (
                        <ClueCard
                          key={cl.id}
                          title={cl.title}
                          content={cl.content}
                          image={cu}
                          badge={<span className="badge badge-sage">已公开</span>}
                          onImage={() => cu && setLightbox({ src: cu, caption: cl.title })}
                        />
                      );
                    })}
                  </>
                )}
                {!hasRevealed && !hasMyClues && <div className="empty-state compact">还没有获得线索</div>}
              </div>
            )}

            {/* Private message */}
            {effectiveTab === 'private' && allowed.has('privateMessage') && (
              <div className="pm-workbench">
                <div className="pm-head">
                  <div>
                    <div className="pm-title">{pmTargetName ? `与 ${pmTargetName}` : '暗线私信'}</div>
                    <div className="pm-sub">私信不会进入公共讨论记录。</div>
                  </div>
                  <span className="badge badge-muted">{currentThread.length} 条</span>
                </div>
                <select className="input pm-select" value={pmTarget} onChange={(e) => updateLastSeenPm(e.target.value, effectiveTab)}>
                  <option value="">选择对象...</option>
                  {pmCandidates.map((c) => {
                    const stat = pmStats.get(c.id);
                    return (
                      <option key={c.id} value={c.id}>
                        {stat ? `${c.name} · ${stat.count}条` : c.name}
                      </option>
                    );
                  })}
                </select>
                <div className="pm-target-row">
                  {pmCandidates.map((c) => {
                    const stat = pmStats.get(c.id);
                    const active = pmTarget === c.id;
                    const hasUnread = (stat?.latestTs ?? 0) > lastSeenPmTs;
                    return (
                      <button
                        key={c.id}
                        className={`pm-target-chip${active ? ' active' : ''}`}
                        onClick={() => updateLastSeenPm(c.id, effectiveTab)}
                        style={{ position: 'relative' }}
                      >
                        <span>{c.name}</span>
                        {stat && <strong>{stat.count}</strong>}
                        {hasUnread && <span className="unread-dot" style={{ position: 'absolute', top: 2, right: 2 }} />}
                      </button>
                    );
                  })}
                </div>
                <div className="pm-thread" ref={pmThreadRef}>
                  {pmTarget ? (
                    currentThread.length > 0 ? currentThread.slice(-20).map((msg) => {
                      const mine = msg.fromCharId === myCharId;
                      const name = mine ? '我' : publicCharacters.find((c) => c.id === msg.fromCharId)?.name ?? '对方';
                      return (
                        <div key={`${msg.ts}-${msg.fromCharId}-${msg.text}`} className={`pm-msg${mine ? ' mine' : ''}`}>
                          <div className="pm-author">{name}</div>
                          <div>{msg.text}</div>
                        </div>
                      );
                    }) : <div className="empty-state compact">还没有私信记录</div>
                  ) : (
                    <div className="empty-state compact">先选择一名角色</div>
                  )}
                </div>
                <div className="composer-bar">
                  <input className="input" value={pmText} onChange={(e) => setPmText(e.target.value.slice(0, SPEECH_MAX))} onKeyDown={(e) => {
                    if (e.key === 'Enter') sendPrivate();
                  }} placeholder={pmTargetName ? `发给 ${pmTargetName}...` : '输入私信内容...'} maxLength={SPEECH_MAX} />
                  <div className="composer-counter">{pmText.length}/{SPEECH_MAX}</div>
                  <button onClick={sendPrivate} disabled={!pmText.trim() || !pmTarget} className="btn btn-primary btn-sm">发送</button>
                </div>
              </div>
            )}
          </div>

          {/* Host advance */}
          {isHost && phase?.allowedActions && view?.phaseProgress?.exitKind === 'hostAdvance' && (
            <div className="host-advance-bar">
              <button onClick={() => { send({ kind: 'hostAdvance' }); pushToast('已推进到下一阶段', 'info', 1800); }} className="btn btn-secondary btn-block">
                结束讨论并推进
              </button>
            </div>
          )}
        </div>

        {/* Right: Event log */}
        <div className="free-event-panel">
          <div className="case-notes">
            <div className="case-notes-head">
              <div>
                <div className="section-label">案情速记</div>
                <p>仅保存在本机,不会公开给其他玩家。</p>
              </div>
              <span>{caseNote.length} 字</span>
            </div>
            <textarea
              className="input case-notes-input"
              value={caseNote}
              onChange={(e) => setCaseNote(e.target.value)}
              placeholder="时间线、矛盾点、想追问的人..."
            />
          </div>
          <div className="section-label">事件记录</div>
          {recentActions.length > 0 && (
            <div className="recent-actions">
              {recentActions.map((e, i) => {
                const actor = publicCharacters.find((c) => c.id === e.actorCharId)?.name;
                const rendered = renderEvent(e, actor, e.actorCharId === myCharId);
                return (
                  <div key={i} className="recent-action">
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
                <div key={i} className="free-event-row">
                  <div className={`ev-icon ${rendered.iconClass}`}>{rendered.icon}</div>
                  <div>{rendered.content}</div>
                </div>
              );
            }) : (
              <div className="empty-state compact">暂无事件记录</div>
            )}
          </div>
        </div>
      </div>
      {lightbox && <Lightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />}
      {excerpt.toolbar}
    </div>
  );
}

function readCaseNote(key: string | null): string {
  if (!key) return '';
  try { return localStorage.getItem(key) ?? ''; }
  catch { return ''; }
}

function writeCaseNote(key: string, text: string): void {
  try { localStorage.setItem(key, text); } catch {}
}

function RevealClueButton({ title, onConfirm }: { title: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [committed, setCommitted] = useState(false);
  if (committed) {
    return <span className="badge badge-muted clue-submitted">已提交</span>;
  }
  if (confirming) {
    return (
      <div className="clue-confirm-actions">
        <button onClick={() => { setCommitted(true); onConfirm(); }} className="btn btn-primary btn-sm">确认公开</button>
        <button onClick={() => setConfirming(false)} className="btn btn-secondary btn-sm">取消</button>
      </div>
    );
  }
  return (
    <button
      onClick={() => setConfirming(true)}
      className="btn btn-ghost btn-sm clue-reveal-btn"
      title={`公开线索：${title}`}
    >
      公开
    </button>
  );
}

function SearchClueRow({ title, canSearch, onSearch, cooldown }: { title: string; canSearch: boolean; onSearch: () => void; cooldown: number }) {
  const disabled = !canSearch || cooldown > 0;
  return (
    <div className="search-clue-row">
      <div>
        <div className="search-clue-title">{title}</div>
        <div className="search-clue-sub">
          {cooldown > 0 ? `冷却中 ${Math.ceil(cooldown / 100) / 10}s` : (canSearch ? '可行动' : '等待行动权限')}
        </div>
      </div>
      {canSearch && <button onClick={onSearch} disabled={disabled} className="btn btn-secondary btn-sm">搜索</button>}
    </div>
  );
}

function ClueCard({ title, content, image, badge, action, onImage }: {
  title: string;
  content: string;
  image?: string | null;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  onImage?: () => void;
}) {
  return (
    <div className="clue-card">
      <div className="clue-card-main">
        <div className="clue-card-content">
          {image && <img src={image} alt={title} className="clue-thumb" onClick={onImage} loading="lazy" decoding="async" />}
          <div>
            <div className="clue-card-head">
              <div className="clue-card-title">{title}</div>
              {badge}
            </div>
            <p className="clue-card-text">{content}</p>
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

function renderEvent(e: GameEvent, actor: string | undefined, isSelf: boolean) {
  const payload = (e.payload ?? {}) as Record<string, string>;
  const actorName = actor ?? '未知角色';
  if (e.type === 'speak') {
    return {
      icon: '聊',
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
      icon: '搜',
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
      icon: '公',
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
      icon: '阶',
      iconClass: 'ev-phase',
      content: <span className="ev-muted">进入：{payload.phaseTitle ?? '新环节'}</span>,
    };
  }
  if (e.type === 'vote_cast') {
    return {
      icon: '投',
      iconClass: 'ev-reveal',
      content: (
        <>
          <strong>{actorName}</strong> 已投票
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
