import { useState } from 'react';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';

function getNotes(scriptId: string, playerId: string, charId: string): string {
  try { return localStorage.getItem(`notes:${scriptId}:${playerId}:${charId}`) ?? ''; }
  catch { return ''; }
}
function setNotes(scriptId: string, playerId: string, charId: string, text: string): void {
  try { localStorage.setItem(`notes:${scriptId}:${playerId}:${charId}`, text); } catch {}
}

export function CharacterSidebar() {
  const view = useGameStore((s) => s.view);
  const playerId = useGameStore((s) => s.playerId);
  const send = useGameStore((s) => s.send);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const isTestMode = view?.isTestMode;
  const pendingAdvance = view?.pendingAdvance;

  const chars = view?.publicCharacters ?? [];
  const players = chars.filter(c => !c.isVictim);
  const npcs = chars.filter(c => c.isVictim);
  const scriptId = view?.selectedScript?.id ?? '';

  const startEdit = (charId: string) => {
    setEditingId(charId);
    setNoteText(getNotes(scriptId, playerId ?? '', charId));
  };
  const saveNote = (charId: string) => {
    setNotes(scriptId, playerId ?? '', charId, noteText);
    setEditingId(null);
  };

  return (
    <aside className={`sidebar suspect-board${boardOpen ? ' expanded' : ''}`}>
      <button
        className="board-mobile-handle"
        onClick={() => setBoardOpen(!boardOpen)}
        aria-expanded={boardOpen}
      >
        <span>嫌疑人画像板</span>
        <strong>{players.length + npcs.length}</strong>
      </button>

      <div className="board-header">
        <span className="section-label">嫌疑人画像板</span>
        <span className="board-count">{players.length + npcs.length}</span>
      </div>

      <div className="board-list">
        {players.map(c => {
          const note = getNotes(scriptId, playerId ?? '', c.id);
          const owner = view?.players.find(p => p.charId === c.id);
          return (
            <CharacterCard
              key={c.id} char={c} owner={owner} note={note} scriptId={scriptId}
              expanded={expandedId === c.id}
              isEditing={editingId === c.id} noteText={noteText}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
              onEdit={() => startEdit(c.id)} onSave={() => saveNote(c.id)}
              onCancel={() => setEditingId(null)} onTextChange={setNoteText}
            />
          );
        })}
        {npcs.length > 0 && (
          <>
            <div className="board-section-divider">NPC · 与本案相关</div>
            {npcs.map(c => (
              <CharacterCard
                key={c.id} char={c}
                owner={undefined}
                note={getNotes(scriptId, playerId ?? '', c.id)}
                scriptId={scriptId}
                expanded={expandedId === c.id}
                isEditing={editingId === c.id} noteText={noteText}
                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                onEdit={() => startEdit(c.id)} onSave={() => saveNote(c.id)}
                onCancel={() => setEditingId(null)} onTextChange={setNoteText}
              />
            ))}
          </>
        )}
      </div>

      {isTestMode && (
        <div className="test-controls">
          <div className="section-label">测试控制</div>
          {view?.phaseHistory && view.phaseHistory.length > 0 && (
            <p className="test-progress">
              已过: {view.phaseHistory.join(' → ')}
            </p>
          )}
          <button
            onClick={() => send({ kind: 'manualAdvance' })}
            disabled={!pendingAdvance}
            className="btn btn-primary btn-sm btn-block test-advance-btn"
          >
            {pendingAdvance ? '推进到下一阶段' : '等待操作完成...'}
          </button>
          <button
            onClick={() => send({ kind: 'rollbackPhase' })}
            className="btn btn-secondary btn-sm btn-block"
          >
            回退到上一阶段
          </button>
        </div>
      )}
    </aside>
  );
}

