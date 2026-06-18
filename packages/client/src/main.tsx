import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { restoreTheme } from './lib/theme.js';
import './styles/base.css';

// 渲染前恢复主题(避免主题闪烁:首帧就应用用户选择的主题色)
restoreTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
