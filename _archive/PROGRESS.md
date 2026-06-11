# 开发进度(PROGRESS)

> **最后更新**:2026-06-08 (第十一轮 · 阶段 UI + 投票隐私 + 协议收口)
> **一句话状态**:P2 生成器质量、vote 兜底、server 健壮性已保持;本轮继续打磨 Intro/Free/Vote 阶段 UI,`startTest` 纳入正式协议,投票事件日志不再泄露目标,阶段切换自动回到顶部;**54 测试全绿**(实测),系统 Chrome 浏览器检查无横向溢出/无 console error。
> 本文是续接点——下次开工或交给执行模型时,**先读本文**,再按"下一步"行动。

---

## 本轮新增: 第十一轮 · 阶段 UI + 投票隐私 + 协议收口 ✅(codex 线)

> 继续按"按顺序修复/继续打磨"推进:先补可玩阶段的信息密度,再收防作弊与协议类型口子,最后用真实浏览器检查桌面/移动端布局。

| # | 修复 | 文件 | 验证 |
|---|------|------|:---:|
| UI-1 | 自我介绍阶段增加当前发言、自己身份摘要、turnOrder 状态、发言提纲 | `client/src/scenes/Intro.tsx` `client/src/styles/base.css` | ✅ Chrome 检查 |
| UI-2 | 自由搜证/讨论阶段增加调查摘要、最近行动、双栏事件记录 | `client/src/scenes/Free.tsx` `client/src/styles/base.css` | ✅ Chrome 检查 |
| UI-3 | 投票阶段增加已投/待投名单,本人可见自己投票目标,他人只显示已投 | `client/src/scenes/Vote.tsx` `server/src/view.ts` | ✅ server 测试 |
| 防作弊 | `vote_cast` 日志/广播事件不再携带 `targetCharId/targetName`,避免绕过 `votesPublic` 泄露投票目标 | `server/src/engine/PhaseEngine.ts` `client/src/scenes/Free.tsx` | ✅ server 测试 |
| 协议 | `startTest` 纳入 `zClientIntent`;Lobby 去掉临时 `as any`;server switch 走正式分支 | `schema/src/protocol.ts` `server/src/index.ts` `client/src/scenes/Lobby.tsx` | ✅ typecheck |
| UX | 阶段切换 key 改为 `phaseId`,切换阶段时主内容滚回顶部;登录表单 label 绑定输入框 | `client/src/App.tsx` `client/src/scenes/Lobby.tsx` | ✅ Chrome 检查 |

- **server 测试 28 → 29**:投票隐私测试扩展到 `votesPublic`、`state.log`、广播 `event` 三条通道。
- **浏览器检查**:使用系统 Chrome 跑 `http://localhost:8091` 测试模式流程,覆盖 briefing / sequential / free / vote / mobile;各阶段 `scrollTop=0`,桌面与 390px 移动端 `overflow=0`,无 console error。
- **验证**:`pnpm typecheck` ✅ / `pnpm build` ✅ / `pnpm -r test` ✅。

---

## 本轮新增: 第十轮 · M1 生成器质量 + vote 兜底 ✅(codex 线)

> 按用户要求"按顺序修复",在 P0/P1 游戏流程/UI 已补后推进 P2 生成器质量,同时把投票分支兜底从 schema 到 runtime 补上。

| # | 修复 | 文件 | 验证 |
|---|------|------|:---:|
| P2-M1 | S1 支持 `title/synopsis`;assemble 缺失时本地保底 | `generator/src/pipeline.ts` `prompts/index.ts` | ✅ generator 测试 |
| P2-M1 | S4 prompt 改为传入真实可玩角色 ID,不再只给人数 | `generator/src/prompts/index.ts` `pipeline.ts` | ✅ generator 测试 |
| P2-M1 | 新增 `repairScript`:修 turnOrder、搜证 unlocks、round2 storyKey、solutionChain、凶手/投票引用、角色目标 | `generator/src/pipeline.ts` | ✅ 5 个修复测试 |
| P2-M1 | `validateAndRepair` 不再带 error 保存草稿;三轮修复仍失败则抛错 | `generator/src/pipeline.ts` | ✅ typecheck |
| P3-8 | schema 校验搜证可玩性、推理链未知线索、voteResult 必须有 always 兜底 | `schema/src/validate.ts` | ✅ schema 测试 |
| Runtime | vote DAG 无 always 且平票/无命中时,运行时进入 reveal 兜底而非直接 flow_end | `server/src/engine/flow.ts` | ✅ server 测试 |

