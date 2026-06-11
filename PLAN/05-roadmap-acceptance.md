# 05 · 路线图、验收与风险

> 本文是项目级总调度:里程碑排期、需求覆盖对照、端到端验收、风险登记、Post-MVP、以及**执行者的第一步**。

## 1. 里程碑与并行策略

```
              ┌─────────────────────────────────────────────┐
  M0 地基 ────┤ pnpm workspace + tsconfig + packages/schema  │
 (串行,阻塞) │ 冻结 schema@1.0.0 + 手写 mock 剧本包          │
              └──────────────────┬──────────────────────────┘
                                 │ schema 冻结后,三线并行 ↓
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
   M1 生成器                 M2 视觉管线               M3 联机引擎
   (Claude pipeline)        (od media 集成)          (用 mock 包先行,不等 M1)
        │                        │                        │
        └────────┬───────────────┘                        │
                 ▼                                         │
        内容生产打通(产出首个带图剧本包)                  │
                 └──────────────────┬──────────────────────┘
                                    ▼
                          集成联调:真实剧本包 → M3 实跑
                                    ▼
                                  MVP ✅
```

**并行是压缩工期的关键**:`schema` 一冻结,M1/M2/M3 立即同时开工。M3 全程可用 M0 的 mock 剧本包开发,**最后一步**才替换为 M1+M2 的真实产物。

## 2. 工作包与出口(规模:S/M/L)

| 里程碑 | 工作包 | 规模 | 出口标准 |
|--------|--------|:---:|----------|
| **M0** | workspace 脚手架 + `schema` 全类型 + zod + `validateScript` + mock 剧本包 | M | schema 冻结打 tag;mock 包能被 M3 加载 |
| **M1** | Claude 调用层 + S1~S7 pipeline + 自洽校验回环 + CLI | L | `mmg-generate` 产出过全校验的 6 人本 |
| **M2** | od-client + planner + runner + 回填打包 | M | `mmg-visualize` 给剧本包零悬空配图 |
| **M3** | server(房间/引擎/子系统/裁剪/重连)+ client(net/store/scenes) | L | mock 包跑通完整局,断线可重连 |
| **集成** | `scripts/produce` 串联 M1→校验→M2→打包 + M3 加载真实包 | S | 端到端一局完整 |

> 建议执行顺序:**M0 → (M1 ∥ M3 起步) → M2 → 集成**。若单线执行(一个模型顺序做),按 M0→M1→M2→M3→集成,M3 用 mock 包验证,最后接真实包。

## 3. 需求覆盖对照(对照立项时的技术要点,确认无遗漏)

| 立项要求 | 落在哪 | 状态 |
|----------|--------|------|
| 剧本生成(角色/线索/推理/结局) | M1 + schema | ✅ 全覆盖 |
| 视觉素材生成(头像/场景/道具) | M2 + `visual` 契约 | ✅ 复用 od media |
| 接入 open-design | M2 § open-design 集成 | ✅ 已实测可行 |
| 4~8 人联机 | M3 房间 + 人数校验 | ✅ |
| C-S 架构、云服务器主机 | M3 server-authoritative | ✅ |
| 剧本加载 | M3 `loader.ts` + 剧本包 | ✅ |
| 角色分配 | M3 assigning 阶段 | ✅ 手选+随机 |
| 实时通信 | M3 WebSocket 协议 | ✅ |
| 投票表决 | M3 vote 子系统 + DAG 分支 | ✅ |
| 线索分享 | M3 clue 子系统(搜证/公开) | ✅ |
| 剧本数据管理 | schema + 剧本包(JSON+assets) | ✅ |
| 素材资源处理 | M2 回填 + 服务器静态托管 | ✅ |
| 游戏状态同步 | M3 RuntimeState + stateSync | ✅ |
| 网络通信 | M3 `ws` + 重连 + 持久化 | ✅ |
| **玩家匹配** | **MVP 用房间码直连;匹配大厅 → Post-MVP** | ⚠️ 有意后置 |
| **语音** | **外接会议系统(本系统不做)** | ⚠️ 有意排除 |

## 4. 端到端 MVP 验收清单(总)

