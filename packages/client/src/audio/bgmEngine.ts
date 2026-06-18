/**
 * BGM 引擎 (Howler.js 封装)
 * ==========================
 * 职责:
 *   1) 接收"切换到哪个槽位"的请求,做淡入淡出
 *   2) 维护全局静音 / 音量状态
 *   3) 暴露 React-friendly 的订阅接口 (subscribeBgm)
 *
 * 设计原则:
 *   - 单实例: 全局一个 BGM 引擎, 避免多实例抢音频焦点
 *   - 资源懒加载: 只在需要播放时才创建 Howl
 *   - 安全降级: 资源缺失/未配置/用户未交互时, 不报错
 *   - 用户优先: 必须在用户首次交互后才尝试播放 (浏览器 autoplay policy)
 */

import { Howl } from 'howler';
import { BGM_SLOTS, BgmSlot, pickTrack, pickNextTrack, type BgmTrack, type BgmSlotConfig } from './bgmSlots.js';

const STORAGE_KEY_VOLUME = 'mmg:bgm:volume';
const STORAGE_KEY_MUTED = 'mmg:bgm:muted';

export interface BgmEngineState {
  currentSlot: BgmSlot | null;
  currentTrackId: string | null;
  volume: number;        // 0-1
  muted: boolean;
  isPlaying: boolean;
  unlocked: boolean;     // 是否解锁 (用户已交互)
}

type Listener = (s: BgmEngineState) => void;