- **生成器测试 5 → 10**:新增 meta、turnOrder、search unlocks、solutionChain、未解锁 searchable 拦截。
- **schema 测试 5 → 6**:新增投票分支缺 always 兜底拦截。
- **server 测试 27 → 28**:新增 vote 分支缺 always 时仍进入 reveal 的运行时兜底。
- **验证**:`pnpm typecheck` ✅ / `pnpm build` ✅ / `pnpm -r test` ✅。

---

## 本轮新增: 第九轮 · M3 server 健壮性 + 安全加固 ✅(Claude 线)

> 与 codex(generator 剧本质量 + client UI 质感)**错开**,本轮只动 `packages/server/**`。详细问题清单见 [ISSUES.md](ISSUES.md)。

| # | 修复 | 文件 | 验证 |
|---|------|------|:---:|
| P0-1 | sequential 环节轮到的玩家掉线 → 整局永久卡死 | `engine/PhaseEngine.ts` `room/Room.ts` | ✅ 3 复现测试 |
| P0-2 | 房主掉线无转移 → 房间失去控制权 | `room/Room.ts` | ✅ 2 测试 |
| P1-3 | 静态文件路径越界校验(防穿越,含 `..%2f`) | `static.ts`(新)`index.ts` | ✅ 6 测试 |
| P1-4 | 部署路径硬编码 → 支持绝对路径 env | `static.ts` `index.ts` | ✅ 2 测试 |
| P1-5 | `buildEnding`/`flow.ts` 双份多数票判定 → 单点化 | `engine/flow.ts` `view.ts` | ✅ 复用既有测试 |

- **P0-1 核心**:`PhaseEngine.advanceTurnPointer` 自动跳过掉线/已发言成员;`handleDisconnect` 在掉线时复查指针+退出条件;`Room.disconnect` 联动调用。
- **P0-2 核心**:`Room.reassignHost` 房主掉线转移给下一个在线玩家,无人在线则保留待重连(重连不夺回)。
- **P1-3/4 核心**:新增 `static.ts` 导出 `safeResolve`(decode → resolve → 校验落在 base 内)与 `resolveDir`(绝对路径直用 / 相对 `import.meta.url` 解析)。
- **server 测试 14 → 27**(+13:P0-1 ×3、P0-2 ×2、static ×8)。

---

## 阶段总览

| 阶段 | 内容 | 状态 |
|------|------|------|
| 规划 | 6 份计划文档 | ✅ 完成 |
| **M0 地基** | monorepo + 5 包脚手架 + schema + mock 剧本包 | ✅ 完成 |
| **M3 server** | 完整游戏引擎 + HTTP 静态服务 + WS 升级 | ✅ 完成(9 测试) |
| **M3 client** | 完整前端 UI(Vite React) | ✅ 完成(typecheck + build) |
| **M1 生成器** | Claude API + 7 阶段 pipeline + CLI + 确定性修复器 | ✅ 完成(10 测试) |
| **M2 视觉管线** | od-client + planner + runner + CLI | ✅ 完成(7 测试) |
| **集成联调** | server 托管 client + assets + produce 脚本 | ✅ **完成** |
| **M7 视觉嵌入** | schema 扩展 + 前端渲染层 + 生成链路 + 测试修复 | ✅ **完成**(28 测试绿) |
| **真实出图** | 封面 1 + 线索 9(中转站 gpt-5.5) | ✅ **完成**(_mock 23 张全落盘,status=ready) |
| **M8 落盘自愈** | reconcile + 原子写 + promptHash + `--status` | ✅ **完成**(38 测试绿) |

---

## 本轮新增: 真实出图打通 + M8 落盘自愈 ✅

> **成果**:_mock 剧本全部 23 张油画素材真实出图落盘(7 头像+3 场景+2 道具+1 旧线索+1 封面+9 新线索),`meta.status: ready`。出图链路从"能跑"升级为"崩溃可恢复"。

### 出图调用铁律(垮了会话别再踩)
- **端点** `POST https://5yuantoken.org/v1/responses`,**模型 `gpt-5.5`**(不是 gpt-image-2),`tools: [{type:'image_generation'}]`
- **SSE stream 解析两条铁律**(对齐 Python skill 参考,否则 stream 抓不到图→回退 JSON→撞 Cloudflare 524):
  1. **不跳过 `partial_image` 事件**——图常只在 partial 里,抓到第一个 base64 就返回
  2. **同 event 多行 `data:` 用 `\n` 拼接后再 parse**——逐行 parse 大 JSON 会失败被吞