- [ ] `scripts/produce --players 6 --theme "..."` 一条命令产出 `status=ready` 的带图剧本包。
- [ ] 剧本逻辑人工通读无硬伤(凶手可推、角色平衡、无矛盾)。
- [ ] 视觉素材齐全、风格统一、无 stub 漏网。
- [ ] 6 人(6 浏览器)用该真实剧本包跑通:开房→分配→briefing→介绍→搜证→讨论→投票→复盘。
- [ ] 投票分支生效(不同结果不同结局)。
- [ ] 断线重连恢复完整;防作弊单测全绿。
- [ ] 部署到一台云服务器,公网 6 人实测一局。

## 5. 风险登记册

| # | 风险 | 模块 | 缓解 |
|---|------|------|------|
| R1 | 剧本逻辑不自洽/不可解 | M1 | 逆向生成(真相先行)+ 9 条自洽校验 + critic pass + 局部回炉 |
| R2 | 同角色多图形象不一致 | M2 | 固定外貌锚点 prompt;进阶 i2i(`--image` 参考图) |
| R3 | 出图失败/成本失控 | M2 | stub 联调免费验证;并发限流;`providerError` 拦截;国内模型(豆包)备选 |
| R4 | 实时并发竞态 | M3 | 单房间 intent 串行队列;服务器权威 |
| R5 | 作弊(看到真相/他人私密) | M3 | `buildView` 严格裁剪 + 防泄露单测断言 |
| R6 | open-design daemon 依赖不稳 | M2 | 同机部署;离线 pipeline,不影响游戏运行期 |
| R7 | schema 变更引发全员返工 | 全局 | 契约先行 + 冻结 + 版本号;改契约需显式同步 |
| R8 | LLM 结构化输出不稳定 | M1 | tool use 强制 JSON + 重试 + 中间态落盘续跑 |
| R9 | 单 Node 进程承载多房间瓶颈 | M3 | MVP 单机够用;Post-MVP 按房间分片/水平扩展 |

## 6. Post-MVP 迭代方向(排除在 MVP 外,记录备查)

- 玩家匹配大厅 / 公开房间列表 / 排队
- 增量状态同步(JSON patch)优化带宽
- 角色一致性进阶(角色种子 / LoRA)
- DM(主持人)模式与手动控场
- 剧本市场 / UGC 上传 / 难度评分回流调参
- 移动端适配
- 语音内嵌(若不再依赖外接会议)
- 多凶手 / 阵营本 / 阵营胜负结算

## 7. 成本与资源提示

- **M1**:Opus 主创作,单本生成约数十次 LLM 调用(开 prompt caching 显著降本)。建议先小批量验证质量再放量。
- **M2**:单本约 15~20 张图。`gpt-image-2` 按张计费;预算敏感可用国内豆包 Seedream。先 `stub` 跑通流程不花钱。
- **M3**:云服务器一台(2C4G 起步,单机多房间),带宽随并发房间数估算。
- **Key 准备**:`ANTHROPIC_API_KEY`(M1)、`OD_OPENAI_API_KEY` 或国内出图 provider key(M2)。

## 8. 执行者的第一步(启动指引)

**第 0 步:初始化 monorepo**
```bash
mkdir -p murder-mystery-game && cd murder-mystery-game
pnpm init
# 建 pnpm-workspace.yaml: packages: ['packages/*']
# 建 tsconfig.base.json(strict: true,target ES2022,module NodeNext)
mkdir -p packages/{schema,generator,visual-pipeline,server,client}/src scripts content
```

**第 1 步:写 `packages/schema`(契约先行,阻塞全员)**
- 按 `01-script-schema.md` 落全部 interface + zod schema。
- 实现 `validateScript()` 结构校验。
- **手写一份 mock 剧本包** `content/_mock/script.json`(6 人,标准流程 DAG,assets 用占位图),供 M3 立即开工。
- 冻结:`git tag schema@1.0.0`。

**第 2 步:三线并行启动**
- M1:`packages/generator` 接 Claude,先打通 S1 真相内核。
- M3:`packages/server` 用 `content/_mock` 加载,先跑通 join + briefing。
- M2:`packages/visual-pipeline` 用 `--model stub` 打通 planner→runner→回填。

**第 3 步:按各模块文档任务清单推进,逐项过验收。**

---

> 计划到此完整。执行者请从 `README.md` 入,按本文 §8 启动,遇歧义回到对应模块文档;模块文档与 `00-architecture` 冲突时以 `00` 为准,数据结构一律以 `01-schema` 为准。
