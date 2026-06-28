import type { ClientIntent } from "@mmg/schema";
import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../../lib/asset.js';
import { pushToast } from '../../lib/toast.js';
import { SEARCH_COOLDOWN_MS } from '../../lib/limits.js';
import { SearchClueRow } from './shared.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import type { ClientStateView } from '@mmg/schema';

interface SearchTabProps {
  view: ClientStateView;
  myCharId: string | undefined;
  scriptId: string | undefined;
  canSearch: boolean;
  send: (intent: ClientIntent) => void;
  onLightbox: (lb: { src: string; caption?: string }) => void;
}

export function SearchTab({ view, myCharId, scriptId, canSearch, send, onLightbox }: SearchTabProps) {
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [searchCooldown, setSearchCooldown] = useState<number>(0);
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [foundId, setFoundId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; title: string } | null>(null);

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

  // 监听 search_clue event:触发成功动画
  const lastSeenSearchId = useRef<number>(-1);
  useEffect(() => {
    const recent = view.log?.filter((e) => e.type === 'search_clue').slice(-3) ?? [];
    for (const e of recent) {
      if (e.ts > lastSeenSearchId.current && e.actorCharId === myCharId) {
        lastSeenSearchId.current = e.ts;
        const title = (e.payload as Record<string, string>)?.clueTitle ?? '线索';
        const clueId = (e.payload as Record<string, string>)?.clueId;
        setSearchingId(null);
        if (clueId) {
          setFoundId(clueId);
          setTimeout(() => setFoundId(null), 1800);
        }
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
    setConfirmTarget({ id: clueId, title });
  };

  const executeSearch = () => {
    if (!confirmTarget) return;
    send({ kind: 'searchClue', clueId: confirmTarget.id });
    setSearchCooldown(SEARCH_COOLDOWN_MS);
    setSearchingId(confirmTarget.id);
    pushToast(`正在搜索:${confirmTarget.title}`, 'info', 1200);
    setConfirmTarget(null);
  };

  // 搜证轮次信息
  const currentRound = (view.currentPhase?.round ?? 0) + 1;
  const maxRounds = view.currentPhase?.maxRounds;
  const searchedThisRound = view.self?.searchedThisRound;

  return (
    <div className="search-layout">
      {/* 轮次指示器 */}
      {maxRounds != null && maxRounds > 0 && (
        <div className="search-round-indicator">
          <span className="round-label">🔍 第 {currentRound}/{maxRounds} 轮</span>
          <span className={`search-status ${searchedThisRound ? 'done' : 'pending'}`}>
            {searchedThisRound ? '✓ 本轮已搜' : '● 本轮未搜'}
          </span>
        </div>
      )}

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
            canSearch={canSearch && !searchedThisRound}
            cooldown={searchCooldown}
            searching={searchingId === cl.id}
            found={foundId === cl.id}
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
                canSearch={canSearch && !searchedThisRound}
                cooldown={searchCooldown}
                searching={searchingId === cl.id}
                found={foundId === cl.id}
              />
            ))}
          </>
        )}
      </div>
      {selectedSceneClues.length === 0 && unscenedClues.length === 0 && selectedScene ? (
        <div className="empty-state compact">该地点暂无更多线索可搜</div>
      ) : (!view.searchableClues || view.searchableClues.length === 0) && !selectedScene ? (
        <div className="empty-state compact">此处已无可搜寻之物,换个地方看看</div>
      ) : null}

      {/* 搜证确认弹窗 */}
      <ConfirmDialog
        open={!!confirmTarget}
        title="确认搜索线索"
        message={confirmTarget ? `搜索「${confirmTarget.title}」？\n搜索后本轮其他线索将不可再搜。` : ''}
        confirmLabel="搜索"
        cancelLabel="取消"
        onConfirm={executeSearch}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