- **限流 240-300s/张**(<240s 触发 429),失败重试 4 次,单请求 300s 超时
- 详见 [packages/visual-pipeline/README.md](packages/visual-pipeline/README.md)

### M8 落盘自愈(`visual-pipeline`)— 防新会话误判
- **痛点**:`.visual-progress.json` 残留"幽灵 done"(标完成但文件已删/已变),新会话误以为已完成而跳过。
- **reconcile**:`run()` 启动先以**文件存在为唯一真相**校正三方状态(文件 / `script.json` asset / progress):清幽灵、文件在→done、文件缺→pending、prompt 变(promptHash 不符)→重出。
- **原子写**:`*.png.tmp` → `renameSync`,防写一半崩溃留半文件。
- **promptHash**:`zVisualAsset` 加可选字段(prompt+styleHint+aspect+styleGuide 的 sha256),改 prompt 自动作废旧图。
- **`--status`**:只读状态表(id/kind/文件/asset/progress/指纹/action),新会话进来先跑它,别用 jq 肉眼判断。
- 实战验证:本轮 session 被关 2 次、进程 kill 2 次,每次重启 reconcile 自愈 + `--resume` 精准补跑,16→17→22 从不重跑已完成的。
- 改动:`schema/visual.ts`(promptHash)、`planner.ts`(`listAllVisualEntries`+`promptFingerprint`)、`runner.ts`(reconcile+原子写+`status()`)、`cli.ts`(`--status`)、+2 reconcile 测试。

---

## 上一轮: M7 视觉物料嵌入 ✅

> **根因诊断**:油画素材质量顶级(7 头像+3 场景+2 道具+1 线索,gpt-5.5 出图,风格统一),但断在两处——(A) 前端组件用 `name.charAt(0)` 文字占位,server 已下发的 `avatar`/`sceneImages` 路径无人接;(B) 封面/线索图通道(schema/planner/generator)压根没建。本轮全量修复。

### Schema 契约扩展(`packages/schema/src/`)
- `visual.ts`:`zVisualKind` 增加 `'cover'`、`'clue'`(原仅 avatar/scene/prop)
- `script.ts`:`zScriptMeta` 增加 `cover: zVisualSpec.optional()`
- `protocol.ts`:`zClientStateView` 增加 `propImages`(propId→路径)

### 前端渲染层(`packages/client/src/`)— UI 让位给油画素材
- 新建 `lib/asset.ts`:`assetUrl(scriptId, path)` → `/content/<id>/<path>`
- 新建 `components/Visual.tsx`:`Avatar` / `Portrait`(立绘卡,名字浮底部渐变) / `Lightbox`(全屏灯箱)
- `base.css` 新增画框类:`.cover-art / .char-portrait / .scene-hero / .clue-thumb / .lightbox`(金边+暗角+圆角)
- 7 个场景组件接图,**全部带无图回退**:`Lobby`(封面)、`Assigning`/`Vote`(立绘卡)、`Briefing`(立绘大图)、`CharacterSidebar`(小头像)、`Free`(场景头图+线索缩略图+灯箱)、`Reveal`(凶手立绘)
- Free 默认 tab 改 `effectiveTab`(跟随可用 tab,修 tab 栏/内容不一致)

### 生成链路补全
- `visual-pipeline/planner.ts`:新增封面任务(path=`meta.cover`,mock 无 cover 时 planner 补 spec)
- `generator/pipeline.ts assemble`:给每条 clue 配 `visual`(kind clue,title+content 合成 prompt);给 `meta.cover` 配封面 prompt
- **修隐藏 bug**:`scripts/produce.ts` 仍用 open-design 时代的 `daemonUrl`/`concurrency` 构造 VisualRunner → 改为 `{ baseUrl, apiKey, model, resume }`,对齐 gpt 端口;`.env.example` 更新为 `MMG_API_URL`/`MMG_API_KEY`/`MMG_MODEL`
- 新建 `scripts/sync-assets.ts`:扫描 assets/ 按命名规则反向回填 script.json(修复历史回填不一致)

