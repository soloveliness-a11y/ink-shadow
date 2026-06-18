/**
 * 主题管理 —— 5 个主题,localStorage 持久化,document.documentElement.dataset.theme 驱动 CSS 变量切换。
 *
 * 主题定义在 tokens.css 的 [data-theme="xxx"] 块里。这里只管 id/名称/色标(供 UI 渲染圆点)和读写。
 */

export interface ThemeDef {
  id: string;
  name: string;
  /** 切换器圆点的颜色(取各主题的 accent) */
  swatch: string;
  /** 一句话描述(供 tooltip) */
  hint: string;
}

/** 全部主题(顺序 = 切换器显示顺序)。gold 是默认(向后兼容:无 data-theme 时走 :root) */
export const THEMES: ThemeDef[] = [
  { id: 'gold', name: '黑金', swatch: '#C8A66A', hint: '经典民国·豪门气派' },
  { id: 'celadon', name: '青瓷水墨', swatch: '#6B9E8E', hint: '古风文人·清雅书卷' },
  { id: 'crimson', name: '暗血红月', swatch: '#B8444C', hint: '恐怖悬疑·压抑戏剧' },
  { id: 'dawn', name: '晨光浅色', swatch: '#C9BFA8', hint: '护眼模式·长时阅读' },
  { id: 'violet', name: '紫罗星空', swatch: '#9A7BC8', hint: '科幻奇幻·神秘现代' },
];

const STORAGE_KEY = 'mmg:theme';
const VALID_IDS = new Set(THEMES.map((t) => t.id));

/** 当前主题 id(从 data-theme 读,无则默认 gold) */
export function getTheme(): string {
  if (typeof document === 'undefined') return 'gold';
  return document.documentElement.dataset.theme || 'gold';
}

/** 设置主题:写 data-theme + localStorage */
export function setTheme(id: string): void {
  if (!VALID_IDS.has(id)) return;
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* 隐私模式/配额满:无碍,本次仍生效 */
  }
}

/**
 * 从 localStorage 恢复主题(应在 React 渲染前调用,避免主题闪烁)。
 * 放在 main.tsx 顶部、createRoot 之前。
 */
export function restoreTheme(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  // gold 不设 data-theme(走 :root 默认,省一次属性写入)
  if (saved && VALID_IDS.has(saved) && saved !== 'gold') {
    document.documentElement.dataset.theme = saved;
  }
}
