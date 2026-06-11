# BGM 接入指南 (M3 剧本杀)

> 给剧本杀系统接入背景音乐的轻量级方案。基于 **Howler.js** 封装, 已与现有 phase 路由打通。

## 1. 架构

```
packages/client/
├── public/audio/bgm/           # 静态资源 (mp3/ogg)
├── src/audio/
│   ├── bgmSlots.ts            # 槽位定义 (lobby/briefing/intro/free/vote/reveal/finished)
│   ├── bgmEngine.ts           # 单例 BGM 引擎 (Howler 封装)
│   ├── useBgmState.ts         # React Hook: 订阅状态
│   └── useBgmPhaseRouter.ts   # 自动把 phaseKind 映射到槽位
└── src/components/
    ├── BgmControl.tsx         # 静音/取消静音浮动按钮
    └── BgmControl.css
```

## 2. Phase → BGM 映射

| game status  | phaseKind   | 触发槽位    | 默认音量 | 淡入/淡出 (ms) |
|--------------|-------------|------------|---------|----------------|
| `lobby`      | -           | `lobby`    | 0.45    | 1200 / 800     |
| `assigning`  | -           | `briefing` | 0.50    | 1000 / 800     |
| `playing`    | `briefing`  | `briefing` | 0.50    | 1000 / 800     |
| `playing`    | `intro`     | `intro`    | 0.55    | 1500 / 1000    |
| `playing`    | `free`      | `free`     | 0.60    | 2000 / 1500    |
| `playing`    | `vote`      | `vote`     | 0.65    | 1200 / 1000    |
| `playing`    | `reveal`    | `reveal`   | 0.70    | 2500 / 2000    |
| `finished`   | -           | `finished` | 0.55    | 2000 / 1500    |

映射函数在 `useBgmPhaseRouter.ts`, 如需新增 phase, 改 `resolveSlot()` 即可。

## 3. 关键设计决策

### 3.1 资源懒加载

`bgmEngine.playSlot()` 只在切换到目标槽位时才 `new Howl()`, 切换期间旧的资源会被 `unload()` 释放。

### 3.2 浏览器 autoplay policy

未与用户交互前, `Howl.play()` 会被浏览器静默拒绝。`useBgmUnlock()` 在首次 `pointerdown` / `keydown` 后调用 `bgmEngine.unlock()`, 引擎会把挂起的"目标槽位"立即恢复。

### 3.3 安全降级

- 资源文件缺失 → 控制台 warn, 不抛错
- 用户静音 → 记录目标槽位但不加载音频, 解锁/取消静音时按目标槽位恢复
- 移动端 `onplayerror` → 自动 `unlock` 事件后重试

### 3.4 状态持久化

音量 `mmg:bgm:volume` 和静音 `mmg:bgm:muted` 写入 `localStorage`, 玩家下次进入沿用偏好。

## 4. 上线前 QA 清单

- [ ] 把 BGM mp3 放到 `public/audio/bgm/`, 文件名匹配 `bgmSlots.ts` 中的 `src`
- [ ] 7 个槽位至少各 1 首, `vote` 建议 2~3 首随机
- [ ] 验证移动端 (iOS Safari) 首次交互后能正常播放
- [ ] 验证静音按钮持久化 (刷新后仍生效)
- [ ] 验证 phase 切换时无音频爆音 (淡入淡出正常)
- [ ] `reveal` 一次性, 不循环
- [ ] 总包大小 ≤ 15MB

## 5. 用户控制

`<BgmControl />` 已挂在 `App.tsx` 顶层, 浮动在屏幕右上角。点击 = 静音切换。
状态通过 `useBgmState` 订阅, 静音时图标变为喇叭带斜线, 并暂停当前播放。

## 6. 扩展点

### 6.1 加新槽位

1. `bgmSlots.ts` 加 BgmSlot 联合类型
2. `BGM_SLOTS` 加新配置
3. `useBgmPhaseRouter.ts` 的 `resolveSlot` 加新映射

### 6.2 加随机选曲

`tracks` 数组里加多个文件, `pickTrack()` 会自动随机抽。

### 6.3 加淡出 stop

`bgmEngine.stop()` 已实现, 调用即可, 600ms 淡出后释放。

## 7. 升级到 AI 生曲 (Suno / Udio / MiniMax Music)

QA 阶段用 CC0 库验证流程, 跑通后再升级。

### 7.1 路线 A: 预生成 (推荐起步)

```
1. 用 Suno API / Udio / MiniMax Music 按剧本生成
2. 一次性下载, 文件名套 bgmSlots.ts 约定
3. 部署到 public/audio/bgm/
4. 整个流程无代码改动
```

**Suno API 接入** (Suno 是当前最成熟的方案):

```typescript
// 示意代码, 需在服务端代理 (避免暴露 API Key)
async function generateBgm(prompt: string): Promise<string> {
  const res = await fetch('https://api.suno.ai/v1/generate', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.SUNO_KEY}` },
    body: JSON.stringify({
      prompt,
      make_instrumental: true,
      wait_audio: true,
    }),
  });
  const { audio_url } = await res.json();
  return audio_url; // 下载到 public/audio/bgm/
}
```

成本估算: 5~20 美元 / 剧本 (1 主题 + 5 变奏)

### 7.2 路线 B: 运行时按需生成

> 适合每个剧本在开局时即时生成专属 BGM 的"高级感"产品

```
Lobby 阶段: 选剧本 → 调生成 API → 等待 30s~2min → 缓存到 CDN
之后所有 phase 共享这套 BGM
```

需要在 `packages/server` 加异步任务队列 + CDN 缓存层, 改造较大, 建议路线 A 跑稳后再做。

## 8. 与现有代码的耦合点

唯一修改:
- `packages/client/src/App.tsx` (顶部 import + `<BgmControl />` 挂载 + 两个 Hook)
- `packages/client/package.json` (`howler`, `@types/howler`)

未触碰: `store/game.ts`, 任何 scene 组件, schema, server。
