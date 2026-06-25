import { useEffect, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';
export interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
  ttl: number;
}

type Listener = (toasts: ToastItem[]) => void;

let counter = 0;
const listeners = new Set<Listener>();
let toasts: ToastItem[] = [];
const pendingTimers = new Map<number, number>();

/** 全局 toast 推送。单点入口,所有组件共享。 */
export function pushToast(text: string, tone: ToastTone = 'info', ttl = 3200): void {
  const id = ++counter;
  toasts = [...toasts, { id, text, tone, ttl }];
  emit();
  const timerId = window.setTimeout(() => dismissToast(id), ttl);
  pendingTimers.set(id, timerId);
}

export function dismissToast(id: number): void {
  const timerId = pendingTimers.get(id);
  if (timerId !== undefined) {
    window.clearTimeout(timerId);
    pendingTimers.delete(id);
  }
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) emit();
}

function emit(): void {
  for (const fn of listeners) fn(toasts);
}

/** 订阅当前 toast 列表(组件用)。 */
export function useToasts(): ToastItem[] {
  const [list, setList] = useState<ToastItem[]>(toasts);
  useEffect(() => {
    const fn: Listener = (next) => setList(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return list;
}
