import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useGameStore } from '../store/game.js';
import { useAnnotationStore, type ScriptAnnotation } from '../store/annotations.js';

/** 计算选中文本在容器中的字符偏移 */
function getOffsetInContainer(container: HTMLElement, range: Range): number {
  // 创建遍历器收集所有文本节点及其在容器中的累计偏移
  const textNodes: { node: Text; start: number }[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    textNodes.push({ node, start: offset });
    offset += (node.textContent ?? '').length;
  }
  // 找到 range 的起始节点对应的累计偏移
  const startNode = range.startContainer;
  for (const tn of textNodes) {
    if (tn.node === startNode) {
      return tn.start + range.startOffset;
    }
  }
  // fallback
  return container.textContent?.indexOf(range.toString()) ?? -1;
}

/** 把页面文本按标注区间切成片段;标注片段套带样式的 span,重叠部分取先到的标注 */
function buildMarkedSegments(pageText: string, marks: ScriptAnnotation[], entityNames: string[]): ReactNode[] {
  // 先按标注切分
  let baseSegments: ReactNode[] = [pageText];
  if (marks.length > 0) {
    const sorted = [...marks].sort((a, b) => a.startOffset - b.startOffset);
    const result: ReactNode[] = [];
    let cursor = 0;
    for (const m of sorted) {
      const start = Math.max(m.startOffset, cursor);
      const end = Math.min(m.endOffset, pageText.length);
      if (start >= end) continue;
      if (start > cursor) result.push(pageText.slice(cursor, start));
      result.push(
        <span key={m.id} className={`anno-mark anno-${m.type}`}>
          {pageText.slice(start, end)}
        </span>,
      );
      cursor = end;
    }
    if (cursor < pageText.length) result.push(pageText.slice(cursor));
    baseSegments = result;
  }

  // 实体高亮:只对纯文本片段做替换,跳过已标注的 React 元素
  if (entityNames.length === 0) return baseSegments;
  const namePattern = new RegExp(entityNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const finalResult: ReactNode[] = [];
  let keyIdx = 0;
  for (const seg of baseSegments) {
    if (typeof seg !== 'string') { finalResult.push(seg); continue; }
    let lastIdx = 0;
    for (const match of seg.matchAll(namePattern)) {
      const start = match.index!;
      if (start > lastIdx) finalResult.push(seg.slice(lastIdx, start));
      finalResult.push(<span key={`ent-${keyIdx++}`} className="anno-mark anno-entity">{match[0]}</span>);
      lastIdx = start + match[0].length;
    }
    if (lastIdx < seg.length) finalResult.push(seg.slice(lastIdx));
  }
  return finalResult;
}

interface ScriptSegment { title: string; body: string }
interface ScriptPage { segments: { title: string; body: string }[] }

/* ───── 组件 ───── */
export function ScriptBook() {
  const view = useGameStore((s) => s.view);
  const playerId = useGameStore((s) => s.playerId);
  const self = view?.self;
  const myChar = self ? view?.publicCharacters.find((c) => c.id === self.charId) : undefined;
  const scriptId = view?.selectedScript?.id ?? 'mock';

  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const annotations = useAnnotationStore((s) => s.list);
  const annoAdd = useAnnotationStore((s) => s.add);
  const annoRemove = useAnnotationStore((s) => s.remove);
  const annoLoad = useAnnotationStore((s) => s.load);
  const [selectionToolbar, setSelectionToolbar] = useState<{
    x: number; y: number; text: string;
    pageIndex: number; segIndex: number; startOffset: number; endOffset: number;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [activeTab, setActiveTab] = useState<'script' | 'excerpts'>('script');
  const [readPages, setReadPages] = useState<Set<number>>(() => new Set());

  const leftPageRef = useRef<HTMLDivElement>(null);
  const rightPageRef = useRef<HTMLDivElement>(null);
  const charId = self?.charId ?? '';

  // Escape 关闭 + 锁定背景滚动 + 焦点陷阱
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab') {
        const modal = modalRef.current;
        if (!modal) return;
        const focusable = modal.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"]), input, select, textarea, a[href]');
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    modalRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 加载标注
  useEffect(() => {
    if (playerId) annoLoad(scriptId, playerId);
  }, [scriptId, playerId, annoLoad]);

  // #10: 构建结构化环节(标题 + 正文)并分页 —— memoize,避免每次 stateSync 都重算
  // (ScriptBook 游戏期间常驻,讨论期频繁 stateSync 会反复触发 paginateSegments)。
  const { pages, totalPages } = useMemo(() => {
    const segments: ScriptSegment[] = [];
    if (myChar) {
      segments.push({ title: '你的身份', body: `${myChar.name}${myChar.publicProfile ? '\n' + myChar.publicProfile : ''}` });
    }
    if (self?.privateScript) segments.push({ title: '开场发本', body: self.privateScript });
    // 各阶段:公共旁白 + 该阶段角色记忆,配对交错(每段旁白紧跟它对应的私人记忆)
    for (const b of self?.unlockedPhaseBlocks ?? []) {
      if (b.narrative) segments.push({ title: b.phaseTitle, body: b.narrative });
      if (b.story) {
        segments.push({ title: b.narrative ? '角色记忆' : b.phaseTitle, body: b.story });
      }
    }
    for (const o of self?.objectives ?? []) {
      const label = o.kind === 'main' ? '主线目标' : o.kind === 'hidden' ? '隐藏目标' : '支线目标';
      segments.push({ title: label, body: o.description });
    }
    for (const km of self?.unlockedKeywordMemories ?? []) {
      segments.push({ title: `触发的记忆·${km.keyword}`, body: km.text });
    }
    // 分页:短环节合并填满一页,长环节独占(不硬切,保证段落完整)
    const charsPerPage = 1200;
    const pgs = paginateSegments(segments, charsPerPage);
    return { pages: pgs, totalPages: pgs.length };
  }, [
    myChar,
    self?.privateScript,
    self?.unlockedPhaseBlocks,
    self?.objectives,
    self?.unlockedKeywordMemories,
  ]);
  const clampedPage = Math.max(0, Math.min(currentPage, totalPages - 1));

  // 标记当前页为已读
  useEffect(() => {
    if (!open) return;
    setReadPages((prev) => {
      const next = new Set(prev);
      next.add(clampedPage);
      if (clampedPage + 1 < totalPages) next.add(clampedPage + 1);
      return next;
    });
  }, [clampedPage, open, totalPages]);

  // 实体名列表(角色名 + 常见时间词),用于自动高亮
  const entityNames = useMemo(() => {
    const names = (view?.publicCharacters ?? []).map(c => c.name).filter(n => n.length >= 2);
    return [...new Set(names)];
  }, [view?.publicCharacters]);

  // 阅读进度
  const readPct = totalPages > 0 ? Math.round((readPages.size / totalPages) * 100) : 0;

  // 添加标注
  const addAnnotation = useCallback(
    (type: ScriptAnnotation['type']) => {
      if (!selectionToolbar || !playerId) return;
      annoAdd({
        scriptId,
        playerId,
        charId,
        pageIndex: selectionToolbar.pageIndex,
        segIndex: selectionToolbar.segIndex,
        startOffset: selectionToolbar.startOffset,
        endOffset: selectionToolbar.endOffset,
        type,
        text: selectionToolbar.text,
      });
      setSelectionToolbar(null);
      window.getSelection()?.removeAllRanges();
    },
    [selectionToolbar, annoAdd, scriptId, playerId, charId],
  );

  // 删除标注
  const removeAnnotation = useCallback((id: string) => {
    annoRemove(id);
  }, [annoRemove]);

  // 导出摘录
  const exportExcerpts = useCallback(() => {
    const excerpts = annotations
      .filter((a) => a.type === 'excerpt')
      .sort((a, b) => a.createdAt - b.createdAt);
    if (excerpts.length === 0) return;
    const text = excerpts
      .map((e, i) => `--- 摘录 ${i + 1} ---\n${e.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(text).catch(() => {});
    alert(`已复制 ${excerpts.length} 条摘录到剪贴板`);
  }, [annotations]);

  // ★ 文本选中处理:定位到具体环节,offset 基于该环节正文(.scriptbook-page-text)
  const handleTextSelect = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectionToolbar(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const selectedText = sel.toString();

      const ancestorEl =
        range.commonAncestorContainer.nodeType === Node.TEXT_NODE
          ? range.commonAncestorContainer.parentElement
          : (range.commonAncestorContainer as HTMLElement);
      // 仅正文(.scriptbook-page-text)内选中才视为可标注
      const textEl = ancestorEl?.closest('.scriptbook-page-text') as HTMLElement | null;
      if (!textEl) { setSelectionToolbar(null); return; }

      const segEl = textEl.closest('.scriptbook-segment') as HTMLElement | null;
      if (!segEl) { setSelectionToolbar(null); return; }

      // 判断左页/右页,并算 segIndex
      let pageIndex = clampedPage;
      let pageInner: HTMLElement | null = null;
      if (leftPageRef.current?.contains(segEl)) {
        pageIndex = clampedPage; pageInner = leftPageRef.current;
      } else if (rightPageRef.current?.contains(segEl)) {
        pageIndex = clampedPage + 1; pageInner = rightPageRef.current;
      } else {
        setSelectionToolbar(null); return;
      }
      const segIndex = Array.from(pageInner!.querySelectorAll('.scriptbook-segment')).indexOf(segEl);

      // offset 基于该环节正文(textEl 只含 body)
      const startOffset = getOffsetInContainer(textEl, range);
      if (startOffset === -1) {
        const ct = textEl.textContent ?? '';
        const idx = ct.indexOf(selectedText);
        if (idx === -1) { setSelectionToolbar(null); return; }
        const rect = range.getBoundingClientRect();
        setSelectionToolbar({
          x: rect.left + rect.width / 2, y: rect.top - 12,
          text: selectedText, pageIndex, segIndex,
          startOffset: idx, endOffset: idx + selectedText.length,
        });
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelectionToolbar({
        x: rect.left + rect.width / 2, y: rect.top - 12,
        text: selectedText, pageIndex, segIndex,
        startOffset, endOffset: startOffset + selectedText.length,
      });
    }, 10);
  }, [clampedPage]);

  // 点击外部关闭 toolbar
  useEffect(() => {
    if (!selectionToolbar) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.scriptbook-toolbar')) return;
      setSelectionToolbar(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectionToolbar]);

  // 渲染一页:按环节分块,每块标题 + 正文(正文回填高亮/下划线标注;摘录去「我的摘录」Tab)
  const renderPage = (page: ScriptPage, pageIndex: number) => (
    <div className="scriptbook-page-content">
      {page.segments.map((seg, segIdx) => {
        const marks = annotations.filter(
          (a) => a.pageIndex === pageIndex && a.segIndex === segIdx && a.type !== 'excerpt',
        );
        return (
          <section key={segIdx} className="scriptbook-segment">
            <h4 className="scriptbook-segment-title">{seg.title}</h4>
            <p className="scriptbook-page-text">{buildMarkedSegments(seg.body, marks, entityNames)}</p>
          </section>
        );
      })}
    </div>
  );

  const leftPage = pages[clampedPage];
  const rightPage = pages[clampedPage + 1];

  // #15: 移动端窄屏 → 单页模式(步进 1);桌面 → 双页模式(步进 2)。
  // 响应 resize,避免首次 mount 后横竖屏切换/窗口缩放时分页步进不更新。
  const [isSinglePage, setIsSinglePage] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768,
  );
  useEffect(() => {
    const onResize = () => setIsSinglePage(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const pageStep = isSinglePage ? 1 : 2;

  const excerptList = annotations
    .filter((a) => a.type === 'excerpt')
    .sort((a, b) => a.createdAt - b.createdAt);
  const excerptCount = excerptList.length;

  return (
    <>
      {/* 剧本图标入口 */}
      <button
        className="scriptbook-trigger"
        onClick={() => { setOpen(true); setCurrentPage(0); }}
        title="我的剧本"
      >
        <span className="scriptbook-trigger-icon">📖</span>
        {excerptCount > 0 && <span className="scriptbook-trigger-badge">{excerptCount}</span>}
      </button>

      {/* 仿纸质书弹窗 */}
      {open && (
        <div className="scriptbook-overlay" onClick={() => setOpen(false)}>
          <div className="scriptbook-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="我的剧本" onClick={(e) => e.stopPropagation()}>
            {/* 顶部工具栏 */}
            <div className="scriptbook-topbar">
              <div className="scriptbook-topbar-left">
                <span className="scriptbook-book-title">我的剧本</span>
                {myChar && <span className="scriptbook-char-name">{myChar.name}</span>}
                <div className="scriptbook-read-progress" title={`已读 ${readPct}%`}>
                  <div className="scriptbook-read-bar">
                    <div className="scriptbook-read-fill" style={{ width: `${readPct}%` }} />
                  </div>
                  <span className="scriptbook-read-pct">{readPct}%</span>
                </div>
              </div>
              <div className="scriptbook-topbar-right">
                {excerptCount > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={exportExcerpts}>
                    导出摘录 ({excerptCount})
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                  关闭
                </button>
              </div>
            </div>

            <div className="scriptbook-tabs">
              <button
                className={`scriptbook-tab${activeTab === 'script' ? ' active' : ''}`}
                onClick={() => setActiveTab('script')}
              >📖 剧本正文</button>
              <button
                className={`scriptbook-tab${activeTab === 'excerpts' ? ' active' : ''}`}
                onClick={() => setActiveTab('excerpts')}
              >📋 我的摘录{excerptCount > 0 && <span className="scriptbook-tab-badge">{excerptCount}</span>}</button>
            </div>

            {activeTab === 'script' && (
            <>
            {/* 书本主体 — onMouseUp 绑定在此，覆盖左右页 */}
            <div className="scriptbook-book" onMouseUp={handleTextSelect}>
              {/* 左页 */}
              <div className="scriptbook-page scriptbook-page-left">
                <div className="scriptbook-page-inner" ref={leftPageRef}>
                  {leftPage ? (
                    renderPage(leftPage, clampedPage)
                  ) : (
                    <p className="scriptbook-page-text scriptbook-page-empty">— 本页无内容 —</p>
                  )}
                </div>
                <div className="scriptbook-page-num">{clampedPage + 1}</div>
              </div>

              <div className="scriptbook-spine" />

              {/* 右页 */}
              <div className="scriptbook-page scriptbook-page-right">
                <div className="scriptbook-page-inner" ref={rightPageRef}>
                  {rightPage ? (
                    renderPage(rightPage, clampedPage + 1)
                  ) : (
                    <p className="scriptbook-page-text scriptbook-page-empty">— 本页无内容 —</p>
                  )}
                </div>
                <div className="scriptbook-page-num">{clampedPage + 2 > totalPages ? '' : clampedPage + 2}</div>
              </div>
            </div>

            {/* 翻页控制 */}
            <div className="scriptbook-pagination">
              <button
                className="btn btn-secondary btn-sm"
                disabled={clampedPage === 0}
                onClick={() => setCurrentPage(Math.max(0, clampedPage - pageStep))}
              >
                ◀ 上一页
              </button>
              <span className="scriptbook-page-indicator">
                {isSinglePage
                  ? `${clampedPage + 1} / ${totalPages}`
                  : `${clampedPage + 1}-${Math.min(clampedPage + 2, totalPages)} / ${totalPages}`}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={clampedPage + pageStep >= totalPages}
                onClick={() => setCurrentPage(Math.min(totalPages - 1, clampedPage + pageStep))}
              >
                下一页 ▶
              </button>
            </div>
            </>
            )}

            {activeTab === 'excerpts' && (
              <div className="scriptbook-excerpts-panel">
                <div className="scriptbook-notes-header">我的摘录</div>
                {excerptList.length > 0 ? (
                  <div className="scriptbook-notes-list">
                    {excerptList.map((a) => (
                      <div key={a.id} className="scriptbook-note-item">
                        <span
                          className="scriptbook-note-text"
                          role="button"
                          tabIndex={0}
                          onClick={() => { setActiveTab('script'); setCurrentPage(a.pageIndex); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setActiveTab('script'); setCurrentPage(a.pageIndex); } }}
                          title={`跳到第 ${a.pageIndex + 1} 页`}
                        >
                          「{a.text.slice(0, 200)}{a.text.length > 200 ? '…' : ''}」
                        </span>
                        {a.source && <div className="scriptbook-note-source">来自 · {a.source}</div>}
                        <button className="scriptbook-anno-del" onClick={() => removeAnnotation(a.id)} title="删除摘录">×</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="scriptbook-page-empty">还没有摘录。选中剧本、线索卡或场景里的文字，点「」即可摘录到此。</p>
                )}
              </div>
            )}
          </div>

          {/* 选中文本工具栏 — 渲染在 overlay 层避免被 modal overflow 裁剪 */}
          {selectionToolbar && (
            <div
              className="scriptbook-toolbar"
              style={{
                position: 'fixed',
                left: `${Math.max(selectionToolbar.x, 80)}px`,
                top: `${Math.max(selectionToolbar.y, 60)}px`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <button
                className="scriptbook-toolbar-btn toolbar-yellow"
                onMouseDown={(e) => { e.preventDefault(); addAnnotation('highlight-yellow'); }}
                title="黄色高亮"
              >
                <span className="toolbar-color" style={{ background: '#F5D76E' }} />
              </button>
              <button
                className="scriptbook-toolbar-btn toolbar-green"
                onMouseDown={(e) => { e.preventDefault(); addAnnotation('highlight-green'); }}
                title="绿色高亮"
              >
                <span className="toolbar-color" style={{ background: '#7DCEA0' }} />
              </button>
              <button
                className="scriptbook-toolbar-btn toolbar-blue"
                onMouseDown={(e) => { e.preventDefault(); addAnnotation('highlight-blue'); }}
                title="蓝色高亮"
              >
                <span className="toolbar-color" style={{ background: '#85C1E9' }} />
              </button>
              <button
                className="scriptbook-toolbar-btn toolbar-underline"
                onMouseDown={(e) => { e.preventDefault(); addAnnotation('underline'); }}
                title="下划线"
              >
                <span style={{ textDecoration: 'underline', fontWeight: 600 }}>U</span>
              </button>
              <button
                className="scriptbook-toolbar-btn toolbar-excerpt"
                onMouseDown={(e) => { e.preventDefault(); addAnnotation('excerpt'); }}
                title="摘录"
              >
                <span>「」</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** 按环节分页:短环节合并填满一页,长环节独占(不硬切,保证段落完整) */
function paginateSegments(segments: ScriptSegment[], charsPerPage: number): ScriptPage[] {
  const pages: ScriptPage[] = [];
  let current: { title: string; body: string }[] = [];
  let currentLen = 0;
  for (const seg of segments) {
    const segLen = seg.body.length;
    if (segLen > charsPerPage) {
      // 超长环节独占一页(整段不切,溢出由页面滚动条处理)
      if (current.length) { pages.push({ segments: current }); current = []; currentLen = 0; }
      pages.push({ segments: [{ title: seg.title, body: seg.body }] });
    } else if (currentLen + segLen > charsPerPage && current.length) {
      // 当前页已满,开新页
      pages.push({ segments: current });
      current = [{ title: seg.title, body: seg.body }];
      currentLen = segLen;
    } else {
      current.push({ title: seg.title, body: seg.body });
      currentLen += segLen;
    }
  }
  if (current.length) pages.push({ segments: current });
  return pages;
}
