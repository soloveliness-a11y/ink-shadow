# 墨影 · AI 剧本杀适配系统

> 将市场已有剧本适配为可联机游玩的数字化剧本包。AI 生成剧本结构 → 自动配套油画风视觉素材 → 4~8 人浏览器端联机。

## 定位

这不是一个「从零生成剧本」的工具，而是一个**剧本适配系统**——把现有的剧本杀作品（豪门系列等）转化为标准化 JSON 剧本包，配上视觉素材，跑在联机引擎上。

```
市场剧本（PDF/文字） → 人工/AI 适配 → 标准化剧本包（JSON + 素材） → 浏览器联机游玩
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动（构建 + 运行）
./start.sh

# 或开发模式（跳过构建）
./start.sh --dev
```

打开 `http://localhost:8080`，输入昵称即可开房。双击 `启动游戏.command` 也可。

**一键公网分享**：双击 `分发给朋友.command`，自动起 Cloudflare 隧道，把链接发给朋友直接玩。

## 适配流程

### 1. 准备剧本素材

将原始剧本放入 `content/<剧本ID>/` 目录，按规范创建以下文件：

```
content/my-mystery/
  meta.json                 ← 元信息（标题/难度/时长）
  characters/
    order.json              ← 角色加载顺序
    c_victim.json           ← 死者
    c_suspect_a.json        ← 嫌疑人（每人一个文件）
    ...
  clues.json                ← 所有线索
  scenes.json               ← 搜证场景
  props.json                ← 道具（可选）
  phases.json               ← 环节定义
  flow.json                 ← 环节 DAG 流程图
  truth.json                ← 真相（仅服务端）
```

完整字段规范见 [content/SCRIPT-SPEC.md](content/SCRIPT-SPEC.md)。

### 2. 适配方式

| 方式 | 适用场景 | 说明 |
|------|---------|------|
| **AI 辅助生成** | 从文字剧本提取结构 | 用 `content/PROMPT.md` 作为 prompt 给 LLM，生成全套 JSON |
| **人工编写** | 已有清晰结构 | 按 SCRIPT-SPEC 手动填写各 JSON 文件 |
| **拆分脚本** | 已有单体 script.json | `node scripts/split-script.mjs content/xxx/script.json` |
| **模板复制** | 新建剧本 | 复制 `content/_template/` 目录，替换内容 |

### 3. 出图与校验

```bash
# 一键生产（生成 + 校验 + 出图）
pnpm produce --players 6 --theme "校园密室"

# 仅出图（剧本已就绪）
pnpm exec tsx packages/visual-pipeline/src/cli.ts content/my-mystery/meta.json

# 查看出图状态
pnpm exec tsx packages/visual-pipeline/src/cli.ts --status content/my-mystery/meta.json

# 断点续出（中断后跳过已完成）
pnpm exec tsx packages/visual-pipeline/src/cli.ts --resume content/my-mystery/meta.json
```

### 4. 启动游玩

剧本放入 `content/` 目录后，重启服务器即可自动加载。

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 语言 | TypeScript 5.6, Node 24 | 全栈统一 |
| Monorepo | pnpm 10 workspace | 5 个包 |
| 前端 | React 18 + Zustand + Vite 6 | 单页应用，响应式适配桌面/手机 |
| 后端 | Node HTTP + ws (WebSocket) | 无框架，纯手工状态机 |
| Schema | Zod | 运行时类型校验 + TS 类型推导 |
| 剧本生成 | Claude API (Anthropic SDK) | 分层 prompt + 自洽校验 |
| 视觉出图 | gpt-image (中转站) + sharp | 批量出图，自动 WebP 压缩 |
| BGM | Howler.js | 7 阶段 × 多首 = 33 首背景音乐 |

## 架构

```
┌─────────────┐     WebSocket      ┌──────────────┐
│   Client    │◄──────────────────►│    Server     │
│  React+Zust │  protocol v3 JSON  │  PhaseEngine  │
└─────────────┘                    │  RoomManager  │
                                   └──────┬───────┘
                                          │ 加载
                                   ┌──────▼───────┐
                                   │   Content     │
                                   │  剧本包 (JSON) │
                                   └──────────────┘

┌─────────────┐   ┌───────────────┐   ┌──────────────┐
│  Generator  │   │ VisualPipeline │   │   Schema     │
│  Claude API │   │  gpt-image +  │   │  Zod 契约包   │
│  分层 prompt │   │  sharp→WebP   │   │  共同基准     │
└─────────────┘   └───────────────┘   └──────────────┘
```

**核心设计**：剧本自带环节 DAG（有向无环图），引擎是通用状态机解释器。不同剧本只需换 JSON，不改代码。

