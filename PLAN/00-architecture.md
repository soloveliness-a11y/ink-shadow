# 00 · 总体架构

> 先读本文建立全局,再进入各模块文档。本文是架构"宪法",模块文档不得与之冲突。

## 1. 设计哲学

1. **契约驱动**:`packages/schema`(剧本数据契约)是整个系统的脊椎。M1 往它生成、M2 按它出图、M3 按它运行。三方解耦,只认契约。
2. **生产期 / 运行期分离**:
   - **内容生产期(离线)**:M1 生成剧本 → 校验 → M2 配图 → 打包成"剧本包"。慢速 LLM/出图调用全在这里,与玩家无关。
   - **游戏运行期(在线)**:M3 加载已打包的剧本,纯实时交互,**绝不在游戏主循环里调用 LLM 或出图**(阿宁明确:剧本开局前生成)。
3. **服务器权威(server-authoritative)**:游戏状态唯一真相在服务器。客户端只渲染 + 发意图,所有状态变更由服务器裁决广播,杜绝作弊与不一致。
4. **松耦合外部依赖**:open-design 只在 M2 用到,通过 HTTP 调用,可替换。游戏服务器不内嵌 open-design。

## 2. 系统边界图

```
┌─────────────────────── 内容生产期(离线 pipeline) ───────────────────────┐
│                                                                          │
│   ┌──────────┐   剧本JSON    ┌──────────┐   带图剧本包   ┌──────────┐     │
│   │ M1 生成器 │ ───────────> │ 校验器   │ ───────────> │ M2 视觉   │     │
│   │ (Claude) │   schema     │ (zod +   │              │ 管线      │     │
│   └──────────┘              │ 自洽校验) │              └────┬─────┘     │
│                             └──────────┘                   │ HTTP      │
│                                                            ▼           │
│                                              ┌──────────────────────┐  │
│                                              │ open-design daemon    │  │
│                                              │ od media generate     │  │
│                                              │ (gpt-image-2 等)      │  │
│                                              └──────────────────────┘  │
│                                                            │           │
│                                                            ▼           │
│                                              content/<script-id>/      │
│                                                ├ script.json           │
│                                                └ assets/*.png          │
└────────────────────────────────┬─────────────────────────────────────┘
                                  │ 剧本包(静态文件)
                                  ▼
┌─────────────────────── 游戏运行期(在线 · 云服务器) ──────────────────────┐
│                                                                          │
│   浏览器(玩家1)─┐                                                       │
│   浏览器(玩家2)─┤   WebSocket    ┌─────────────────────────────┐         │
│   浏览器(玩家…)─┼──────────────> │ M3 游戏服务器(Node)         │         │
│   浏览器(玩家8)─┘                │  ├ 房间管理 RoomManager       │         │
│        ▲                         │  ├ 环节状态机 PhaseEngine      │         │
│        │  状态广播(JSON patch)  │  ├ 线索/投票/私聊 子系统       │         │
│        └─────────────────────────┤  └ 剧本包加载器 ScriptLoader  │         │
│                                  └─────────────────────────────┘         │
│                                          │ 可选持久化                     │
│                                          ▼                               │
│                                    SQLite / Redis(断线重连快照)          │
└──────────────────────────────────────────────────────────────────────┘
```

## 3. 技术栈选型(及理由)

| 层 | 选型 | 理由 |
|----|------|------|
| 语言 | **TypeScript**(Node 24) | 全栈统一;与 open-design 对齐;schema 类型可跨模块共享,编译期防错 |
| 包管理/Monorepo | **pnpm workspace** | 与 open-design 一致;schema 包被多模块复用,workspace 内链最省心 |
| 数据校验 | **zod** | 运行时校验 + 自动推导 TS 类型,schema 单一来源 |
| M1 LLM | **Claude API**(Opus 主创作 + Sonnet 校验) | 长文创作能力强;有 `claude-api` skill 可参考;结构化输出用 tool/JSON mode |
| M2 出图 | **open-design `od media`**(HTTP) | 已验证可行,免造图像系统;默认 gpt-image-2,国内可切豆包 Seedream |
| M3 实时通信 | **WebSocket**(`ws` 库,不用 Socket.IO) | 协议轻、可控;混合实时/回合只需自定义消息层,Socket.IO 过重 |
| M3 服务端状态 | **内存为主 + SQLite 快照** | 单房间状态量小;SQLite 仅用于断线重连/崩溃恢复,不引入 Redis 复杂度(可后置) |
| M3 前端 | **React 18 + Vite + TypeScript** | 浏览器端;Vite 启动快;可复用 schema 类型渲染 |
| 前端状态 | **Zustand**(轻量) | 比 Redux 轻;游戏状态结构清晰,够用 |
| 部署 | **单 Node 进程(M3)+ 静态托管前端** | 云服务器一个进程跑服务器;前端打包成静态资源由同进程或 CDN 托管 |

> **明确不做**:不做语音(外接会议);不做手机/桌面端;M2 不自研图像模型;M3 MVP 不做匹配大厅(先支持房间码直连,匹配后置)。

## 4. 目录结构(Monorepo)

