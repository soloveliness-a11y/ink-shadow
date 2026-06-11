import { useEffect, useState } from 'react';
import { useToasts } from './toast';
import { pushToast, dismissToast } from './toast';
import type { ToastItem } from './toast';

/** 在右下角渲染 toast 队列。挂一次即可,所有 pushToast 调用都会显示。 */
export function ToastViewport() {
  const list = useToasts();
  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {list.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  return (
    <div className={`toast-card toast-${item.tone}`} onClick={onDismiss} role="button" tabIndex={0}>
      <span className="toast-icon" aria-hidden>
        {iconFor(item.tone)}
      </span>
      <span className="toast-text">{item.text}</span>
    </div>
  );
}

function iconFor(tone: ToastItem['tone']): string {
  switch (tone) {
    case 'success': return '✓';
    case 'warn': return '!';
    case 'error': return '✕';
    default: return '·';
  }
}

/** 兼容旧 API:useToasts() 仍导出 */
export { useToasts, pushToast, dismissToast };
export type { ToastItem };

/** 仅占位,避免未使用 import 警告(供需要时) */
export function useMountedFlag(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
