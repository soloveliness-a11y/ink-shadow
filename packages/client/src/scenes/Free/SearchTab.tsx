import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../../lib/asset.js';
import { pushToast } from '../../lib/toast.js';
import { SEARCH_COOLDOWN_MS } from '../../lib/limits.js';
import { SearchClueRow } from './shared.js';
import type { ClientStateView } from '@mmg/schema';

interface SearchTabProps {
  view: ClientStateView;
  myCharId: string | undefined;
  scriptId: string | undefined;
  canSearch: boolean;
  send: (intent: any) => void;
  onLightbox: (lb: { src: string; caption?: string }) => void;
}

export function SearchTab({ view, myCharId, scriptId, canSearch, send, onLightbox }: SearchTabProps) {
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [searchCooldown, setSearchCooldown] = useState<number>(0);

  const scenes = view.publicScenes ?? [];
  const selectedSceneId = sceneId ?? scenes[0]?.id ?? null;
  const selectedScene = scenes.find((s) => s.id === selectedSceneId);
  const selectedSceneClues = view.searchableClues?.filter((cl) => cl.sceneId === selectedSceneId) ?? [];
  const unscenedClues = view.searchableClues?.filter((cl) => !cl.sceneId) ?? [];

  // 搜证冷却 timer
  useEffect(() => {
    if (searchCooldown <= 0) return;
    const t = window.setTimeout(() => setSearchCooldown((c) => Math.max(0, c - 100)), 100);
    return () => window.clearTimeout(t);
  }, [searchCooldown]);

  // 监听 search_clue event 触发 toast
  const lastSeenSearchId = useRef<number>(-1);
  useEffect(() => {
    const recent = view.log?.filter((e) => e.type === 'search_clue').slice(-3) ?? [];
    for (const e of recent) {
      if (e.ts > lastSeenSearchId.current && e.actorCharId === myCharId) {
        lastSeenSearchId.current = e.ts;
        const title = (e.payload as Record<string, string>)?.clueTitle ?? '线索';
        pushToast(`获得了线索:${title}`, 'success', 2200);
        break;
      }
    }
  }, [view.log, myCharId]);

  const doSearchClue = (clueId: string, title: string) => {
    if (searchCooldown > 0) {
      pushToast('操作太快,稍候再试', 'warn', 1400);
      return;
    }
    send({ kind: 'searchClue', clueId });
    setSearchCooldown(SEARCH_COOLDOWN_MS);
    pushToast(`正在搜索:${title}`, 'info', 1200);
  };

  return (
    <div className="search-layout">
      {scenes.length > 0 && (
        <div className="scene-list">
          {scenes.map((sc) => {
            const img = assetUrl(scriptId, sc.image);
            const clueCount = view.searchableClues?.filter((cl) => cl.sceneId === sc.id).length ?? 0;
            const progress = view.sceneSearchProgress?.[sc.id];
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
                if (src) onLightbox({ src, caption: selectedScene.name });
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
            canSearch={canSearch}
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
                canSearch={canSearch}
                cooldown={searchCooldown}
              />
            ))}
          </>
        )}
      </div>
      {selectedSceneClues.length === 0 && unscenedClues.length === 0 && selectedScene ? (
        <div className="empty-state compact">该地点暂无更多线索可搜</div>
      ) : (!view.searchableClues || view.searchableClues.length === 0) && !selectedScene ? (
        <div className="empty-state compact">当前没有可搜索的线索</div>
      ) : null}
    </div>
  );
}