```
murder-mystery-game/
├── package.json                 # pnpm workspace 根
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── PLAN/                        # 本套计划文档
├── packages/
│   ├── schema/                 # ⭐ 剧本数据契约(被所有模块依赖)
│   │   ├── src/
│   │   │   ├── script.ts       # 剧本结构(角色/线索/环节DAG/结局)
│   │   │   ├── phase.ts        # 环节类型与状态机契约
│   │   │   ├── protocol.ts     # M3 WebSocket 消息契约(C↔S)
│   │   │   ├── visual.ts       # M2 视觉素材描述字段契约
│   │   │   └── index.ts
│   │   └── package.json
│   ├── generator/              # M1 剧本生成引擎
│   │   ├── src/
│   │   │   ├── pipeline/       # 分阶段生成(设定→线索→推理→环节→结局)
│   │   │   ├── prompts/        # 分层 prompt 模板
│   │   │   ├── validate/       # 自洽校验器
│   │   │   └── cli.ts          # `mmg-generate` 命令
│   │   └── package.json
│   ├── visual-pipeline/        # M2 视觉素材管线
│   │   ├── src/
│   │   │   ├── od-client.ts    # open-design media HTTP 客户端
│   │   │   ├── planner.ts      # 从剧本抽取出图任务清单
│   │   │   ├── runner.ts       # 批量出图 + 并发控制 + 重试
│   │   │   └── cli.ts          # `mmg-visualize` 命令
│   │   └── package.json
│   ├── server/                 # M3 游戏服务器
│   │   ├── src/
│   │   │   ├── room/           # RoomManager / 玩家会话
│   │   │   ├── engine/         # PhaseEngine 环节状态机
│   │   │   ├── subsystems/     # clue / vote / chat / privateMsg
│   │   │   ├── loader.ts       # 剧本包加载
│   │   │   └── index.ts        # WebSocket 服务入口
│   │   └── package.json
│   └── client/                 # M3 浏览器前端
│       ├── src/
│       │   ├── net/            # WebSocket 连接 + 协议
│       │   ├── store/          # Zustand 游戏状态
│       │   ├── scenes/         # 各环节 UI(介绍/搜证/讨论/投票/复盘)
│       │   └── main.tsx
│       └── package.json
├── scripts/
│   └── produce.ts              # 内容生产串联:M1 → 校验 → M2 → 打包
└── content/                    # 产物:剧本包(git 忽略大图,JSON 可入库)
    └── <script-id>/
        ├── script.json
        └── assets/
```

## 5. 核心数据流(端到端)

**生产期**(一次性,每个剧本跑一遍):
1. `mmg-generate --players 6 --theme "民国上海" --difficulty hard` → 产出 `script.json`(草稿)
2. 校验器跑 zod 结构校验 + 自洽校验(每个谜底都有可达线索链、无矛盾、每角色有完整动机)→ 不过则回炉重生成对应段落
3. `mmg-visualize content/<id>/script.json` → 读 `visual` 字段 → 调 `od media` 批量出图 → 图落 `assets/` → 路径回填 JSON
4. 打包校验:图片齐全、引用无悬空 → 标记剧本包 `ready`

**运行期**(每局):
1. 房主用剧本包 id 开房 → 服务器 `ScriptLoader` 载入 → 生成房间码
2. 玩家凭房间码连入 → 满员后 `角色分配`(手选或随机)
3. `PhaseEngine` 按剧本的环节 DAG 推进:
   - **回合制环节**(自我介绍/投票):顺序锁,轮到谁谁动
   - **自由环节**(搜证/讨论/线索共享/私聊):并发,操作实时广播
4. 每个状态变更 → 服务器裁决 → 广播 JSON patch → 客户端渲染(文字+对应图片)
5. 终局环节:服务器揭晓真相、结算投票、播放结局文本

## 6. 里程碑与依赖

```
M0 地基 ──> M1 生成器 ──┐
   │                    ├──> 内容生产打通(产出第一个带图剧本包)──┐
   └──> schema 冻结 ────┤                                          ├──> 集成联调 ──> MVP
   │                    └──> M2 视觉管线 ──────────────────────────┘         (一局跑通)
   └──> M3 服务器+客户端(用 mock 剧本包先行,不等 M1)────────────────────────┘
```

| 里程碑 | 出口标准(Done 的定义) |
|--------|----------------------|
| **M0 地基** | pnpm workspace 跑通;`packages/schema` 冻结 v1,导出 TS 类型 + zod;有一份**手写 mock 剧本包**供 M3 先行开发 |
| **M1** | `mmg-generate` 能产出**通过全部校验**的剧本 JSON(6 人本) |
| **M2** | `mmg-visualize` 能给剧本包批量出图、回填、零悬空引用 |
| **M3** | 用 mock 剧本包,4~8 人能从开房到复盘**跑完整局**,断线可重连 |
| **MVP** | M1 真实产物 → M2 配图 → M3 实跑,端到端一局完整 |

> **并行关键**:schema 一旦冻结(M0),M1、M2、M3 三条线可**同时开工**。M3 不必等 M1——先用 mock 剧本包(M0 产出)开发引擎,最后替换为真实剧本包即可。这是压缩工期的核心。

## 7. 给执行者的全局约定

- 所有包 `tsconfig` 继承 `tsconfig.base.json`;`strict: true`。
- 跨模块**只能** import `@mmg/schema`,不得互相 import 私有实现。
- 每个包有独立 `test`;改 schema 必须同步跑全员类型检查。
- 环境变量(open-design key、Claude key)统一走 `.env`,提供 `.env.example`。
- 详细任务拆解与验收见各模块文档与 `05-roadmap-acceptance.md`。
