import { useEffect, useState } from 'react';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { PhaseStatus } from '../components/PhaseStatus.js';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { useExcerptSelection } from '../hooks/useExcerptSelection.js';

type BriefingTab = 'identity' | 'script' | 'objectives';

/** Parse text with ## headings into styled React elements */
function renderStoryText(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      elements.push(<h4 key={key++} className="briefing-story-heading">{line.slice(3)}</h4>);
    } else if (line.trim() === '') {
      elements.push(<br key={key++} />);
    } else {
      elements.push(<p key={key++} className="briefing-story-para">{line}</p>);
    }
  }
  return elements;
}

export function BriefingScene() {
  const view = useGameStore((s) => s.view);
  const send = useGameStore((s) => s.send);
  const self = view?.self;
  const phase = view?.currentPhase;
  const playerId = useGameStore((s) => s.playerId);
  const isReady = view?.players.find((p) => p.playerId === playerId)?.ready;
  const myChar = self ? view?.publicCharacters.find(c => c.id === self.charId) : undefined;
  const scriptId = view?.selectedScript?.id;
  const portraitUrl = assetUrl(scriptId, myChar?.avatar);
  const players = view?.players ?? [];
  const readyCount = players.filter((p) => p.ready).length;
  const totalPlayers = players.length;
  const waitingPlayers = players.filter((p) => !p.ready).map((p) => p.nickname);
  const openingStory = self?.privateScript || self?.storyUnlocked[0] || '';
  const memoryFragments = self?.storyUnlocked.filter((text) => text && text !== openingStory) ?? [];

  const excerpt = useExcerptSelection({
    selector: '.narrative-text, .narrative-framing, .briefing-profile, .briefing-name, .briefing-story-card, .briefing-obj-text, .briefing-rel-text',
    resolveSource: (el) => {
      if (el.closest('.briefing-story-card')) return '角色记忆';
      if (el.closest('.briefing-obj-text')) return '目标';
      if (el.closest('.briefing-rel-text')) return '关系';
      if (el.closest('.briefing-profile, .briefing-name')) return '你的身份';
      if (el.closest('.narrative-text, .narrative-framing')) return phase?.title ?? '剧情';
      return phase?.title ?? '剧本';
    },
  });

  const [portraitKey, setPortraitKey] = useState(0);
  useEffect(() => {
    setPortraitKey((k) => k + 1);
  }, [myChar?.id]);

  const story = useTypewriter(openingStory, { speed: 24, startDelay: 350 });

  const unlockedStoryKey = phase?.unlockedStoryKey;
  const sharedFraming = phase?.narrativeText;

  const personalizedNarrative = unlockedStoryKey
    ? (self?.storyUnlocked?.[self.storyUnlocked.length - 1] ?? '')
    : '';

  const framing = useTypewriter(sharedFraming ?? '', {
    speed: 28, startDelay: 200, enabled: !!sharedFraming && !unlockedStoryKey,
  });
  const personal = useTypewriter(personalizedNarrative, {
    speed: 26, startDelay: sharedFraming ? 600 : 300, enabled: !!unlockedStoryKey,
  });

  const isNarrativeMode = !!(unlockedStoryKey || sharedFraming);
  const [activeTab, setActiveTab] = useState<BriefingTab>('identity');

  // ★ 叙事模式 UI (p_social / p_afternoon 等有 narrativeText 的阶段)
  if (isNarrativeMode) {
    return (
      <div className="briefing-stage" onMouseUp={excerpt.onMouseUp}>
        <PhaseStatus />
        <div className="briefing-card">
          <div className="narrative-scene">
            <div className="briefing-script-head">
              <div>
                <div className="section-label">剧情推进</div>
                <h2>{phase?.title ?? '剧情'}</h2>
              </div>
              {unlockedStoryKey && <span>仅你可见</span>}
            </div>

            {sharedFraming && !unlockedStoryKey && (
              <div className="narrative-body">
                <p className="narrative-text">
                  {framing.displayed || '\u00A0'}
                  <span className="briefing-caret">{!framing.done ? '▍' : ''}</span>
                </p>
              </div>
            )}

            {unlockedStoryKey && (
              <div className="narrative-body narrative-body-personal">
                {sharedFraming && (
                  <p className="narrative-framing">{sharedFraming}</p>
                )}
                <p className="narrative-text">
                  {personal.displayed || '\u00A0'}
                  <span className="briefing-caret">{!personal.done ? '▍' : ''}</span>
                </p>
              </div>
            )}

            {!(unlockedStoryKey ? personal.done : framing.done) && (
              <div className="briefing-actions">
                <button
                  onClick={() => unlockedStoryKey ? personal.skip() : framing.skip()}
                  className="btn btn-ghost briefing-skip-btn"
                >
                  跳过 ▸▸
                </button>
              </div>
            )}

            {(unlockedStoryKey ? personal.done : framing.done) && (
              <div className="briefing-actions">
                {view?.pendingAdvance ? (
                  <p className="briefing-instruction" style={{ color: 'var(--accent)' }}>
                    条件已满足，请使用顶部「推进下一阶段」按钮继续。
                  </p>
                ) : (
                  <>
                    <button
                      onClick={() => send({ kind: 'ready' })}
                      disabled={isReady}
                      className="btn btn-primary btn-lg briefing-ready-btn"
                    >
                      {isReady ? '已就绪 · 等待其他玩家' : '继续'}
                    </button>
                    {waitingPlayers.length > 0 && (
                      <div className="briefing-waiting">
                        等待: {waitingPlayers.join('、')}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {excerpt.toolbar}
      </div>
    );
  }

  // ★ Tab 模式 UI (p_opening 等无 narrativeText 的阶段)
  const privateRels = self?.relationships?.filter(r => !r.isPublic) ?? [];

  const tabs: { key: BriefingTab; label: string; count?: number }[] = [
    { key: 'identity', label: '身份' },
    { key: 'script', label: '剧本' },
    { key: 'objectives', label: '目标', count: self?.objectives.length || undefined },
  ];

  return (
    <div className="briefing-stage" onMouseUp={excerpt.onMouseUp}>
      <PhaseStatus />
      <div className="briefing-card briefing-tabbed">
        {/* Tab bar */}
        <div className="briefing-tabs">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`briefing-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              <span className="briefing-tab-label">{t.label}</span>
              {t.count != null && <span className="briefing-tab-badge">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="briefing-tab-content">
          {/* 身份 tab */}
          {activeTab === 'identity' && (
            <div className="briefing-tab-pane">
              <div className="briefing-portrait" key={portraitKey}>
                {portraitUrl ? (
                  <img src={portraitUrl} alt={myChar?.name ?? ''} className="briefing-portrait-img" loading="lazy" decoding="async" />
                ) : (
                  <div className="briefing-portrait-fallback">{myChar?.name?.charAt(0) ?? '?'}</div>
                )}
                <div className="briefing-id">
                  <div className="badge badge-accent briefing-id-badge">你的身份</div>
                  <div className="briefing-name">{myChar?.name ?? '未分配'}</div>
                  <p className="briefing-profile">{myChar?.publicProfile}</p>
                </div>
              </div>
              {/* 公开关系 */}
              {self?.relationships && self.relationships.filter(r => r.isPublic).length > 0 && (
                <div className="briefing-section">
                  <h2>公开关系</h2>
                  <ul className="briefing-objectives">
                    {self.relationships.filter(r => r.isPublic).map((r, i) => {
                      const targetName = view?.publicCharacters.find(c => c.id === r.targetCharId)?.name ?? r.targetCharId;
                      return (
                        <li key={i} className="obj-side">
                          <span className="obj-icon">公</span>
                          <div>
                            <div className="briefing-obj-label">与 {targetName}</div>
                            <div className="briefing-obj-text briefing-rel-text">{r.relation}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {/* 暗线关系 */}
              {privateRels.length > 0 && (
                <div className="briefing-section briefing-section--secret">
                  <h2>暗线关系</h2>
                  <p className="briefing-section-sub">以下关系只有你和对方知道，其他玩家无从得知。</p>
                  <ul className="briefing-objectives">
                    {privateRels.map((r, i) => {
                      const targetName = view?.publicCharacters.find(c => c.id === r.targetCharId)?.name ?? r.targetCharId;
                      return (
                        <li key={i} className="obj-side">
                          <span className="obj-icon">隐</span>
                          <div>
                            <div className="briefing-obj-label">
                              {targetName}
                            </div>
                            <div className="briefing-obj-text briefing-rel-text">{r.relation}</div>
                            {r.sharedSecret && (
                              <div className="briefing-obj-text briefing-rel-text" style={{ color: 'var(--accent)', fontStyle: 'italic', fontSize: '13px' }}>
                                「{r.sharedSecret}」
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 剧本 tab */}
          {activeTab === 'script' && (
            <div className="briefing-tab-pane">
              {self && (
                <section className="briefing-script">
                  <div className="briefing-script-head">
                    <div>
                      <div className="section-label">开场发本</div>
                      <h2>你的角色视角</h2>
                    </div>
                    <span>仅你可见</span>
                  </div>
                  {openingStory ? (
                    <div className="briefing-story-card primary">
                      <div className="briefing-story-index">01</div>
                      <div>
                        <h3>案发前夜</h3>
                        <div className="briefing-story-body">
                          {renderStoryText(story.displayed || '')}
                          {!story.done && <span className="briefing-caret">▍</span>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state compact">故事尚未展开,等待序幕拉开</div>
                  )}
                  {openingStory && !story.done && (
                    <div className="briefing-actions" style={{ marginTop: 12 }}>
                      <button
                        onClick={() => story.skip()}
                        className="btn btn-ghost briefing-skip-btn"
                      >
                        快进 ▸▸
                      </button>
                    </div>
                  )}
                  {memoryFragments.length > 0 && (
                    <div className="briefing-memory-list">
                      {memoryFragments.map((text, i) => (
                        <div key={i} className="briefing-story-card">
                          <div className="briefing-story-index">{String(i + 2).padStart(2, '0')}</div>
                          <div>
                            <h3>后续记忆</h3>
                            <div className="briefing-story-body">
                              {renderStoryText(text)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* 目标 tab */}
          {activeTab === 'objectives' && (
            <div className="briefing-tab-pane">
              {self && self.objectives.length > 0 ? (
                <div className="briefing-section">
                  <h2>你的目标</h2>
                  <ul className="briefing-objectives">
                    {self.objectives.map((o) => (
                      <li key={o.id} className={`obj-${o.kind}`}>
                        <span className="obj-icon">{o.kind === 'main' ? '主' : o.kind === 'hidden' ? '隐' : '支'}</span>
                        <div>
                          <div className="briefing-obj-label">
                            {o.kind === 'main' ? '主线目标' : o.kind === 'hidden' ? '隐藏目标' : '支线目标'}
                          </div>
                          <div className="briefing-obj-text">{o.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="empty-state compact">暂无目标。</div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作区 */}
        <div className="briefing-actions">
          <div className={`briefing-ready-strip${readyCount === totalPlayers && totalPlayers > 0 ? ' ready' : ''}`}>
            <span>准备进度</span>
            <strong>{readyCount}/{totalPlayers || '?'}</strong>
          </div>
          {view?.pendingAdvance ? (
            <p className="briefing-instruction" style={{ color: 'var(--accent)' }}>
              条件已满足，请使用顶部「推进下一阶段」按钮继续。
            </p>
          ) : (
            <>
              <button onClick={() => send({ kind: 'ready' })} disabled={isReady} className="btn btn-primary btn-lg briefing-ready-btn">
                {isReady ? '已就绪 · 等待其他玩家' : '我准备好了'}
              </button>
              {waitingPlayers.length > 0 && (
                <div className="briefing-waiting">
                  等待:{waitingPlayers.join('、')}
                </div>
              )}
            </>
          )}
          {phase?.instruction && (
            <p className="briefing-instruction">{phase.instruction}</p>
          )}
        </div>
      </div>
      {excerpt.toolbar}
    </div>
  );
}
