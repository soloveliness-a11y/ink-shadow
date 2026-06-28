import { useEffect, useMemo, useRef, useState } from 'react';
import { t, Trans } from '@lingui/macro';
import type { ClientIntent } from '@mmg/schema';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { pushToast } from '../lib/toast.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { InvitePanel } from '../components/InvitePanel.js';
import { PublicRoomList } from '../components/PublicRoomList.js';

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
  // C2: 选本反馈 —— 记录正在发送的剧本 id,服务端确认前禁用重复点击
  const [pendingScript, setPendingScript] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlayerCount, setFilterPlayerCount] = useState<string>('');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('');
  const [filterDuration, setFilterDuration] = useState<string>('');
  const [filterScene, setFilterScene] = useState<string>('');
  const [filterTheme, setFilterTheme] = useState<string>('');
  const [filterStyle, setFilterStyle] = useState<string>('');

  const joined = view && playerId;
  const isHostEarly = !!(view?.players.find((p) => p.playerId === playerId)?.isHost);

  // 等待时长追踪(非房主)
  const joinedAtRef = useRef<number>(Date.now());
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!joined || isHostEarly) return;
    joinedAtRef.current = Date.now();
    setWaitSeconds(0);
    const t = window.setInterval(() => setWaitSeconds(Math.floor((Date.now() - joinedAtRef.current) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [joined, isHostEarly]);

  const availableScripts = view?.availableScripts || [];

  // Tag category definitions
  const SCENE_TAGS = ['大宅', '山庄', '旅店', '山村', '小镇', '海岛', '戏班', '祭祀', '画舫', '潜艇', '武馆', '医馆', '废墟', '舞厅', '公馆', '庄园', '岳麓'];
  const THEME_TAGS = ['家族', '夺宝', '灵异', '复仇', '谍战', '爱情', '身世', '革命', '戏剧', '商战'];
  const STYLE_TAGS = ['身份悬疑', '密室', '多线叙事', '群像', '葬礼', '入门推荐', '清末', '科技', '奇术', '悬念', '警探', '媒体', '阵营'];

  const playerCountOptions = useMemo(() => {
    const counts = new Set<number>();
    availableScripts.forEach(sc => {
      const min = sc.playerCount?.min ?? 0;
      const max = sc.playerCount?.max ?? 0;
      if (min === max && min > 0) counts.add(min);
    });
    return Array.from(counts).sort((a, b) => a - b);
  }, [availableScripts]);

  const sceneOptions = useMemo(() => {
    const s = new Set<string>();
    availableScripts.forEach(sc => (sc.featureTags || []).forEach((t: string) => { if (SCENE_TAGS.includes(t)) s.add(t); }));
    return Array.from(s).sort();
  }, [availableScripts]);

  const themeOptions = useMemo(() => {
    const s = new Set<string>();
    availableScripts.forEach(sc => (sc.featureTags || []).forEach((t: string) => { if (THEME_TAGS.includes(t)) s.add(t); }));
    return Array.from(s).sort();
  }, [availableScripts]);

  const styleOptions = useMemo(() => {
    const s = new Set<string>();
    availableScripts.forEach(sc => (sc.featureTags || []).forEach((t: string) => { if (STYLE_TAGS.includes(t)) s.add(t); }));
    return Array.from(s).sort();
  }, [availableScripts]);

  const filteredScripts = useMemo(() => {
    return availableScripts.filter(sc => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!sc.title.toLowerCase().includes(q) && !sc.synopsis?.toLowerCase().includes(q)) return false;
      }
      if (filterPlayerCount) {
        const min = sc.playerCount?.min ?? 0;
        const max = sc.playerCount?.max ?? 0;
        const target = parseInt(filterPlayerCount);
        if (min !== target || max !== target) return false;
      }
      if (filterDifficulty && sc.difficulty !== filterDifficulty) return false;
      if (filterDuration) {
        const dur = sc.durationMin ?? 0;
        const parts = filterDuration.split('-').map(Number);
        const minDur = parts[0] ?? 0;
        const maxDur = parts[1] ?? 999;
        if (dur < minDur || dur > maxDur) return false;
      }
      const tags = sc.featureTags || [];
      if (filterScene && !tags.includes(filterScene)) return false;
      if (filterTheme && !tags.includes(filterTheme)) return false;
      if (filterStyle && !tags.includes(filterStyle)) return false;
      return true;
    });
  }, [availableScripts, searchQuery, filterPlayerCount, filterDifficulty, filterDuration, filterScene, filterTheme, filterStyle]);

  // ============= 已加入:房间大厅 =============
  if (joined) {
    const players = view.players || [];
    const me = players.find((p) => p.playerId === playerId);
    const isHost = me?.isHost;
    const selectedScript = view.selectedScript;
    const requiredPlayers = selectedScript?.playerCount?.min ?? selectedScript?.playerCount?.max ?? 0;
    const onlineCount = players.filter((p) => p.connected).length;
    const canStart = selectedScript && onlineCount === requiredPlayers;
    const canTest = !!selectedScript && isHost && onlineCount < requiredPlayers;
    const coverUrl = assetUrl(selectedScript?.id, selectedScript?.cover?.asset?.path);
    const seatPct = requiredPlayers > 0 ? Math.min(100, Math.round((onlineCount / requiredPlayers) * 100)) : 0;
    const missingSeats = Math.max(0, requiredPlayers - onlineCount);

    const copyRoomCode = () => {
      // P1-10: clipboard 在非 HTTPS/老浏览器可能 undefined 或失败,降级提示
      if (!navigator.clipboard?.writeText) {
        pushToast('复制不可用,请手动选择房间号', 'warn');
        return;
      }
      navigator.clipboard.writeText(view.roomCode).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }).catch(() => {
        pushToast('复制失败,请手动选择房间号', 'warn');
      });
    };

    return (
      <div className="lobby-stage">
        {/* 房间号条:始终显示,未选本时也能复制邀请朋友 */}
        <div className="lobby-room-bar">
          <span className="lobby-room-label"><Trans>房间号</Trans></span>
          <span className="lobby-room-code">{view.roomCode}</span>
          <button
            className={`lobby-copy${copied ? ' copied' : ''}`}
            onClick={copyRoomCode}
            title={t`复制房间号`}
          >{copied ? <Trans>已复制</Trans> : <Trans>复制</Trans>}</button>
          <span className="lobby-room-online">{onlineCount} <Trans>人在场</Trans></span>
        </div>

        <div className={!isHost ? 'lobby-invite-highlight' : ''}>
          <InvitePanel />
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
              <div className="lobby-hero-tagline"><Trans>墨影 · 剧本杀</Trans></div>
              <div className="lobby-hero-sub"><Trans>等待房主选择剧本</Trans></div>
            </div>
          )}

          {selectedScript && (
            <div className="lobby-hero-info">
              <h1 className="lobby-script-title">{selectedScript.title}</h1>
              <div className="lobby-meta">
                <span className="badge badge-accent">{playerCountLabel(selectedScript.playerCount.min, selectedScript.playerCount.max)}</span>
                <span className="badge badge-muted">{difficultyLabel(selectedScript.difficulty)}</span>
                <span className="badge badge-muted"><Trans>约 {selectedScript.durationMin} 分钟</Trans></span>
                {isHost && (
                  <button onClick={() => send({ kind: 'selectScript', scriptId: '' })} className="btn btn-ghost btn-xs lobby-change-script">
                    × <Trans>更换</Trans>
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
            <div className="section-label"><Trans>选择剧本</Trans></div>

            {/* Search bar */}
            <div className="script-search">
              <svg className="script-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="script-search-input"
                placeholder={t`搜索剧本...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="script-search-clear" onClick={() => setSearchQuery('')} aria-label={t`清除搜索`}>×</button>
              )}
            </div>

            {/* Dropdown filters */}
            <div className="script-filters">
              <div className="script-filter-group">
                <label className="script-filter-label" htmlFor="filter-player-count"><Trans>人数</Trans></label>
                <select
                  id="filter-player-count"
                  className="script-filter-select"
                  value={filterPlayerCount}
                  onChange={(e) => setFilterPlayerCount(e.target.value)}
                >
                  <option value=""><Trans>全部</Trans></option>
                  {playerCountOptions.map(count => (
                    <option key={count} value={count}>{t`${count}人`}</option>
                  ))}
                </select>
              </div>

              <div className="script-filter-group">
                <label className="script-filter-label" htmlFor="filter-difficulty"><Trans>难度</Trans></label>
                <select
                  id="filter-difficulty"
                  className="script-filter-select"
                  value={filterDifficulty}
                  onChange={(e) => setFilterDifficulty(e.target.value)}
                >
                  <option value=""><Trans>全部</Trans></option>
                  <option value="easy"><Trans>简单</Trans></option>
                  <option value="normal"><Trans>中等</Trans></option>
                  <option value="hard"><Trans>困难</Trans></option>
                  <option value="expert"><Trans>专家</Trans></option>
                </select>
              </div>

              <div className="script-filter-group filter-hide-mobile">
                <label className="script-filter-label" htmlFor="filter-duration"><Trans>时长</Trans></label>
                <select
                  id="filter-duration"
                  className="script-filter-select"
                  value={filterDuration}
                  onChange={(e) => setFilterDuration(e.target.value)}
                >
                  <option value=""><Trans>全部</Trans></option>
                  <option value="60-120"><Trans>约1小时</Trans></option>
                  <option value="121-180"><Trans>约2小时</Trans></option>
                  <option value="181-240"><Trans>约3小时</Trans></option>
                  <option value="241-999"><Trans>4小时+</Trans></option>
                </select>
              </div>

              <div className="script-filter-group filter-hide-mobile">
                <label className="script-filter-label" htmlFor="filter-scene"><Trans>场景</Trans></label>
                <select
                  id="filter-scene"
                  className="script-filter-select"
                  value={filterScene}
                  onChange={(e) => setFilterScene(e.target.value)}
                >
                  <option value=""><Trans>全部</Trans></option>
                  {sceneOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="script-filter-group filter-hide-mobile">
                <label className="script-filter-label" htmlFor="filter-theme"><Trans>题材</Trans></label>
                <select
                  id="filter-theme"
                  className="script-filter-select"
                  value={filterTheme}
                  onChange={(e) => setFilterTheme(e.target.value)}
                >
                  <option value=""><Trans>全部</Trans></option>
                  {themeOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="script-filter-group filter-hide-mobile">
                <label className="script-filter-label" htmlFor="filter-style"><Trans>风格</Trans></label>
                <select
                  id="filter-style"
                  className="script-filter-select"
                  value={filterStyle}
                  onChange={(e) => setFilterStyle(e.target.value)}
                >
                  <option value=""><Trans>全部</Trans></option>
                  {styleOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              {/* Mobile chip filters */}
              <div className="script-chip-filters">
                <div className="script-chip-row">
                  <span className="script-chip-label"><Trans>时长</Trans></span>
                  {[{v:'60-120',l:t`约1小时`},{v:'121-180',l:t`约2小时`},{v:'181-240',l:t`约3小时`},{v:'241-999',l:t`4小时+`}].map(o => (
                    <button key={o.v} className={`script-chip${filterDuration===o.v?' active':''}`} onClick={() => setFilterDuration(filterDuration===o.v?'':o.v)}>{o.l}</button>
                  ))}
                </div>
                {sceneOptions.length > 0 && <div className="script-chip-row">
                  <span className="script-chip-label"><Trans>场景</Trans></span>
                  {sceneOptions.map(v => (
                    <button key={v} className={`script-chip${filterScene===v?' active':''}`} onClick={() => setFilterScene(filterScene===v?'':v)}>{v}</button>
                  ))}
                </div>}
                {themeOptions.length > 0 && <div className="script-chip-row">
                  <span className="script-chip-label"><Trans>题材</Trans></span>
                  {themeOptions.map(v => (
                    <button key={v} className={`script-chip${filterTheme===v?' active':''}`} onClick={() => setFilterTheme(filterTheme===v?'':v)}>{v}</button>
                  ))}
                </div>}
                {styleOptions.length > 0 && <div className="script-chip-row">
                  <span className="script-chip-label"><Trans>风格</Trans></span>
                  {styleOptions.map(v => (
                    <button key={v} className={`script-chip${filterStyle===v?' active':''}`} onClick={() => setFilterStyle(filterStyle===v?'':v)}>{v}</button>
                  ))}
                </div>}
              </div>

              {(filterPlayerCount || filterDifficulty || filterDuration || filterScene || filterTheme || filterStyle) && (
                <button
                  className="script-filter-clear"
                  onClick={() => {
                    setFilterPlayerCount('');
                    setFilterDifficulty('');
                    setFilterDuration('');
                    setFilterScene('');
                    setFilterTheme('');
                    setFilterStyle('');
                  }}
                >
                  <Trans>清除筛选</Trans>
                </button>
              )}
            </div>

            {/* Script grid */}
            <div className="script-grid">
              {filteredScripts.map((sc) => {
                const scCover = assetUrl(sc.id, sc.cover?.asset?.path);
                const isPending = pendingScript === sc.id;
                const cardTags = sc.featureTags || [];
                return (
                  <button
                    key={sc.id}
                    disabled={!!pendingScript}
                    onClick={() => {
                      setPendingScript(sc.id);
                      send({ kind: 'selectScript', scriptId: sc.id });
                      setTimeout(() => setPendingScript((cur) => (cur === sc.id ? null : cur)), 5000);
                    }}
                    className={`script-card${isPending ? ' is-pending' : ''}`}
                  >
                    <div className="script-card-cover">
                      {scCover ? (
                        <img src={scCover} alt={sc.title} loading="lazy" decoding="async" />
                      ) : (
                        <div className="script-card-cover-fallback">
                          <span>{sc.title.charAt(0)}</span>
                        </div>
                      )}
                    </div>
                    <div className="script-card-body">
                      <h3 className="script-card-title">{sc.title}</h3>
                      <div className="script-card-tags">
                        {cardTags.map(tag => (
                          <span key={tag} className="script-card-tag">{tag}</span>
                        ))}
                      </div>
                      <p className="script-card-syn">{sc.synopsis}</p>
                    </div>
                  </button>
                );
              })}
              {filteredScripts.length === 0 && (
                <div className="script-empty">
                  <div className="script-empty-icon">🎭</div>
                  <div className="script-empty-text"><Trans>没有找到匹配的剧本</Trans></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 玩家列表:始终显示(含未选本,方便大厅集结) */}
        <div className="lobby-players">
          <div className="lobby-players-head">
            <span className="section-label"><Trans>在场玩家</Trans></span>
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
                <div className="lobby-seat-hint"><Trans>还差 {missingSeats} 位玩家入座</Trans></div>
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
                {p.isHost && <span className="badge badge-accent"><Trans>房主</Trans></span>}
                {!p.isHost && p.playerId === playerId && <span className="badge badge-muted"><Trans>你</Trans></span>}
                {isHost && view.status === 'lobby' && p.playerId !== playerId && (
                  <button
                    className="lobby-kick"
                    onClick={() => setKickTarget({ id: p.playerId, name: p.nickname })}
                    title={t`移出房间`}
                    aria-label={t`移出 ${p.nickname}`}
                  ><Trans>踢出</Trans></button>
                )}
              </div>
            ))}
            {/* #9: ConfirmDialog 提到 map 外层,全局只 1 份(原在 map 内每玩家一份,N 份同时开合浪费) */}
            <ConfirmDialog
              open={!!kickTarget}
              title={t`移出玩家`}
              message={kickTarget ? t`确认将「${kickTarget.name}」移出房间？` : ''}
              confirmLabel={t`确认移出`}
              cancelLabel={t`取消`}
              onConfirm={() => { send({ kind: 'kickPlayer', targetPlayerId: kickTarget!.id }); setKickTarget(null); }}
              onCancel={() => setKickTarget(null)}
              tone="danger"
            />
            {selectedScript && Array.from({ length: Math.max(0, requiredPlayers - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="lobby-player lobby-player-empty">
                <div className="lobby-player-avatar">?</div>
                <div className="lobby-player-name"><Trans>等待加入</Trans></div>
              </div>
            ))}
          </div>
        </div>

        {/* AI DM 说书人设置（房主） */}
        {isHost && selectedScript && <DmSettingsPanel send={send} />}

        {/* 房主控制区 */}
        {isHost && selectedScript && (
          <div className="lobby-host-controls">
            <button
              onClick={() => send({ kind: 'hostAdvance' })}
              disabled={!canStart}
              className="btn btn-primary btn-lg"
            >
              {canStart ? <Trans>启幕 · 开始游戏</Trans> : <Trans>等待玩家就位 {onlineCount}/{requiredPlayers}</Trans>}
            </button>
            {canTest && (
              <button
                onClick={() => send({ kind: 'startTest' })}
                className="btn btn-secondary"
              >
                <Trans>Bot 填充 · 快速预览</Trans>
              </button>
            )}
          </div>
        )}
        {isHost && selectedScript && missingSeats > 0 && (
          <div className="lobby-wait-hint">
            <Trans>还需 <strong>{missingSeats}</strong> 位玩家加入</Trans>
          </div>
        )}

        {!isHost && selectedScript && (
          <div className="lobby-waiting">
            <span className="lobby-wait-pulse">
              <span className="pulse-dot" />
              <Trans>已就座,等待房主启幕…</Trans>
            </span>
          </div>
        )}
        {!isHost && !selectedScript && (
          <div className="lobby-waiting">
            <span className="lobby-wait-pulse">
              <span className="pulse-dot" />
              <Trans>等待房主选择剧本…</Trans>
            </span>
          </div>
        )}
        {!isHost && waitSeconds > 120 && (
          <div className="lobby-long-wait-notice">
            <Trans>已等待 {Math.floor(waitSeconds / 60)} 分钟,可邀请更多朋友加入</Trans>
          </div>
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
        <h1 className="login-title"><Trans>墨影</Trans></h1>
        <div className="login-tagline"><Trans>Ink Shadow · 推理与谎言的舞台</Trans></div>
      </div>
      <div className="login-card">
        <div className="login-card-title"><Trans>入场</Trans></div>
        <div className="login-card-sub"><Trans>输入昵称与房间号,或开启一局新游戏</Trans></div>

        {savedSession && (
          <button
            type="button"
            className="login-rejoin"
            onClick={handleRejoinLast}
            disabled={!nickname.trim()}
            title={!nickname.trim() ? t`先填写昵称` : t`回到上次的房间`}
          >
            <span className="login-rejoin-dot" aria-hidden />
            <span className="login-rejoin-text"><Trans>回到上次房间</Trans></span>
            <span className="login-rejoin-code">{savedRoomCode}</span>
            <span className="login-rejoin-arrow" aria-hidden>→</span>
          </button>
        )}

        <div className="login-form">
          <div>
            <label className="form-label" htmlFor="login-nickname"><Trans>你的昵称</Trans></label>
            <input
              id="login-nickname"
              className="input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder={t`如何称呼你`}
              maxLength={20}
              autoFocus
            />
          </div>
          <div>
            <label className="form-label" htmlFor="login-room-code"><Trans>房间号</Trans></label>
            <input
              id="login-room-code"
              className="input login-room-input"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder={t`留空 = 开新局`}
              maxLength={6}
            />
          </div>
          <button onClick={handleJoin} disabled={!nickname.trim()} className="btn btn-primary btn-block btn-lg">
            {roomCode ? <Trans>进入房间 {roomCode}</Trans> : <Trans>启幕 · 开启新局</Trans>}
          </button>
          <p className="login-tip"><Trans>提示:房主开房后会获得 6 位房间号,其他玩家凭此加入。</Trans></p>
        </div>

        <div className="login-divider"><span><Trans>或</Trans></span></div>
        <PublicRoomList nickname={nickname} onJoinRoom={(code) => {
          if (!nickname.trim()) return;
          if (!conn) connect();
          joinRoom(code, nickname.trim());
        }} />
      </div>
    </div>
  );
}

/* ===== AI DM 说书人设置面板 ===== */

interface DmConfig {
  enabled: boolean;
  provider: 'anthropic' | 'openai';
  apiKey: string;
  apiUrl: string;
  model: string;
}

const DM_STORAGE_KEY = 'dm-config';
const DM_DEFAULTS: DmConfig = {
  enabled: false,
  provider: 'openai',
  apiKey: '',
  apiUrl: 'https://5yuantoken.org/v1',
  model: 'claude-haiku-4-5',
};

function loadDmConfig(): DmConfig {
  try {
    const saved = localStorage.getItem(DM_STORAGE_KEY);
    if (saved) return { ...DM_DEFAULTS, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return { ...DM_DEFAULTS };
}

function DmSettingsPanel({ send }: { send: (intent: ClientIntent) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState<DmConfig>(loadDmConfig);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<DmConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const handleSave = () => {
    // 持久化到 localStorage(隐私模式/配额满可能抛 QuotaExceeded,#7 包 try/catch 不阻断后续)
    try {
      localStorage.setItem(DM_STORAGE_KEY, JSON.stringify(config));
    } catch {
      pushToast('配置未能保存到本机,但本次仍会生效', 'warn');
    }
    // 发给服务端
    send({
      kind: 'configureDm',
      enabled: config.enabled,
      provider: config.enabled ? config.provider : undefined,
      apiKey: config.enabled ? config.apiKey : undefined,
      apiUrl: config.enabled ? config.apiUrl : undefined,
      model: config.enabled ? config.model : undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  // 页面加载时只发 enabled 标记（不传 key，服务端用已存配置重建）
  useEffect(() => {
    const saved = loadDmConfig();
    if (saved.enabled) {
      send({ kind: 'configureDm', enabled: true });
    }
  }, []);

  return (
    <div className="dm-settings">
      <button className="dm-settings-toggle" onClick={() => setExpanded(!expanded)}>
        <span className="dm-icon">DM</span>
        <span>{expanded ? <Trans>收起说书人设置</Trans> : <Trans>说书人 AI DM</Trans>}</span>
        {config.enabled && <span className="badge badge-teal"><Trans>已启用</Trans></span>}
        <span className={`phase-narrative-arrow ${expanded ? 'up' : 'down'}`}>▾</span>
      </button>

      {expanded && (
        <div className="dm-settings-body">
          <p className="dm-settings-desc"><Trans>配置 AI 说书人，自动为游戏生成旁白和氛围渲染。需要 API Key。</Trans></p>

          <div className="dm-settings-row">
            <label className="dm-settings-label" htmlFor="dm-enabled-toggle"><Trans>启用说书人</Trans></label>
            <button
              id="dm-enabled-toggle"
              className={`btn btn-sm ${config.enabled ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => update({ enabled: !config.enabled })}
              role="switch"
              aria-checked={config.enabled}
            >
              {config.enabled ? <Trans>已启用</Trans> : <Trans>未启用</Trans>}
            </button>
          </div>

          {config.enabled && (
            <>
              <label className="dm-settings-row">
                <span className="dm-settings-label"><Trans>API 服务</Trans></span>
                <select id="dm-provider" className="input dm-settings-select" value={config.provider} onChange={e => update({ provider: e.target.value as 'anthropic' | 'openai' })}>
                  <option value="openai"><Trans>OpenAI 兼容（中转站）</Trans></option>
                  <option value="anthropic"><Trans>Anthropic 直连</Trans></option>
                </select>
              </label>

              <label className="dm-settings-row">
                <span className="dm-settings-label"><Trans>API Key</Trans></span>
                <div className="dm-settings-key">
                  <input
                    id="dm-api-key"
                    className="input"
                    type={showKey ? 'text' : 'password'}
                    value={config.apiKey}
                    onChange={e => update({ apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                  <button className="dm-settings-eye" onClick={() => setShowKey(!showKey)} type="button" aria-label={showKey ? t`隐藏 API Key` : t`显示 API Key`}>
                    {showKey ? '🙈' : '👁'}
                  </button>
                </div>
              </label>

              {config.provider === 'openai' && (
                <label className="dm-settings-row">
                  <span className="dm-settings-label"><Trans>API 地址</Trans></span>
                  <input
                    id="dm-api-url"
                    className="input"
                    value={config.apiUrl}
                    onChange={e => update({ apiUrl: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                </label>
              )}

              <label className="dm-settings-row">
                <span className="dm-settings-label"><Trans>模型</Trans></span>
                <input
                  id="dm-model"
                  className="input"
                  value={config.model}
                  onChange={e => update({ model: e.target.value })}
                  placeholder="claude-haiku-4-5"
                />
              </label>
            </>
          )}

          <div className="dm-settings-actions">
            <button onClick={handleSave} className={`btn btn-sm ${saved ? 'btn-primary' : 'btn-secondary'}`}>
              {saved ? <Trans>✓ 已保存</Trans> : <Trans>保存配置</Trans>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function extractTags(sc: { playerCount?: { min?: number; max?: number }; difficulty?: string; durationMin?: number; theme?: string }): string[] {
  const tags: string[] = [];
  const min = sc.playerCount?.min ?? 0;
  const max = sc.playerCount?.max ?? 0;
  if (min === max) tags.push(`${min}人`);
  else if (min > 0 && max > 0) tags.push(`${min}-${max}人`);
  const diffMap: Record<string, string> = { easy: '简单', normal: '中等', hard: '困难', expert: '专家' };
  if (sc.difficulty) tags.push(diffMap[sc.difficulty] ?? sc.difficulty);
  if (sc.durationMin) {
    if (sc.durationMin <= 120) tags.push('约1小时');
    else if (sc.durationMin <= 180) tags.push('约2小时');
    else if (sc.durationMin <= 240) tags.push('约3小时');
    else tags.push('4小时+');
  }
  if (sc.theme) {
    if (sc.theme.includes('民国')) tags.push('民国');
    if (sc.theme.includes('现代')) tags.push('现代');
    if (sc.theme.includes('古代')) tags.push('古代');
  }
  return tags;
}

function difficultyLabel(d: string): string {
  const map: Record<string, string> = { easy: t`入门`, normal: t`普通`, hard: t`困难`, expert: t`专家` };
  return map[d] ?? d;
}

function playerCountLabel(min: number, max: number): string {
  return min === max ? t`${min}人` : t`${min}-${max}人`;
}