### 测试基础设施修复(非功能,但阻塞验证)
- `visual-pipeline` 测试:① 改动态期望值(不再硬编码 13,不耦合 _mock 磁盘状态);② runner 测试改用 `mkdtempSync` 隔离临时目录(**根治 stub 测试污染生产 _mock/assets/**)
- `server` 测试:`--test-force-exit`(PhaseEngine/Room 阶段 timer 未 `unref()`,node v24 保活致进程不退出)

### 验证(浏览器实测)
立绘大图、7 头像、场景缩略图、灯箱大图全部正确渲染;封面/线索图降级为占位(待出图)。油画素材与暗色 UI 协调统一。

---



### Server 集成 (`packages/server/src/index.ts` 重写)
- **HTTP 静态服务**: `node:http` .createServer,无额外依赖
  - `/` → client dist (SPA + fallback)
  - `/content/<scriptId>/assets/` → 剧本图片
  - `/ws` → WebSocket 升级
- **自动扫描**: `content/` 目录自动发现剧本包(跳过 `_`/`.` 开头)
- **中文路径修复**: `fileURLToPath` 替代手动 URL 解码
- **WS join 时序修复**: pending session 在 `room.join()` 内的 `sendToPlayer` 可正确找到 ws

### Room 修复 (`packages/server/src/room/Room.ts`)
- `handleIntent` 支持 lobby 阶段 `hostAdvance` → `startAssigning`

### Produce 脚本 (`scripts/produce.ts`)
- 一键流水线: M1 生成 → schema 校验 → 自洽校验 → M2 配图 → 打包到 `content/`
- `pnpm produce --players 6 --theme "民国上海谍战" --visual-model stub`

### 根 package.json
- `pnpm start` = build client + start server
- `pnpm dev` = start server only (开发模式)
- `pnpm produce` = 一键生产剧本包

---

## E2E 验证结果

| 验证项 | 结果 |
|--------|------|
| HTTP 静态文件(client dist) | ✅ 200, 160KB |
| 剧本 assets(图片) | ✅ 200 |
| SPA fallback | ✅ 200 |
| WebSocket 连接 | ✅ |
| 6 人 join + room 创建 | ✅ |
| hostAdvance → assigning | ✅ |
| 6 人 selectChar → playing | ✅ |
| 游戏流程:lobby→assigning→playing→briefing→sequential→free | ✅ |
| 完整 phase chain 走通 | ✅ (搜证阶段 600s timer 为设计行为) |

---

## 全部测试汇总

| 包 | 测试数 | 状态 |
|----|--------|------|
| @mmg/schema | 6 | ✅ 全绿 |
| @mmg/server | 29 | ✅ 全绿 |
| @mmg/generator | 10 | ✅ 全绿 |
| @mmg/visual-pipeline | 9 | ✅ 全绿 |
| **总计** | **54** | **✅** |

> 测试数为 2026-06-08 第十一轮 `pnpm -r test` 实测值。

6 包 typecheck 全过。client Vite 构建通过。

---

## 快速启动

```bash
cd murder-mystery-game
pnpm install

# 启动游戏(构建 client + 启动 server)
pnpm start

# 浏览器打开
open http://localhost:8080
```

## 生产新剧本

```bash
# 生成 + 配图(需 ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-... pnpm produce --players 6 --theme "民国上海谍战" --difficulty hard

# 仅 stub 模式出图(免 key)
pnpm produce --players 6 --theme "现代都市悬疑" --visual-model stub

# 跳过出图
pnpm produce --players 6 --theme "古风宫廷" --skip-visual
```

---

## 文件地图

```
murder-mystery-game/
├── README.md / PROGRESS.md
├── PLAN/00..05
├── package.json              # start/dev/produce scripts
├── scripts/produce.ts        # ✅ M1→M2→pack 一键流水线
├── packages/
│   ├── schema/               # ✅ 契约脊椎(7 源码 + 6 测试)
│   ├── server/               # ✅ 游戏服务器(HTTP+WS+静态+29 测试)
│   ├── client/               # ✅ 浏览器前端(18 源码 + Vite)
│   ├── generator/            # ✅ 剧本生成(6 源码 + 10 测试)
│   └── visual-pipeline/      # ✅ 视觉管线(planner+runner+image-client+cli + 9 测试)
└── content/_mock/script.json # ✅ mock 剧本包(23 visual assets 全 done, status=ready)
```

---

## 可选后续

1. **生产剧本**: 用 `pnpm produce` 生成新剧本(需 ANTHROPIC_API_KEY),再 visual-pipeline 出图
2. **真实生成验收**: 用 `pnpm produce --skip-visual` 产一份新本,人工检查故事质量和游玩节奏
3. **游戏性/UI 继续打磨**: 角色目标、线索公开节奏、主持人操作提示、投票后的等待体验、移动端布局
4. **公网部署 / git 基线**: 初版功能稳定后再处理客户端部署与版本控制
