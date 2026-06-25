import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../lib/asset.js';

/** 小头像:有图渲染 img,无图/加载失败回退文字占位。沿用 .avatar 尺寸类。 */
export function Avatar({ name, path, scriptId, className = '', onClick }: {
  name: string;
  path?: string | null;
  scriptId?: string;
  className?: string;
  onClick?: () => void;
}) {
  const url = assetUrl(scriptId, path);
  // C1: 图加载失败(404/慢/损坏)时回退首字母,不显示碎图标
  const [imgOk, setImgOk] = useState(true);
  if (url && imgOk) {
    return <img src={url} alt={name} title={name} className={`avatar avatar-img ${className}`} onClick={onClick} loading="lazy" decoding="async" onError={() => setImgOk(false)} />;
  }
  return <div className={`avatar ${className}`} onClick={onClick}>{name.charAt(0)}</div>;
}

/** 角色立绘卡(3:4,名字浮底部渐变)。用于选角 / 投票。 */
export function Portrait({ name, subtitle, path, scriptId, selected = false, taken = false, onClick }: {
  name: string;
  subtitle?: string;
  path?: string | null;
  scriptId?: string;
  selected?: boolean;
  taken?: boolean;
  onClick?: () => void;
}) {
  const clickable = onClick && !taken;
  const handleKeyDown = clickable
    ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }
    : undefined;
  const url = assetUrl(scriptId, path);
  // C1: 图加载失败回退首字母占位
  const [imgOk, setImgOk] = useState(true);
  const showImg = url && imgOk;
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `选择${name}` : undefined}
      aria-disabled={taken || undefined}
      className={`portrait-card${selected ? ' selected' : ''}${taken ? ' taken' : ''}${clickable ? ' clickable' : ''}`}
      onClick={clickable ? onClick : undefined}
      onKeyDown={handleKeyDown}
    >
      {showImg ? <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setImgOk(false)} /> : <div className="portrait-fallback">{name.charAt(0)}</div>}
      <div className="portrait-overlay">
        <div className="portrait-name">{name}</div>
        {subtitle && <div className="portrait-sub">{subtitle}</div>}
        {taken && <span className="badge badge-muted portrait-taken-badge">已被选</span>}
      </div>
      {selected && <div className="portrait-check">✓</div>}
    </div>
  );
}

/** 全屏灯箱看大图。点击遮罩关闭。 */
export function Lightbox({ src, caption, onClose }: {
  src: string;
  caption?: string;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      onClose?.();
      setClosing(false);
    }, 180);
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    (
      <div className={`lightbox${closing ? ' closing' : ''}`} onClick={handleClose}>
        <figure className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
          <img src={src} alt={caption ?? ''} />
          {caption && <figcaption className="lightbox-caption">{caption}</figcaption>}
          <button className="lightbox-close" onClick={handleClose} aria-label="关闭">✕</button>
        </figure>
      </div>
    ),
    document.body,
  );
}
