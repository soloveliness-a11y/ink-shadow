import { useState } from 'react';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';

export function LobbyScene() {
  const joinRoom = useGameStore((s) => s.joinRoom);
  const connect = useGameStore((s) => s.connect);
  const conn = useGameStore((s) => s.conn);
  const view = useGameStore((s) => s.view);
  const playerId = useGameStore((s) => s.playerId);
  const send = useGameStore((s) => s.send);
  const savedNickname = useGameStore((s) => s.nickname);
  const savedRoomCode = useGameStore((s) => s.roomCode);
  const [nickname, setNickname] = useState(savedNickname ?? '');
  const [roomCode, setRoomCode] = useState(
    savedRoomCode === 'NEW' ? '' : savedRoomCode ?? '',
  );
  const [copied, setCopied] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; name: string } | null>(null);

  const joined = view && playerId;

  // ============= 已加入:房间大厅 =============
  if (joined) {
    const players = view.players || [];
    const me = players.find((p) => p.playerId === playerId);
    const isHost = me?.isHost;
    const selectedScript = view.selectedScript;
    const availableScripts = view.availableScripts || [];
    const requiredPlayers = selectedScript?.playerCount?.min ?? selectedScript?.playerCount?.max ?? 0;
    const onlineCount = players.filter((p) => p.connected).length;
    const canStart = selectedScript && onlineCount === requiredPlayers;
    const canTest = !!selectedScript && isHost && onlineCount < requiredPlayers;
    const coverUrl = assetUrl(selectedScript?.id, selectedScript?.cover?.asset?.path);
    const seatPct = requiredPlayers > 0 ? Math.min(100, Math.round((onlineCount / requiredPlayers) * 100)) : 0;
    const missingSeats = Math.max(0, requiredPlayers - onlineCount);

    const copyRoomCode = () => {
      navigator.clipboard?.writeText(view.roomCode).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }).catch(() => {});
    };

    return (
      <div className="lobby-stage">
        {/* 房间号条:始终显示,未选本时也能复制邀请朋友 */}
        <div className="lobby-room-bar">
          <span className="lobby-room-label">房间号</span>
          <span className="lobby-room-code">{view.roomCode}</span>
          <button
            className={`lobby-copy${copied ? ' copied' : ''}`}
            onClick={copyRoomCode}
            title="复制房间号"
          >{copied ? '已复制' : '复制'}</button>
          <span className="lobby-room-online">{onlineCount} 人在场</span>
        </div>

        {/* Hero:剧本封面 + 标题 + 元信息 */}
        <div className="lobby-hero">
          {selectedScript ? (
            <div className="lobby-hero-art">
              {coverUrl ? (
                <img src={coverUrl} alt={selectedScript.title} className="lobby-cover" loading="lazy" decoding="async" />
              ) : (
                <div className="lobby-cover lobby-cover-fallback">
                  <span>{selectedScript.title.charAt(0)}</span>
                </div>
              )}
              <div className="lobby-cover-frame" aria-hidden />
            </div>
          ) : (
            <div className="lobby-hero-empty">
              <div className="lobby-hero-mark">墨</div>
              <div className="lobby-hero-tagline">墨影 · 剧本杀</div>
              <div className="lobby-hero-sub">等待房主选择剧本</div>
            </div>
          )}

          {selectedScript && (
            <div className="lobby-hero-info">
              <h1 className="lobby-script-title">{selectedScript.title}</h1>
              <div className="lobby-meta">
                <span className="badge badge-accent">{playerCountLabel(selectedScript.playerCount.min, selectedScript.playerCount.max)}</span>
                <span className="badge badge-muted">{difficultyLabel(selectedScript.difficulty)}</span>
                <span className="badge badge-muted">约 {selectedScript.durationMin} 分钟</span>
                {isHost && (
                  <button onClick={() => send({ kind: 'selectScript', scriptId: '' })} className="btn btn-ghost btn-xs lobby-change-script">
                    × 更换
                  </button>
                )}
              </div>
              <p className="lobby-synopsis">{selectedScript.synopsis}</p>
            </div>
          )}
        </div>

        {/* 剧本选择(房主且未选) */}
        {isHost && !selectedScript && (
          <div className="lobby-script-pick">
            <div className="section-label">选择剧本</div>
            <div className="lobby-script-list">
              {availableScripts.map((sc) => {
                const scCover = assetUrl(sc.id, sc.cover?.asset?.path);
                return (
                  <button
                    key={sc.id}
                    onClick={() => send({ kind: 'selectScript', scriptId: sc.id })}
                    className="lobby-script-card"
                  >
                    {scCover ? (
                      <img src={scCover} alt={sc.title} className="lobby-script-thumb" loading="lazy" decoding="async" />
                    ) : (
                      <div className="lobby-script-thumb lobby-script-thumb-fallback">
                        <span>{sc.title.charAt(0)}</span>
                      </div>
                    )}
                    <div className="lobby-script-meta">
                      <div className="lobby-script-name">{sc.title}</div>
                      <div className="lobby-script-sub">
                        {playerCountLabel(sc.playerCount.min, sc.playerCount.max)} · {difficultyLabel(sc.difficulty)} · 约{sc.durationMin}分钟
                      </div>
                      <p className="lobby-script-syn">{sc.synopsis}</p>
                    </div>
                  </button>
                );
              })}
              {availableScripts.length === 0 && (
                <div className="empty-state compact">暂无可用剧本</div>
              )}
            </div>
          </div>
        )}

        {/* 玩家列表:始终显示(含未选本,方便大厅集结) */}
        <div className="lobby-players">
          <div className="lobby-players-head">
            <span className="section-label">在场玩家</span>
            {selectedScript ? (
              <span className={`lobby-count${onlineCount === requiredPlayers ? ' ready' : ''}`}>
                <strong>{onlineCount}</strong>
                <span> / {requiredPlayers}</span>
              </span>
            ) : (
              <span className="lobby-count"><strong>{onlineCount}</strong><span> 人在场</span></span>
            )}
          </div>
          {selectedScript && (
            <>
              <div className="lobby-seat-progress" aria-hidden>
                <div style={{ width: `${seatPct}%` }} />
              </div>
              {missingSeats > 0 && (
                <div className="lobby-seat-hint">还差 {missingSeats} 位玩家入座</div>
              )}
            </>
          )}
          <div className="lobby-player-grid">
            {players.map((p) => (
              <div key={p.playerId} className={`lobby-player${p.connected ? '' : ' offline'}`}>
                <div className="lobby-player-avatar">
                  <span>{p.nickname.charAt(0)}</span>
                  {p.connected && <span className="online-dot" />}
                </div>
                <div className="lobby-player-name">{p.nickname}</div>
                {p.isHost && <span className="badge badge-accent">房主</span>}
                {!p.isHost && p.playerId === playerId && <span className="badge badge-muted">你</span>}
                {isHost && view.status === 'lobby' && p.playerId !== playerId && (
                  <button
                    className="lobby-kick"
                    onClick={() => setKickTarget({ id: p.playerId, name: p.nickname })}
                    title="移出房间"
                  >踢出</button>
                )}
                <ConfirmDialog
                  open={!!kickTarget}
                  title="移出玩家"
                  message={kickTarget ? `确认将「${kickTarget.name}」移出房间？` : ''}
                  confirmLabel="确认移出"
                  cancelLabel="取消"
                  onConfirm={() => { send({ kind: 'kickPlayer', targetPlayerId: kickTarget!.id }); setKickTarget(null); }}
                  onCancel={() => setKickTarget(null)}
                  tone="danger"
                />
              </div>
            ))}
            {selectedScript && Array.from({ length: Math.max(0, requiredPlayers - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="lobby-player lobby-player-empty">
                <div className="lobby-player-avatar">?</div>
                <div className="lobby-player-name">等待加入</div>
              </div>
            ))}
          </div>
        </div>

        {/* 房主控制区 */}
        {isHost && selectedScript && (
          <div className="lobby-host-controls">
            <button
              onClick={() => send({ kind: 'hostAdvance' })}
              disabled={!canStart}
              className="btn btn-primary btn-lg"
            >
              {canStart ? '启幕 · 开始游戏' : `等待玩家就位 ${onlineCount}/${requiredPlayers}`}
            </button>
            {canTest && (
              <button
                onClick={() => send({ kind: 'startTest' })}
                className="btn btn-secondary"
              >
                Bot 填充 · 快速预览
              </button>
            )}
          </div>
        )}
        {isHost && selectedScript && missingSeats > 0 && (
          <div className="lobby-wait-hint">
            还需 <strong>{missingSeats}</strong> 位玩家加入
          </div>
        )}

        {!isHost && selectedScript && (
          <p className="lobby-waiting">已就座,等待房主启幕…</p>
        )}
        {!isHost && !selectedScript && (
          <p className="lobby-waiting">等待房主选择剧本…</p>
        )}
      </div>
    );
  }

  // ============= 未加入:登录页 =============
  const handleJoin = () => {
    if (!nickname.trim()) return;
    if (!conn) connect();
    joinRoom(roomCode.trim() || 'NEW', nickname.trim());
  };

  const savedSession = savedRoomCode && savedRoomCode !== 'NEW';
  const handleRejoinLast = () => {
    if (!nickname.trim() || !savedSession) return;
    if (!conn) connect();
    joinRoom(savedRoomCode!, nickname.trim());
  };

  return (
    <div className="login-stage">
      <div className="login-hero">
        <div className="login-mark">墨</div>
        <h1 className="login-title">墨影</h1>
        <div className="login-tagline">Ink Shadow · 推理与谎言的舞台</div>
      </div>
      <div className="login-card">
        <div className="login-card-title">入场</div>
        <div className="login-card-sub">输入昵称与房间号,或开启一局新游戏</div>

        {savedSession && (
          <button
            type="button"
            className="login-rejoin"
            onClick={handleRejoinLast}
            disabled={!nickname.trim()}
            title={!nickname.trim() ? '先填写昵称' : '回到上次的房间'}
          >
            <span className="login-rejoin-dot" aria-hidden />
            <span className="login-rejoin-text">回到上次房间</span>
            <span className="login-rejoin-code">{savedRoomCode}</span>
            <span className="login-rejoin-arrow" aria-hidden>→</span>
          </button>
        )}

        <div className="login-form">
          <div>
            <label className="form-label" htmlFor="login-nickname">你的昵称</label>
            <input
              id="login-nickname"
              className="input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="如何称呼你"
              maxLength={20}
              autoFocus
            />
          </div>
          <div>
            <label className="form-label" htmlFor="login-room-code">房间号</label>
            <input
              id="login-room-code"
              className="input login-room-input"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="留空 = 开新局"
              maxLength={6}
            />
          </div>
          <button onClick={handleJoin} disabled={!nickname.trim()} className="btn btn-primary btn-block btn-lg">
            {roomCode ? `进入房间 ${roomCode}` : '启幕 · 开启新局'}
          </button>
          <p className="login-tip">提示:房主开房后会获得 6 位房间号,其他玩家凭此加入。</p>
        </div>
      </div>
    </div>
  );
}

function difficultyLabel(d: string): string {
  const map: Record<string, string> = { easy: '入门', normal: '普通', hard: '困难', expert: '专家' };
  return map[d] ?? d;
}

function playerCountLabel(min: number, max: number): string {
  return min === max ? `${min}人` : `${min}-${max}人`;
}
