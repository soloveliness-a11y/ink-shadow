import { useEffect, useState } from 'react';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { PhaseStatus } from '../components/PhaseStatus.js';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { useExcerptSelection } from '../hooks/useExcerptSelection.js';

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

  // 选区摘录(叙事文本 / 身份 / 开场故事 / 目标均可直接摘录到「我的剧本」)
  const excerpt = useExcerptSelection({
    selector: '.narrative-text, .narrative-framing, .briefing-profile, .briefing-name, .briefing-story-card, .briefing-obj-text',
    resolveSource: (el) => {
      if (el.closest('.briefing-story-card')) return '角色记忆';
      if (el.closest('.briefing-obj-text')) return '目标';
      if (el.closest('.briefing-profile, .briefing-name')) return '你的身份';
      if (el.closest('.narrative-text, .narrative-framing')) return phase?.title ?? '剧情';
      return phase?.title ?? '剧本';
    },
  });

  // 立绘入场动画(刷新时重放)
  const [portraitKey, setPortraitKey] = useState(0);
  useEffect(() => {
    setPortraitKey((k) => k + 1);
  }, [myChar?.id]);

  // 开篇故事打字机(只有 1 段)
  const story = useTypewriter(openingStory, { speed: 24, startDelay: 350 });

  // ★ 叙事模式检测：phase 有 unlockedStoryKey → 角色差异化叙事
  //    或 phase 有 narrativeText（兼容旧模式：共享叙事文本）
  const unlockedStoryKey = phase?.unlockedStoryKey;
  const sharedFraming = phase?.narrativeText;

  // 角色个性化叙事内容：storyUnlocked 中最近解锁的那一段
  // storyUnlocked 按 phase 顺序追加，最后一项即为当前阶段解锁的内容
  const personalizedNarrative = unlockedStoryKey
    ? (self?.storyUnlocked?.[self.storyUnlocked.length - 1] ?? '')
    : '';

  // 打字机分别处理共享框架和个性化内容
  const framing = useTypewriter(sharedFraming ?? '', {
    speed: 28, startDelay: 200, enabled: !!sharedFraming && !unlockedStoryKey,
  });
  const personal = useTypewriter(personalizedNarrative, {
    speed: 26, startDelay: sharedFraming ? 600 : 300, enabled: !!unlockedStoryKey,
  });

  // 判断是否处于叙事模式
  const isNarrativeMode = !!(unlockedStoryKey || (sharedFraming && !unlockedStoryKey));

  // ★ 叙事模式 UI
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

            {/* 共享框架（简短，如果存在且非个性化模式） */}
            {sharedFraming && !unlockedStoryKey && (
              <div className="narrative-body">
                <p className="narrative-text">
                  {framing.displayed || '\u00A0'}
                  <span className="briefing-caret">{!framing.done ? '▍' : ''}</span>
                </p>
              </div>
            )}

            {/* 角色个性化叙事 */}
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

            {/* 打字机跳过按钮 */}
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

            {/* 继续按钮：个性化模式等打字机完成；共享模式也等打字机完成 */}
            {(unlockedStoryKey ? personal.done : framing.done) && (
              <div className="briefing-actions">
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
              </div>
            )}
          </div>
        </div>
        {excerpt.toolbar}
      </div>
    );
  }

  return (
    <div className="briefing-stage" onMouseUp={excerpt.onMouseUp}>
      <PhaseStatus />
      <div className="briefing-card">
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
            <div className="briefing-ready-strip">
              <span>准备进度</span>
              <strong>{readyCount}/{totalPlayers || '?'}</strong>
            </div>
          </div>
        </div>

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
                  <p>{story.displayed || '\u00A0'}<span className="briefing-caret">{!story.done ? '▍' : ''}</span></p>
                </div>
              </div>
            ) : (
              <div className="empty-state compact">当前剧本没有写入你的开场故事。</div>
            )}
            {memoryFragments.length > 0 && (
              <div className="briefing-memory-list">
                {memoryFragments.map((text, i) => (
                  <div key={i} className="briefing-story-card">
                    <div className="briefing-story-index">{String(i + 2).padStart(2, '0')}</div>
                    <div>
                      <h3>后续记忆</h3>
                      {text.split(/\n\n+/).map((para, pi) => (
                        <p key={pi}>{para}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {self && self.objectives.length > 0 && (
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
        )}

        {/* 私有关系：仅玩家自己可见 */}
        {self?.relationships && self.relationships.filter(r => !r.isPublic).length > 0 && (
          <div className="briefing-section">
            <h2>暗线关系</h2>
            <p className="briefing-section-sub">以下关系只有你和对方知道，其他玩家无从得知。</p>
            <ul className="briefing-objectives">
              {self.relationships.filter(r => !r.isPublic).map((r, i) => {
                const targetName = view?.publicCharacters.find(c => c.id === r.targetCharId)?.name ?? r.targetCharId;
                return (
                  <li key={i} className="obj-side">
                    <span className="obj-icon">隐</span>
                    <div>
                      <div className="briefing-obj-label">
                        与 {targetName}：{r.relation}
                      </div>
                      {r.sharedSecret && (
                        <div className="briefing-obj-text" style={{ color: 'var(--accent)', fontStyle: 'italic', fontSize: '13px' }}>
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

        <div className="briefing-actions">
          <button onClick={() => send({ kind: 'ready' })} disabled={isReady} className="btn btn-primary btn-lg briefing-ready-btn">
            {isReady ? '已就绪 · 等待其他玩家' : '我准备好了'}
          </button>
          {waitingPlayers.length > 0 && (
            <div className="briefing-waiting">
              等待:{waitingPlayers.join('、')}
            </div>
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