class BgmEngine {
  private howl: Howl | null = null;
  private currentSlot: BgmSlot | null = null;
  private currentTrack: BgmTrack | null = null;
  private volume: number;
  private muted: boolean;
  private unlocked = false;
  private listeners = new Set<Listener>();
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  // #2: 保存淡出/暂停用的 setTimeout handle,快速连续切歌时先清掉旧的,
  // 避免旧 timer 误 unload/pause 已替换的新 howl(音乐突然中断)
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];
  // 静默存盘的"目标音量", 用于静音切换时保留
  private preMuteVolume: number | null = null;

  constructor() {
    this.volume = this.loadVolume();
    this.muted = this.loadMuted();
  }

  // ----- 订阅 -----
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  // #2: 可取消的 setTimeout 包装,所有淡出/延迟暂停都走这里
  private defer(fn: () => void, ms: number): void {
    const handle = setTimeout(() => {
      this.pendingTimers = this.pendingTimers.filter((h) => h !== handle);
      fn();
    }, ms);
    this.pendingTimers.push(handle);
  }

  /** 清掉所有 pending 的延迟回调(快速连续切换/卸载时调用) */
  private cancelPendingTimers(): void {
    for (const h of this.pendingTimers) clearTimeout(h);
    this.pendingTimers = [];
  }

  private snapshot(): BgmEngineState {
    return {
      currentSlot: this.currentSlot,
      currentTrackId: this.currentTrack?.id ?? null,
      volume: this.volume,
      muted: this.muted,
      isPlaying: !!this.howl && this.howl.playing(),
      unlocked: this.unlocked,
    };
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  // ----- 解锁 (autoplay policy) -----
  /** 必须在用户首次点击/触摸后调用, 才能真正出声 */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.emit();
    // 解锁后若有 pending 槽位, 立即恢复
    if (this.currentSlot) {
      this.playSlot(this.currentSlot, /*force*/ true);
    }
  }

  // ----- 核心: 切换槽位 -----
  /**
   * 切换到指定 BGM 槽位
   * - 同一槽位: 啥也不做 (幂等)
   * - 跨槽位: 旧音淡出 -> 新音淡入
   * - 资源缺失: 静默跳过 (不报错)
   */
  playSlot(slot: BgmSlot, force = false) {
    if (this.muted) {
      this.currentSlot = slot;
      this.emit();
      return;
    }

    if (!force && this.currentSlot === slot && this.howl?.playing()) {
      return;
    }

    const track = pickTrack(slot);
    if (!track) {
      this.currentSlot = slot;
      this.currentTrack = null;
      this.stopAndDispose();
      this.emit();
      return;
    }

    const cfg = BGM_SLOTS[slot];
    this._crossfade(slot, track, cfg);
  }

  /**
   * 同槽位切换到另一首（随机切歌按钮）
   * - 排除当前曲目，在剩余曲目中随机选
   * - 只有 1 首时静默跳过
   */
  switchTrack() {
    const slot = this.currentSlot;
    if (!slot) return;
    const { track, changed } = pickNextTrack(slot, this.currentTrack?.id ?? '');
    if (!track || !changed) return;
    const cfg = BGM_SLOTS[slot];
    this._crossfade(slot, track, cfg);
  }

  /** 淡出旧音 → 加载并淡入新音 */
  private _crossfade(slot: BgmSlot, track: BgmTrack, cfg: BgmSlotConfig) {
    // #2: 快速连续切歌时,先丢弃上一轮未执行的淡出/暂停回调,避免误伤新 howl
    this.cancelPendingTimers();
    if (this.howl && this.howl.playing()) {
      const oldHowl = this.howl;
      oldHowl.fade(oldHowl.volume(), 0, cfg.fadeOutMs);
      this.defer(() => { try { oldHowl.unload(); } catch { /* noop */ } }, cfg.fadeOutMs + 80);
    } else {
      this.stopAndDispose();
    }

    this.currentSlot = slot;
    this.currentTrack = track;
    const newHowl = new Howl({
      src: [track.src],
      loop: cfg.loop,
      volume: 0,
      html5: false,
      preload: true,
      onload: () => {
        if (this.currentTrack?.id !== track.id) return;
        if (!this.unlocked) { this.emit(); return; }
        newHowl.play();
        newHowl.fade(0, cfg.defaultVolume, cfg.fadeInMs);
        this.emit();
      },
      onloaderror: () => {
        console.warn(`[BGM] Failed to load track: ${track.src}`);
        this.currentTrack = null;
        this.emit();
      },
      onplayerror: () => {
        newHowl.once('unlock', () => newHowl.play());
      },
    });
    this.howl = newHowl;
    this.emit();
  }

  // ----- 控制 -----
  stop() {
    if (!this.howl) return;
    this.cancelPendingTimers();
    this.howl.fade(this.howl.volume(), 0, 600);
    this.defer(() => this.stopAndDispose(), 650);
    this.currentSlot = null;
    this.currentTrack = null;
    this.emit();
  }

  private stopAndDispose() {
    this.cancelPendingTimers();
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    if (this.howl) {
      try { this.howl.unload(); } catch { /* noop */ }
      this.howl = null;
    }
  }

  setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    this.volume = clamped;
    this.saveVolume(clamped);
    if (this.howl && !this.muted) {
      this.howl.volume(clamped);
    }
    this.emit();
  }

  toggleMute() {
    if (this.muted) {
      // 取消静音: 恢复
      this.muted = false;
      this.saveMuted(false);
      const target = this.preMuteVolume ?? this.volume;
      this.preMuteVolume = null;
      // #3: 清掉静音时排队的延迟 pause,否则快速切换时它会在已恢复播放的 howl 上触发暂停
      this.cancelPendingTimers();
      if (this.howl) {
        // 静音超过 fadeOutMs 后 howl 已被 pause,只设音量不够,必须 play() 才能恢复
        this.howl.volume(target);
        if (!this.howl.playing()) this.howl.play();
      } else if (this.currentSlot && this.unlocked) {
        // 之前静音时切过槽位, 恢复时按当前目标槽位开播
        this.playSlot(this.currentSlot, true);
      }
    } else {
      // 静音
      this.muted = true;
      this.preMuteVolume = this.howl?.volume() ?? this.volume;
      this.saveMuted(true);
      if (this.howl) {
        this.howl.fade(this.howl.volume(), 0, 300);
        this.defer(() => this.howl?.pause(), 320);
      }
    }
    this.emit();
  }

  // ----- 持久化 -----
  private loadVolume(): number {
    try {
      const v = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (v == null) return 0.55;
      const n = parseFloat(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.55;
    } catch { return 0.55; }
  }

  private saveVolume(v: number) {
    try { localStorage.setItem(STORAGE_KEY_VOLUME, String(v)); } catch { /* noop */ }
  }

  private loadMuted(): boolean {
    try { return localStorage.getItem(STORAGE_KEY_MUTED) === '1'; } catch { return false; }
  }

  private saveMuted(m: boolean) {
    try { localStorage.setItem(STORAGE_KEY_MUTED, m ? '1' : '0'); } catch { /* noop */ }
  }
}

export const bgmEngine = new BgmEngine();
