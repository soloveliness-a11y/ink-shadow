import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'danger' | 'warning' | 'default';
}

export function ConfirmDialog({
  open, title, message,
  confirmLabel = '确认', cancelLabel = '取消',
  onConfirm, onCancel, tone = 'default',
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Auto-focus confirm button on open; trap Escape to cancel; trap Tab within dialog
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Tab') {
        const card = document.querySelector('.confirm-card');
        if (!card) return;
        const focusable = card.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const toneClass = tone === 'danger' ? 'confirm-tone-danger' : tone === 'warning' ? 'confirm-tone-warning' : '';

  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className={`confirm-card ${toneClass}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>{cancelLabel}</button>
          <button
            ref={confirmRef}
            className={`btn btn-sm ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
