import { useToasts, dismissToast } from './toast.js';
import type { ToastItem } from './toast.js';

/** 在右下角渲染 toast 队列。挂一次即可,所有 pushToast 调用都会显示。 */
export function ToastViewport() {
  const list = useToasts();
  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {list.map((t: ToastItem) => (
        <ToastCard key={t.id} item={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  return (
    <div
      className={`toast-card toast-${item.tone}`}
      onClick={onDismiss}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDismiss()}
    >
      <span className="toast-icon" aria-hidden>
        {iconFor(item.tone)}
      </span>
      <span className="toast-text">{item.text}</span>
    </div>
  );
}

function iconFor(tone: ToastItem['tone']): string {
  switch (tone) {
    case 'success':
      return '✓';
    case 'warn':
      return '!';
    case 'error':
      return '✕';
    default:
      return '·';
  }
}
