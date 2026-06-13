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

export function SearchClueRow({ title, canSearch, onSearch, cooldown }: { title: string; canSearch: boolean; onSearch: () => void; cooldown: number }) {
  const disabled = !canSearch || cooldown > 0;
  return (
    <div className="search-clue-row">
      <div>
        <div className="search-clue-title">{title}</div>
        <div className="search-clue-sub">
          {cooldown > 0 ? `冷却中 ${Math.ceil(cooldown / 100) / 10}s` : (canSearch ? '可行动' : '等待行动权限')}
        </div>
      </div>
      {canSearch && <button onClick={onSearch} disabled={disabled} className="btn btn-secondary btn-sm">搜索</button>}
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
          {image && <img src={image} alt={title} className="clue-thumb" onClick={onImage} loading="lazy" decoding="async" />}
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
