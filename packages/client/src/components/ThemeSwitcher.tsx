import { useState } from 'react';
import { THEMES, getTheme, setTheme } from '../lib/theme.js';

/**
 * 主题切换器 —— 5 个色块圆点,点击切换。
 * 放在 Header 右侧。移动端收为图标,点击展开。
 */
export function ThemeSwitcher() {
  const [current, setCurrent] = useState(getTheme());
  const [expanded, setExpanded] = useState(false);

  const handlePick = (id: string) => {
    setTheme(id);
    setCurrent(id);
    setExpanded(false);
  };

  const active = THEMES.find((t) => t.id === current) ?? THEMES[0]!;

  return (
    <div className="theme-switcher" onMouseLeave={() => setExpanded(false)}>
      {/* 当前主题色块(点击展开/收起) */}
      <button
        className="theme-swatch theme-active"
        style={{ background: active.swatch }}
        onClick={() => setExpanded((e) => !e)}
        title={`主题: ${active.name}（点击切换）`}
        aria-label="切换主题"
      />
      {expanded && (
        <div className="theme-picker">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-swatch${t.id === current ? ' selected' : ''}`}
              style={{ background: t.swatch }}
              onClick={() => handlePick(t.id)}
              title={t.hint}
              aria-label={t.name}
            >
              <span className="theme-picker-label">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
