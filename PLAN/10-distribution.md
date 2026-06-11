# 10 · 分发与无感迭代(朋友局)

> 目标:把已开发完成的 M3 联机系统,以**零成本**分发给不在同一局域网的朋友,浏览器点链接即玩;后续改代码后,朋友**刷新即新版**,无需重装、无需手动操作。
> 场景边界:**朋友小范围游玩**,非全网上线、非商业化。据此**砍掉**一切重型基建(数据库集群、CDN、水平扩展、账号体系)。
> 本文是面向 coding agent 的实施工单,可直接据此执行。

## 0. 一句话结论

现有系统**联机能力已完备**(WebSocket + 服务器权威 + 房间码 + 主持人控制 + 断线重连),分发缺的只有三样:**一个公网链接、一个版本号、一个心跳**。三个任务,P0 两个、P1 一个,合计约 50 行新代码 + 一个脚本。

## 1. 现状盘点(已存在,无需重做)

| 能力 | 落点 | 状态 |
|------|------|------|
| 实时通信 | `packages/server/src/index.ts`(`ws` + HTTP 同端口 8080) | ✅ |
| 房间机制 | `room/RoomManager.ts` + `room/Room.ts`(房间码 `generateRoomCode`) | ✅ |
| 服务器权威 | `engine/PhaseEngine.ts`(DAG 状态机,单房间 intent 串行) | ✅ |
| 主持人控制 | `hostAdvance` intent + `isHost` 校验 | ✅ |
| 状态同步 | 全量 `stateSync` + `view.ts` 可见性裁剪 | ✅ |
| 断线重连 | `connection.ts` 指数退避重连 + `sessionToken` 复用 `PlayerSlot` | ✅ |
| 会话持久化 | `store/game.ts` 的 `localStorage('mmg:last-session')` | ✅ |
| 协议自适应 | `createGameUrl()` 自动 `https→wss` / `http→ws` | ✅ |
| 客户端构建 | Vite content-hash 文件名 + server 对 `.html` 设 `no-cache` | ✅ |
| 静态托管 | server `serveStatic` 托管 `client/dist` + `/content` 资源 | ✅ |

