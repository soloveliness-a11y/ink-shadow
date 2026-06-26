import { useState, useCallback } from 'react';
import { useGameStore } from '../store/game.js';
import { assetUrl } from '../lib/asset.js';
import { pushToast } from '../lib/toast.js';

export function InvitePanel() {
  const view = useGameStore((s) => s.view);
  const roomCode = view?.roomCode;
  const selectedScript = view?.selectedScript;
  const [generating, setGenerating] = useState(false);

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode ?? ''}`
    : '';

  const copyLink = useCallback(() => {
    if (!navigator.clipboard?.writeText) {
      pushToast('复制不可用', 'warn');
      return;
    }
    navigator.clipboard.writeText(inviteUrl).then(() => {
      pushToast('邀请链接已复制', 'success', 2000);
    }).catch(() => pushToast('复制失败', 'warn'));
  }, [inviteUrl]);

  const copyCode = useCallback(() => {
    if (!roomCode) return;
    if (!navigator.clipboard?.writeText) {
      pushToast('复制不可用', 'warn');
      return;
    }
    navigator.clipboard.writeText(roomCode).then(() => {
      pushToast('房间号已复制', 'success', 2000);
    }).catch(() => pushToast('复制失败', 'warn'));
  }, [roomCode]);

  const generatePoster = useCallback(async () => {
    if (!selectedScript || !roomCode) return;
    setGenerating(true);
    try {
      const canvas = document.createElement('canvas');
      const W = 750, H = 1100;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // 背景渐变
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#1a1520');
      grad.addColorStop(0.5, '#0f0e13');
      grad.addColorStop(1, '#080810');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 装饰纹理
      ctx.globalAlpha = 0.03;
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.random() * W, Math.random() * H, Math.random() * 2, Math.random() * 2);
      }
      ctx.globalAlpha = 1;

      // 封面图
      const coverUrl = assetUrl(selectedScript.id, selectedScript.cover?.asset?.path);
      if (coverUrl) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = coverUrl;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          const coverH = 500;
          const coverW = Math.min(W - 80, img.width * (coverH / img.height));
          const cx = (W - coverW) / 2;
          // 圆角裁剪
          const r = 12;
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(cx, 60, coverW, coverH, r);
          ctx.clip();
          ctx.drawImage(img, cx, 60, coverW, coverH);
          ctx.restore();
          // 边框
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cx, 60, coverW, coverH, r);
          ctx.stroke();
        } catch { /* 封面加载失败跳过 */ }
      }

      // 标题
      ctx.fillStyle = '#e8e4dc';
      ctx.font = 'bold 36px serif, "Noto Serif SC", "Source Han Serif SC", Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(selectedScript.title, W / 2, 610);

      // 副标题
      ctx.fillStyle = '#8a8578';
      ctx.font = '16px sans-serif, "Noto Sans SC", "Source Han Sans SC"';
      ctx.fillText(selectedScript.theme ?? '剧本杀', W / 2, 645);

      // 元信息
      const meta = `${selectedScript.playerCount.min}-${selectedScript.playerCount.max}人 · ${selectedScript.difficulty === 'hard' ? '困难' : selectedScript.difficulty === 'easy' ? '简单' : '普通'} · 约${selectedScript.durationMin}分钟`;
      ctx.fillStyle = '#6a6560';
      ctx.font = '14px sans-serif, "Noto Sans SC"';
      ctx.fillText(meta, W / 2, 675);

      // 房间号
      ctx.fillStyle = '#c4a66a';
      ctx.font = 'bold 28px monospace';
      ctx.fillText(`房间号: ${roomCode}`, W / 2, 740);

      // 引导文字
      ctx.fillStyle = '#8a8578';
      ctx.font = '14px sans-serif, "Noto Sans SC"';
      ctx.fillText('打开浏览器输入上方地址，输入房间号即可加入', W / 2, 780);

      // 底部品牌
      ctx.fillStyle = '#4a4540';
      ctx.font = '12px sans-serif, "Noto Sans SC"';
      ctx.fillText('墨影 · AI剧本杀', W / 2, H - 40);

      // 导出
      canvas.toBlob((blob) => {
        if (!blob) { pushToast('生成失败', 'error'); setGenerating(false); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `墨影邀请-${selectedScript.title}-${roomCode}.png`;
        a.click();
        URL.revokeObjectURL(url);
        pushToast('海报已保存', 'success', 2000);
        setGenerating(false);
      }, 'image/png', 0.92);
    } catch {
      pushToast('生成失败', 'error');
      setGenerating(false);
    }
  }, [selectedScript, roomCode]);

  if (!roomCode) return null;

  return (
    <div className="invite-panel">
      <div className="section-label">邀请朋友</div>
      <div className="invite-actions">
        <button className="btn btn-primary btn-sm" onClick={copyLink}>
          复制邀请链接
        </button>
        <button className="btn btn-secondary btn-sm" onClick={copyCode}>
          复制房间号
        </button>
        {selectedScript && (
          <button className="btn btn-ghost btn-sm" onClick={generatePoster} disabled={generating}>
            {generating ? '生成中...' : '保存邀请海报'}
          </button>
        )}
      </div>
      <p className="invite-hint">分享链接或房间号，朋友打开即可加入</p>
    </div>
  );
}
