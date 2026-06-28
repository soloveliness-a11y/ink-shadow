import { useState } from 'react';

export function RevealClueButton({ title, onConfirm }: { title: string; onConfirm: () => void }) {
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

export function SearchClueRow({ title, canSearch, onSearch, cooldown, searching, found }: { title: string; canSearch: boolean; onSearch: () => void; cooldown: number; searching?: boolean; found?: boolean }) {
  const disabled = !canSearch || cooldown > 0 || searching;
  const rowClass = `search-clue-row${searching ? ' searching' : ''}${found ? ' search-success' : ''}`;
  return (
    <div className={rowClass}>
      <div>
        <div className="search-clue-title">{title}</div>
        <div className="search-clue-sub">
          {searching ? '搜索中…' : found ? '✓ 获得线索' : cooldown > 0 ? `冷却中 ${Math.ceil(cooldown / 100) / 10}s` : (canSearch ? '可行动' : '等待行动权限')}
        </div>
      </div>
      {canSearch && !searching && !found && <button onClick={onSearch} disabled={disabled} className="btn btn-secondary btn-sm">搜索</button>}
    </div>
  );
}

export function ClueCard({ title, content, image, badge, action, onImage, isSecret }: {
  title: string;
  content: string;
  image?: string | null;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  onImage?: () => void;
  isSecret?: boolean;
}) {
  return (
    <div className="clue-card">
      <div className="clue-card-main">
        <div className="clue-card-content">
          {image && <button type="button" className="clue-thumb-btn" onClick={onImage} aria-label={`查看线索图片：${title}`}><img src={image} alt={title} className="clue-thumb" loading="lazy" decoding="async" /></button>}
          <div>
            <div className="clue-card-head">
              <div className="clue-card-title">{title}</div>
              {isSecret && <span className="badge badge-secret">秘密线索</span>}
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
