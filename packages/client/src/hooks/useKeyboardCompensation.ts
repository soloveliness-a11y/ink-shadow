import { useEffect } from 'react';

/**
 * 移动端键盘弹起补偿:iOS Safari 键盘不缩小 layout viewport,导致固定在底部的
 * 输入框(composer-bar/theory-composer)被键盘遮挡,用户看不到自己输入的内容。
 *
 * 方案:监听 visualViewport resize,把可见高度写入 --vh CSS 变量。
 * base.css 里用 --vh 的容器(.app-shell/.free-action-panel)会自动收缩,
 * 底部输入框随之上移到键盘上方。
 *
 * 桌面端 visualViewport.height === window.innerHeight,--vh 不变,无副作用。
 */
export function useKeyboardCompensation(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const vh = vv.height;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
}
