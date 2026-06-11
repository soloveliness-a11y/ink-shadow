import { useGameStore } from '../store/game.js';
import { Portrait } from '../components/Visual.js';

export function AssigningScene() {
  const view = useGameStore((s) => s.view);
  const send = useGameStore((s) => s.send);
  const playerId = useGameStore((s) => s.playerId);
  const myCharId = view?.players.find((p) => p.playerId === playerId)?.charId;
  const scriptId = view?.selectedScript?.id;

  const allChars = view?.publicCharacters ?? [];
  const players = view?.players ?? [];
  const takenIds = new Set(
    players.map((p) => p.charId).filter(Boolean) as string[],
  );

  const available = allChars.filter(
    (c) => !c.id.startsWith('c_victim') && !takenIds.has(c.id),
  );
  const myChar = allChars.find((c) => c.id === myCharId);
  const playableCount = allChars.filter((c) => !c.id.startsWith('c_victim')).length;
  const assignedCount = players.filter((p) => p.charId).length;
  const waitingPlayers = players.filter((p) => !p.charId).map((p) => p.nickname);
  const progressPct = playableCount > 0 ? Math.min(100, Math.round((assignedCount / playableCount) * 100)) : 0;

  return (
    <div className="assigning-stage">
      <div className="assigning-header">
        <div className="assigning-eyebrow">第 壹 幕</div>
        <h1 className="assigning-title">择角入戏</h1>
        <p className="assigning-sub">从画像之中选择你将扮演的角色。一旦选定,故事将围绕你展开。</p>
        <div className="assigning-content">
          <div className="assigning-progress">
            <div className="assigning-progress-meta">
              <span>选角进度</span>
              <strong>{assignedCount}/{playableCount || '?'}</strong>
            </div>
            <div className="assigning-progress-track" aria-hidden>
              <div style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {myChar ? (
        <div className="assigning-confirmed">
          <div className="badge badge-sage assigning-confirmed-badge">
            ✓ 已确认 · {myChar.name}
          </div>
          <p className="assigning-waiting">
            {waitingPlayers.length > 0
              ? `等待 ${waitingPlayers.join('、')} 完成选角…`
              : '全员选角完成,即将进入身份确认。'}
          </p>
        </div>
      ) : (
        <div className="assigning-content">
          <div className="assigning-choice-note">
            请选择一个未被占用的角色。画像、公开身份与可疑关系会在后续阶段持续显示。
          </div>
          <div className="assign-grid">
            {available?.map((c) => {
              const taken = takenIds.has(c.id);
              return (
                <Portrait
                  key={c.id}
                  name={c.name}
                  subtitle={c.publicProfile.slice(0, 40)}
                  path={c.avatar}
                  scriptId={scriptId}
                  taken={taken}
                  onClick={() => !taken && send({ kind: 'selectChar', charId: c.id })}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
