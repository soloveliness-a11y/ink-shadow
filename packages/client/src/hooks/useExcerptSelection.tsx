import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../store/game.js';
import { useAnnotationStore } from '../store/annotations.js';
import { pushToast } from '../lib/toast.js';

interface ExcerptToolbarState {
  x: number;
  y: number;
  text: string;
  source: string;
}

/**
 * 选区摘录:在 selector 命中的元素上选中文本 → 弹摘录按钮 → 写入标注 store。
 * onMouseUp 绑到容器根 div;toolbar 渲染到 React 树任意位置(内部已 portal 到 body,规避 transform 祖先)。
 */
export function useExcerptSelection(opts: {
  selector: string;
  resolveSource: (el: HTMLElement) => string;
}): { onMouseUp: () => void; toolbar: ReactNode } {
  const { selector, resolveSource } = opts;
  const annoAdd = useAnnotationStore((s) => s.add);
  const playerId = useGameStore((s) => s.playerId);
  const scriptId = useGameStore((s) => s.view?.selectedScript?.id);
  const myCharId = useGameStore((s) => s.view?.players.find((p) => p.playerId === s.playerId)?.charId);
  const [toolbar, setToolbar] = useState<ExcerptToolbarState | null>(null);

  // ref 存最新 selector/resolveSource,让 onMouseUp 句柄稳定(根 div 不频繁重绑)
  const optsRef = useRef({ selector, resolveSource });
  optsRef.current = { selector, resolveSource };

  const onMouseUp = useCallback(() => {
    window.setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setToolbar(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
      const target = el?.closest(optsRef.current.selector);
      if (!target) {
        setToolbar(null);
        return;
      }
      const source = optsRef.current.resolveSource(target as HTMLElement);
      const rect = range.getBoundingClientRect();
      setToolbar({
        x: rect.left + rect.width / 2,
        y: rect.top - 12,
        text: sel.toString(),
        source,
      });
    }, 10);
  }, []);

  const doExcerpt = useCallback(() => {
    if (!toolbar || !playerId || !scriptId) return;
    const text = toolbar.text;
    annoAdd({
      scriptId,
      playerId,
      charId: myCharId ?? '',
      pageIndex: -1,
      segIndex: -1,
      startOffset: 0,
      endOffset: text.length,
      type: 'excerpt',
      text,
      source: toolbar.source,
    });
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
    pushToast(`已摘录:${text.slice(0, 12)}${text.length > 12 ? '…' : ''}`, 'success', 1800);
  }, [toolbar, annoAdd, playerId, scriptId, myCharId]);

  // 点击浮层外部关闭
  useEffect(() => {
    if (!toolbar) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.excerpt-floating')) return;
      setToolbar(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [toolbar]);

  const toolbarNode = toolbar
    ? createPortal(
        (
          <div
            className="scriptbook-toolbar excerpt-floating"
            style={{
              position: 'fixed',
              left: `${Math.max(toolbar.x, 80)}px`,
              top: `${Math.max(toolbar.y, 60)}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <button
              className="scriptbook-toolbar-btn toolbar-excerpt"
              onMouseDown={(e) => { e.preventDefault(); doExcerpt(); }}
              title="摘录到「我的剧本」"
            >
              <span>「」</span>
            </button>
          </div>
        ),
        document.body,
      )
    : null;

  return { onMouseUp, toolbar: toolbarNode };
}