> **关键洞察**:client 的 `createGameUrl()`([net/connection.ts:133](../packages/client/src/net/connection.ts#L133))已根据页面协议自适应 WS scheme。这意味着**只要 server 通过 HTTPS 隧道暴露,前端零改动**即可跑通 WSS。

## 2. 封装形态决策

| 方案 | 朋友的操作 | 迭代无感度 | 结论 |
|------|-----------|-----------|------|
| **纯 Web + 隧道** | 点链接 | 刷新即新版 | ✅ **采用** |
| PWA(加 manifest + SW) | 点链接,可选"加到主屏" | 同上,且可离线壳 | 🟡 二期锦上添花 |
| Electron | 下载装包、每次更新重装 | 反向倒退 | ❌ 排除 |

**决策**:**纯 Web 部署 + Cloudflare 隧道**。朋友只需一个链接,无安装。PWA 仅在"想要桌面图标/全屏沉浸感"时二期再加(纯增量,不阻塞)。Electron 直接排除 —— 它要求朋友下载客户端,与"点链接即玩"的目标相悖。

## 3. 公网入口决策(让外网朋友能连)

朋友不在同一局域网,需把本机 `localhost:8080` 暴露成公网 HTTPS 地址。零成本隧道对比:

| 方案 | 账号 | 域名 | WSS 支持 | 给朋友的体验 | 结论 |
|------|:---:|:---:|:---:|------|------|
| **Cloudflare Quick Tunnel** | 不需要 | 自动分配 | ✅ 原生 | 点 `*.trycloudflare.com` 链接 | ✅ **采用** |
| ngrok(免费档) | 需要 | 自动分配 | ✅ | 有访问警告页 + 连接数限制 | 🟡 备选 |
| Tailscale Funnel | 需要 | 需 tailnet | ✅ | 配置较重 | ❌ 过重 |
| 自建云服务器 | — | 需买 | ✅ | 最稳但要花钱+运维 | ❌ 超出场景 |

**决策**:**Cloudflare Quick Tunnel**(`cloudflared tunnel --url`)。无需账号、无需域名、无需配置,一条命令拿到 `https://<随机>.trycloudflare.com`,自动 HTTPS,原生支持 WebSocket。

> ⚠️ **Quick Tunnel 的已知限制**(写进给朋友的说明里):
> - URL **每次重启隧道都会变** —— 每次开局把新链接发群里即可;想要固定域名需登录 Cloudflare 建 Named Tunnel(二期,需自有域名)。
> - 是临时隧道,**不保证 SLA** —— 朋友局够用,别拿来跑正式活动。

## 4. 自动更新机制(迭代无感)

**现有机制已覆盖 80%**:Vite 构建产物带 content-hash(`index-a3f9.js`),server 对 `index.html` 设 `Cache-Control: no-cache`([index.ts](../packages/server/src/index.ts) `serveFile`)。因此**朋友刷新页面 → 拉到新 index.html → 引用新 hash 资源 → 自动加载新版**。

缺的 20% 是**协议版本对不齐的静默故障**:你改了 `ClientIntent`/`ServerMessage` 结构、重新构建并重启 server,但朋友的页面还停留在旧标签页没刷新 —— 旧前端发旧协议,新 server 看不懂,表现为"按钮点了没反应",且无任何提示。Task 2 解决这个。

## 5. 联机方案对比(回应"WebSocket vs WebRTC")

| 维度 | WebSocket(现状) | WebRTC |
|------|------------------|--------|
| 拓扑 | C-S 星型,服务器中转 | P2P 网状(或 SFU) |
| 服务器权威 | ✅ 天然契合 | ❌ 逻辑在客户端,作弊难防 |
| 主持人控制 | ✅ 服务器统一裁决 | 🟡 需额外信令层 |
| 防作弊裁剪 | ✅ `view.ts` 已做 | ❌ P2P 下人人收到全量 |
| NAT 穿透 | 无需(都连服务器) | 需 STUN/TURN,TURN 要花钱 |
| 适用场景 | **回合制/状态同步类**(本系统) | 音视频流、低延迟竞技 |

**结论**:本系统是**服务器权威 + 可见性裁剪 + 主持人控场**的回合制游戏,WebSocket 是唯一正确选择,**WebRTC 不适用于状态同步**(会破坏防作弊模型)。WebRTC 唯一的潜在用途是二期**玩家语音**,且与现有 WS 正交、互不干扰 —— 详见 §8。

## 6. 任务清单(交付物)

### Task 1 · 一键公网分发脚本(P0)

**交付物**:新增 `分发给朋友.command`(macOS 双击可执行),做三件事:
1. 复用现有启动逻辑(构建 client + 起 server,参照 `启动游戏.command`);
2. 检测/引导安装 `cloudflared`(`brew install cloudflared`);
3. 起隧道 `cloudflared tunnel --url http://localhost:8080`,把输出里的 `https://*.trycloudflare.com` 链接**高亮打印 + 自动复制到剪贴板**(`pbcopy`),提示"把这个链接发给朋友"。

**关键点**:
- server 与隧道是两个进程,脚本需后台起 server、前台起隧道(或反之),Ctrl+C 要能一起收掉(`trap` 清理)。
- server 默认监听 `localhost:8080` 已足够(隧道从本机出站连 Cloudflare,无需对公网开端口)。
- **不改任何 server/client 代码** —— 这个任务纯运维脚本。

**验收**:
- [ ] 双击脚本 → 终端打印一条 `https://*.trycloudflare.com` 链接且已在剪贴板。
- [ ] 手机关 WiFi 用 4G 打开该链接 → 进入 Lobby → 输昵称建房 → 房间码可用。
- [ ] 另一台设备用房间码加入 → 两端实时同步。
- [ ] Ctrl+C 后 server 与隧道进程都退出(无残留占用 8080)。

### Task 2 · 协议版本协商(P0)

**交付物**:前后端共享一个协议版本号,握手时比对,不匹配则提示朋友刷新。约 30 行,改 3 个文件。

**实现要点**:
1. **`packages/schema/src/protocol.ts`**:导出常量 `export const PROTOCOL_VERSION = 1;`(每次改 `ClientIntent`/`ServerMessage`/`ClientStateView` 结构时手动 +1)。
2. **客户端发 join 时带版本**:`join` intent 已有结构([protocol.ts:11](../packages/schema/src/protocol.ts#L11)),给它加可选字段 `clientVersion?: number`,在 `store/game.ts` 两处 `conn.send({ kind: 'join', ... })`([store/game.ts:128](../packages/client/src/store/game.ts#L128) 与 [:192](../packages/client/src/store/game.ts#L192))带上 `clientVersion: PROTOCOL_VERSION`。
3. **server 校验**:`index.ts` 的 `handleIntent` 处理 `join` 时,若 `intent.clientVersion` 存在且 `!== PROTOCOL_VERSION`,回 `{ kind: 'error', code: 'version_mismatch', message: '游戏已更新,请刷新页面' }`,不继续 join。
4. **客户端提示**:`errorMap.ts` 给 `version_mismatch` 配文案;收到该 error 时弹一个**带"刷新"按钮**的提示(或直接 `location.reload()` 前给 1.5s toast)。

**为何不做自动强刷**:朋友可能正在读本/输入,粗暴 reload 会丢输入框内容。先 toast + 按钮,把刷新时机交给用户。

**验收**:
- [ ] 版本一致时 join 流程完全不受影响(回归)。
- [ ] 手动把 server 端版本号 +1 不重启前端 → 旧页面发 join → 收到"游戏已更新"提示。
- [ ] 刷新后版本对齐 → 正常进房。

### Task 3 · WebSocket 心跳保活(P1)

**背景**:剧本杀有大量"读本/搜证"静默期,期间无消息往来。隧道(及部分移动网络/NAT)会**回收空闲 TCP 连接**,导致玩家"假死"——页面看着在,实际连接已断,要等下次操作才触发重连。

**交付物**:server 侧 WS 心跳(`ws` 库标准 ping/pong),约 20 行,只改 `index.ts`。

**实现要点**:
- `wss.on('connection')` 时给每个 ws 标记 `isAlive = true`,监听 `ws.on('pong', () => isAlive = true)`。
- 一个 `setInterval`(如 30s):遍历所有 ws,`isAlive === false` 的 `ws.terminate()`(触发 client 重连);否则置 `isAlive = false` 并 `ws.ping()`。
- `wss.on('close')` 时 `clearInterval`。
- 客户端**无需改动**:浏览器自动回 pong;真断了 `connection.ts` 的指数退避重连会接管。

**验收**:
- [ ] 进房后挂机 5 分钟不操作,连接保持(server 日志无异常断开)。
- [ ] 手动 kill server → client 显示"重连中" → 重启 server 后自动恢复并补全状态。

## 7. 明确排除(记录理由,避免 agent 过度设计)

| 不做 | 理由 |
|------|------|
| Electron / 安装包 | 朋友要装客户端,违背"点链接即玩" |
| WebRTC 做状态同步 | 破坏服务器权威 + 防作弊裁剪模型 |
| 数据库 / Redis | 内存房间对朋友局足够;重启丢局可接受(见 §9) |
| 账号 / 登录体系 | 房间码 + 昵称 + sessionToken 已够 |
| 水平扩展 / 多实例 | 单 Node 进程扛朋友局绰绰有余 |
| Named Tunnel / 固定域名 | 需自有域名;每次发新链接可接受 |

## 8. 二期可选增强(非阻塞,想做再做)

- **PWA 壳**:加 `manifest.json` + 极简 service worker(仅缓存 app shell),朋友可"加到主屏"得到全屏沉浸入口。注意 SW 缓存策略要对 `index.html` 走 network-first,否则会和"刷新即新版"打架。
- **玩家语音**:WebRTC 的正当用途。与现有 WS **正交** —— WS 继续管游戏状态,WebRTC 只传音频流,用现有 WS 通道做信令(交换 SDP/ICE)。P2P 小局(≤6 人)无需 SFU;NAT 失败兜底才需 TURN(要花钱)。或更省事:直接让朋友开个微信/Discord 语音,本系统不碰。
- **固定入口**:若隧道链接每局变化造成困扰,登录 Cloudflare 建 Named Tunnel 绑自有域名(需买域名),链接从此固定。

## 9. 给阿宁的运维提醒(非代码)

- **server 重启 = 内存房间全丢**。朋友玩到一半时,**别改代码**(`tsx` 监听会热重启)、**别 Ctrl+C**。要发版请等本局结束。
- 真要"中途发版不丢局":`Room.ts` 已预留 `stateSnapshots` 字段,序列化落盘 + 启动时恢复即可实现热更新不丢状态 —— 但这是 P2,朋友局先不需要,故不列入上面任务。
- 你的笔记本就是服务器:**合盖休眠 = 全员掉线**。开局期间让机器保持唤醒(`caffeinate` 或电源设置)。

## 10. 实施顺序建议

```
Task 1(脚本,今晚就能拉朋友开局)
   └─> Task 2(协议版本,迭代无感的基石)
          └─> Task 3(心跳,静默期防假死)
                 └─> [可选] PWA 壳 / 语音
```

> Task 1 完成即可首次实战;Task 2/3 是稳定性增强,可在第一次朋友局之后按体感补。
