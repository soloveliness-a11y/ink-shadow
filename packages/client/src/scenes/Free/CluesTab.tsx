import { useState } from 'react';
import { assetUrl } from '../../lib/asset.js';
import { pushToast } from '../../lib/toast.js';
import { ClueCard, RevealClueButton } from './shared.js';
import type { ClientStateView, Clue, PublicCharacter } from '@mmg/schema';

interface CluesTabProps {
  view: ClientStateView;
  myCharId: string | undefined;
  scriptId: string | undefined;
  allowed: Set<string>;
  send: (intent: any) => void;
  onLightbox: (lb: { src: string; caption?: string }) => void;
}

export function CluesTab({ view, myCharId, scriptId, allowed, send, onLightbox }: CluesTabProps) {
  const [clueSceneId, setClueSceneId] = useState<string | null>(null);

  const revealedIds = new Set(view?.revealedClues?.map((cl) => cl.id) ?? []);

  // Merge my clues + revealed clues (deduplicated)
  const allMyClues = (() => {
    const seen = new Map<string, Clue>();
    for (const cl of view?.self?.myClues ?? []) seen.set(cl.id, cl);
    for (const cl of view?.revealedClues ?? []) seen.set(cl.id, cl);
    return [...seen.values()];
  })();

  const scenes = view.publicScenes ?? [];
  const sceneNameOf = (sceneId?: string) => scenes.find((s) => s.id === sceneId)?.name ?? '无场景';
  const sceneGroupsOf = (clues: { sceneId?: string }[]) => {
    const seen = new Map<string, string>();
    for (const cl of clues) {
      const sid = cl.sceneId ?? '__none__';
      if (!seen.has(sid)) seen.set(sid, sceneNameOf(cl.sceneId));
    }
    return [...seen.entries()];
  };

  const clueScenes = sceneGroupsOf(allMyClues);
  const selectedClueSceneId = clueSceneId ?? clueScenes[0]?.[0] ?? null;

  return (
    <div className="search-layout">
      {clueScenes.length > 0 && (
        <div className="scene-list">
          {clueScenes.map(([sid, name]) => {
            const count = allMyClues.filter((cl) => (cl.sceneId ?? '__none__') === sid).length;
            const active = selectedClueSceneId === sid;
            return (
              <button key={sid} className={`scene-chip${active ? ' active' : ''}`} onClick={() => setClueSceneId(sid)}>
                <span>
                  <strong>{name}</strong>
                  <small>{count} 条线索</small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedClueSceneId && (() => {
        const sceneClues = allMyClues.filter((cl) => (cl.sceneId ?? '__none__') === selectedClueSceneId);
        const revealed = sceneClues.filter((cl) => view?.revealedClues?.some((r) => r.id === cl.id));
        const hidden = sceneClues.filter((cl) => !revealed.some((r) => r.id === cl.id));

        return (
          <div key={selectedClueSceneId} className="search-clue-list">
            {hidden.length > 0 && (
              <>
                <div className="section-label">我的线索</div>
                {hidden.map((cl) => {
                  const cu = assetUrl(scriptId, cl.visual?.asset?.path);
                  return (
                    <ClueCard
                      key={cl.id}
                      title={cl.title}
                      content={cl.content}
                      image={cu}
                      badge={<span className="badge badge-teal">仅你持有</span>}
                      isSecret={cl.id.startsWith('sc_')}
                      action={allowed.has('revealClue') ? <RevealClueButton title={cl.title} onConfirm={() => { send({ kind: 'revealClue', clueId: cl.id }); pushToast('已公开线索', 'success', 1800); }} /> : undefined}
                      onImage={() => cu && onLightbox({ src: cu, caption: cl.title })}
                    />
                  );
                })}
              </>
            )}
            {revealed.length > 0 && (
              <>
                <div className="section-label section-label-spaced">已公开线索</div>
                {revealed.map((cl) => {
                  const cu = assetUrl(scriptId, cl.visual?.asset?.path);
                  return (
                    <ClueCard
                      key={cl.id}
                      title={cl.title}
                      content={cl.content}
                      image={cu}
                      badge={<span className="badge badge-sage">已公开</span>}
                      isSecret={cl.id.startsWith('sc_')}
                      onImage={() => cu && onLightbox({ src: cu, caption: cl.title })}
                    />
                  );
                })}
              </>
            )}
            {sceneClues.length === 0 && (
              <div className="empty-state compact">该场景暂无线索</div>
            )}
          </div>
        );
      })()}
      {clueScenes.length === 0 && <div className="empty-state compact">线索尚在迷雾中,去现场搜寻吧</div>}
    </div>
  );
}