## 项目结构

```
murder-mystery-game/
├── packages/
│   ├── schema/           # Zod 契约包：数据类型 + 校验 + 协议定义
│   ├── server/           # 游戏引擎：PhaseEngine DAG + Room + WebSocket
│   ├── client/           # React 前端：7 个阶段场景 + 响应式布局
│   ├── generator/        # 剧本生成器：Claude API + 自洽校验 + repair
│   └── visual-pipeline/  # 视觉管线：批量出图 + WebP 压缩 + 指纹追踪
├── content/
│   ├── _mock/            # 内置剧本「公馆惊魂·一九三五」（示例）
│   └── _template/        # 新剧本模板
├── scripts/              # 工具脚本（生成/出图/拆分/同步）
├── PLAN/                 # 架构蓝图（设计文档）
├── 豪门系列/              # 待适配的市场剧本（已 gitignore）
└── start.sh              # 一键启动
```

## 游戏流程

```
大厅(选剧本) → 分配角色 → 角色简介 → 轮流自述
→ 搜证×N轮(场景探索/线索获取/公开/私聊) → 投票(平票自动决胜) → 真相揭晓
```

每个环节由剧本 DAG 定义，引擎自动推进。支持计时器、房主手动推进、搜证次数限制。

## 引擎特性

- **DAG 环节流**：`always | voteResult | voteTie | flag` 四种边条件
- **平票决胜**：自动进入限制投票目标的决胜轮
- **断线保护**：掉线玩家自动跳过（sequential 环节不卡死）
- **反作弊视图**：每个玩家只看到自己该看到的信息（线索/投票状态/凶手身份）
- **测试模式**：Bot 填充 + 手动推进，方便剧本预览调试

## 前端特性

- 7 个阶段场景：Lobby / Assigning / Briefing / Intro / Free / Vote / Reveal
- 响应式布局：桌面端侧栏 + 手机端底部抽屉
- 资源优化：图片 `loading=lazy` + 后台预加载 + 服务端 ETag/304 缓存
- BGM 自动切换：7 阶段各配多首，随机播放
- 案情速记：本地存储笔记本，不公开给其他玩家

## 内置剧本

**公馆惊魂·一九三五** — 民国上海·公馆命案

- 6 人本 / 普通难度 / 约 180 分钟
- 7 个角色（含死者）、23 条线索、3 个场景
- 19 个环节（含搜证×2 + 投票 + 平票决胜 + 7 个结局揭示）

## 工具脚本

```bash
# 拆分单体 script.json 为目录结构
node scripts/split-script.mjs content/新剧本/script.json

# 同步资产回填（文件 → script.json）
pnpm exec tsx scripts/sync-assets.ts 新剧本
```

## 测试

```bash
pnpm -r test          # 全量测试
pnpm typecheck        # TypeScript 类型检查
pnpm --filter @mmg/client build  # 构建前端
```

| 包 | 测试数 | 覆盖范围 |
|----|--------|----------|
| @mmg/schema | 6 | 结构校验、DAG 可达性、引用完整性 |
| @mmg/generator | 10 | 剧本校验、repair 修复、solutionChain 映射 |
| @mmg/server | 31 | 房间生命周期、DAG 推进、掉线保护、投票/平票、反作弊视图 |
| @mmg/visual-pipeline | 9 | 任务规划、stub 出图、断点续出、幽灵修复、promptHash 重出 |

**56 tests, 0 failures.**

## 文档

| 文档 | 内容 |
|------|------|
| [content/SCRIPT-SPEC.md](content/SCRIPT-SPEC.md) | 剧本创作规范（完整字段 + 设计原则） |
| [content/PROMPT.md](content/PROMPT.md) | LLM 生成剧本的 Prompt 模板 |
| [PLAN/00-architecture.md](PLAN/00-architecture.md) | 总体架构、模块边界、技术栈选型 |
| [PLAN/01-script-schema.md](PLAN/01-script-schema.md) | 剧本数据契约（TS 类型 + Zod + DAG） |
| [PLAN/02-m1-script-generation.md](PLAN/02-m1-script-generation.md) | 剧本生成引擎 |
| [PLAN/03-m2-visual-pipeline.md](PLAN/03-m2-visual-pipeline.md) | 视觉管线 |
| [PLAN/04-m3-multiplayer-engine.md](PLAN/04-m3-multiplayer-engine.md) | 联机引擎 |
| [PLAN/05-roadmap-acceptance.md](PLAN/05-roadmap-acceptance.md) | 里程碑与验收标准 |
| [PLAN/10-distribution.md](PLAN/10-distribution.md) | 分发方案 |