function CharacterCard({ char, owner, note, scriptId, expanded, isEditing, noteText, onToggle, onEdit, onSave, onCancel, onTextChange }: {
  char: {
    id: string;
    name: string;
    gender?: string;
    publicProfile: string;
    isVictim?: boolean;
    avatar?: string;
    publicTimeline?: Array<{ time: string; location: string; action: string }>;
    publicRelations?: Array<{ targetCharId: string; relation: string }>;
  };
  owner?: { nickname: string; connected: boolean; isHost: boolean };
  note: string;
  scriptId?: string;
  expanded: boolean;
  isEditing: boolean;
  noteText: string;
  onToggle: () => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onTextChange: (t: string) => void;
}) {
  const url = assetUrl(scriptId, char.avatar);
  const timeline = char.publicTimeline ?? [];
  const relations = char.publicRelations ?? [];
  return (
    <div className={`board-card${expanded ? ' expanded' : ''}`}>
      <div className="board-card-head" role="button" tabIndex={0} onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        aria-expanded={expanded}
        aria-label={`${char.name}${expanded ? ' 收起' : ' 展开'}`}>
        {url ? (
          <img src={url} alt={char.name} className="board-thumb" loading="lazy" decoding="async" />
        ) : (
          <div className="board-thumb board-thumb-fallback">{char.name.charAt(0)}</div>
        )}
        <div className="board-card-info">
          <div className="board-card-name">
            {char.name}
            {owner && <span className={`mini-dot${owner.connected ? ' online' : ''}`} />}
          </div>
          <div className="board-card-sub">
            {owner?.nickname ?? (char.isVictim ? '本案死者' : char.publicProfile)}
          </div>
        </div>
        <span className="board-card-toggle">{expanded ? '收' : '展'}</span>
      </div>

      {expanded && (
        <div className="board-card-body">
          <p className="board-profile">{char.publicProfile}</p>
          <div className="board-tags">
            {owner?.isHost && <span className="badge badge-accent">房主</span>}
            {owner && <span className={`badge ${owner.connected ? 'badge-sage' : 'badge-muted'}`}>{owner.connected ? '在线' : '离线'}</span>}
            {char.isVictim && <span className="badge badge-crimson">死者</span>}
          </div>

          {relations.length > 0 && (
            <div className="board-relations">
              <div className="board-subhead">公开关系</div>
              <div className="board-relation-list">
                {relations.map((r, i) => (
                  <span key={i} className="board-relation-chip">
                    <span className="board-relation-tag">{r.relation}</span>
                    <RelationName charId={r.targetCharId} />
                  </span>
                ))}
              </div>
            </div>
          )}

          {timeline.length > 0 && (
            <div className="board-timeline">
              <div className="board-subhead">公开行踪</div>
              <ol className="board-timeline-list">
                {timeline.map((t, i) => (
                  <li key={i} className="board-timeline-item">
                    <span className="board-timeline-time">{t.time}</span>
                    <span className="board-timeline-body">
                      <span className="board-timeline-loc">{t.location}</span>
                      <span className="board-timeline-action">{t.action}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {isEditing ? (
            <div className="board-note-edit">
              <textarea
                className="input" value={noteText}
                onChange={(e) => onTextChange(e.target.value)}
                placeholder="怀疑点、时间线、可疑发言…"
                autoFocus
              />
              <div className="board-note-actions">
                <button onClick={onSave} className="btn btn-primary btn-sm">保存</button>
                <button onClick={onCancel} className="btn btn-secondary btn-sm">取消</button>
              </div>
            </div>
          ) : (
            <div className="board-note-display" role="button" tabIndex={0} onClick={onEdit}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } }}
              aria-label="编辑推理笔记">
              {note ? (
                <p className="board-note-text">{note}</p>
              ) : (
                <p className="board-note-placeholder">+ 添加推理笔记</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RelationName({ charId }: { charId: string }) {
  const name = useGameStore((s) => s.view?.publicCharacters.find((c) => c.id === charId)?.name ?? charId);
  return <span className="board-relation-name">{name}</span>;
}
