# 问题清单与修复方案 · server / 工程基础设施线

> **归属**:Claude(M3 server 运行期 + 工程基础设施 + 出图链路)。与 codex(generator 剧本质量 + client UI 质感)**错开**,本清单不涉及 `packages/generator/**` 与 `packages/client/**`。
> **日期**:2026-06-08
> **验证基线**(亲测):54 测试全绿(schema 6 / generator 10 / visual-pipeline 9 / server 29),6 包 `typecheck` 全过,client build 过。
> **进度**:P0-1 / P0-2 / P1-3 / P1-4 / P1-5 / P2 生成器质量 / P3-8 vote 兜底 / 投票隐私 / 阶段 UI 打磨 ✅ 已修复;P2-6 git 暂缓到初版稳定后。
> **验证程度标注**:✅ 实测/代码+数据确认 ｜ ⚠️ 代码分析(未运行复现) ｜ 💡 审查建议

---

## 一览表

| # | 问题 | 严重度 | 验证 | 位置 | 碰 codex 边界? | 状态 |
|---|------|:---:|:---:|------|:---:|:---:|
| P0-1 | sequential 环节轮到的玩家掉线 → 整局永久卡死 | 🔴 高危真bug | ✅ | PhaseEngine | 否 | ✅ 已修 |
| P0-2 | 房主掉线不回 → 房间无 host,特权操作全失效 | 🟠 中 | ✅ | Room | 否 | ✅ 已修 |
| P1-3 | 静态文件路径缺显式越界校验(防御加固) | 🟡 加固 | ✅ 复核降级 | server/index | 否 | ✅ 已修 |
| P1-4 | 部署路径硬编码(换目录即崩) | 🟡 健壮性 | ⚠️ | server/index | 否 | ✅ 已修 |
| P1-5 | `buildEnding` 与 `flow.ts` 双份多数票判定逻辑 | 🟡 一致性 | ✅ | view / flow | 否 | ✅ 已修 |
| P2-6 | 整个项目非 git 仓库,并行改码无回滚网 | 🔵 流程 | ✅ | 项目根 | 否(双方共享) | ⏸ 初版后再 init |
| P2-7 | 文档滞后(测试数/文件数/git 声称) | 🔵 低 | ✅ | README/PROGRESS | ⚠️ 需约定 | ✅ 已校准 PROGRESS/ISSUES |
| P3-8 | schema 缺"vote 平票兜底"校验,可放过脆弱 DAG | 🟣 中 | ✅ | schema/validate | **是(改契约)** | ✅ 已修 |
| P3-9 | 真实出图(封面+9 线索)未打通 | ✅ 已完成 | ✅ | visual-pipeline | 否 | — |

---

## P0 — 真 bug(纯 server,零冲突,优先级最高)

### P0-1 🔴 sequential 环节轮到的玩家掉线 → 整局永久卡死  ✅已验证

**位置**:[PhaseEngine.ts:104](packages/server/src/engine/PhaseEngine.ts#L104)(`isCurrentTurn` 拦截)、[PhaseEngine.ts:169](packages/server/src/engine/PhaseEngine.ts#L169)(`markActed` 推进指针)、[PhaseEngine.ts:257](packages/server/src/engine/PhaseEngine.ts#L257)(`checkExit`)

**现象**:`sequential` 环节(如自我介绍)按 `turnOrder` 轮流发言。若轮到的玩家掉线:
- 其他玩家发言被 `isCurrentTurn` 挡回 `not_your_turn`(`turnOrder[turnIndex] === charId` 不成立);
- 掉线玩家无法行动,`turnIndex` 永不前进;
- `checkExit` 的 `allActed` 虽只统计 connected 玩家,但指针卡在掉线者身上,后续在线玩家也轮不到 → **死局,且无 timer 兜底**。

**根因**:turn 指针推进只在"当前指针玩家本人行动"时发生,没有"掉线者自动跳过"机制;且 sequential 环节无超时逃生阀。

**验证**:✅ 代码路径 + mock DAG 双重确认。mock 的 `p_intro` 正是 `sequential`+`exit=allActed`+无 `timerSec`(见 [content/_mock/script.json](content/_mock/script.json) phases)。6 人局中任一人在自我介绍轮到时掉线即触发。
> 注:为代码逻辑+数据结构推断,尚未跑掉线场景实测。**建议修复时先补一个 failing test 复现,再修**(闭环自检)。

**修复方案**(推荐 A+C):
- **A 掉线自动跳过(核心)**:`markActed` 推进 `turnIndex` 后,加 `while` 跳过 `turnOrder` 中已掉线/无对应在线玩家的成员;`enter` 初始化 sequential 时,若开头成员就掉线也要跳;玩家 `disconnect` 时若掉的正是当前 turn 持有者,触发一次 `checkExit/advance` 复查。
- **C 房主兜底(可选增强)**:房主可手动"跳过当前发言者"(新增 intent,test/正式通用)。
- 保险阀:可给 sequential 环节支持可选 `turnTimeoutSec`,但属契约改动(碰 schema,见 P3-8 注意事项),非必须。

**边界**:纯 `packages/server/**`,不碰 codex。
**估时**:中(改 PhaseEngine ~30 行 + 复现测试 + disconnect 联动)。

---

### P0-2 🟠 房主掉线不回 → 房间无 host,特权操作全失效  ✅已验证

**位置**:[Room.ts:121](packages/server/src/room/Room.ts#L121)(host 仅在首个 join 时确定)、[Room.ts:141](packages/server/src/room/Room.ts#L141)(`disconnect` 只置 `connected=false`)

**现象**:`hostId` 只在"第一个加入者"时赋值,此后**无任何转移逻辑**。所有特权操作(`selectScript`/`startAssigning`/`randomAssign`/`hostAdvance`/`startTestMode`)都校验 `hostId`。房主断线后,若**重连**(`sessionToken===playerId`)可恢复;但若**彻底离开/换设备无 token** → 房间永久无可用 host,游戏无法开始或无法手动推进 `hostAdvance` 环节(如 mock 的 `p_discuss1/p_discuss2`)→ 死锁。

**根因**:缺 host 转移机制。

**验证**:✅ grep 确认 `hostId` 仅 L122 赋值一次,`disconnect` 不动 host,无转移代码路径。

**修复方案**:`disconnect` 中若掉线者是当前 host 且尚有其他 connected 玩家 → 转移给下一个在线玩家(置其 `isHost=true`、更新 `this.hostId`、清旧标志保唯一),广播。无人在线则保留待重连。重连老 host 不自动夺回(避免抖动)。

**边界**:纯 `packages/server/**`。
**估时**:小(~15 行 + 测试)。

---

## P1 — 安全 / 健壮性(纯 server,零冲突)

### P1-3 🟡 静态文件缺显式越界校验(防御加固) ✅复核后降级

**位置**:[index.ts:62](packages/server/src/index.ts#L62)(`/content`)、[index.ts:78](packages/server/src/index.ts#L78)(client dist,**无 `..` 处理**)

**复核结论(诚实修正)**:初判为高危路径遍历,实测后**降级为加固项**。实测:明文 `../` 与 `%2e%2e` 均被 `new URL().pathname` 规范化吃掉;`..%2f` 中的 `%2f` 不被 `path.join` 当分隔符 → **未找到可落地 PoC**。当前靠 URL 规范化**隐式**兜住,client dist 路径甚至完全没写 `..` 防护,纯属侥幸。

**根因**:防护是隐式的、依赖 URL 构造器行为,非显式校验;`/content` 用字符串 `replace` 也是脆弱写法。

**修复方案**:抽 `safeResolve(base, urlPath)`:`const r = resolve(base, '.'+decodedRelPath); return r===base || r.startsWith(base+sep) ? r : null;` 越界返回 403。两条路径(content + client dist)统一走它,替换现有 `replace(/\.\./g,'')`。defense-in-depth。

**边界**:纯 server。
**估时**:小(~15 行 + 越界单测)。

---

### P1-4 🟡 部署路径硬编码 ⚠️代码分析

**位置**:[index.ts:12-13](packages/server/src/index.ts#L12)

**现象**:`SCRIPT_DIR='../../../content'`、`CLIENT_DIR='../../client/dist'` 均相对 `import.meta.url`(即 server 源码位置)。编译产物目录层级一变、或部署到不同结构即找不到剧本/前端。

**修复方案**:env 优先且支持**绝对路径**;为绝对路径时直接用,否则按现有相对 `import.meta.url` 解析。加一个 `resolveDir(envVal, fallbackRelUrl)` helper。

**边界**:纯 server。
**估时**:小。

---

### P1-5 🟡 `buildEnding` 与 `flow.ts` 双份多数票判定逻辑 ✅已验证

**位置**:[view.ts:194](packages/server/src/view.ts#L194)(`buildEnding` 内联 tally)vs [flow.ts:19](packages/server/src/engine/flow.ts#L19)(`evaluateCondition`)

**现象**:`flow` 决定"进入哪个 reveal 环节",`view` 决定"展示哪个 ending",两处各写一份 voteResult 多数票统计。目前逻辑一致,但任何一边改动都可能漂移,导致"DAG 实际走向"与"玩家看到的结局"不符。

**已确认可合一**:`zEnding.condition` 即 `zFlowCondition`([script.ts:86](packages/schema/src/script.ts#L86)),同类型。

**修复方案**:`flow.ts` 导出纯函数 `evaluateFlowCondition(cond, state)` 与 `tallyVotes(votes)`;`view.buildEnding` 复用,删除内联副本。

**边界**:纯 server。
**估时**:小(抽函数 + 改两处调用)。

---

## P2 — 工程基础设施

### P2-6 🔵 整个项目非 git 仓库 ✅已验证

**现象**:`git status` → not a repository。但 README/PLAN 多处声称 `git tag schema@1.0.0`、"git 忽略大图"。**两个 AI 并行改同一份代码,却没有任何版本控制/回滚安全网**——这是并行协作最大的隐性风险。

**修复方案**:`git init` + 合理 `.gitignore`(node_modules、dist、content/*/assets 大图、.env、.visual-progress.json)+ 首次提交当前绿状态作为基线。建议补 `schema@1.0.0` tag 兑现文档声称。

**边界**:项目根,双方共享收益。**需阿宁拍板**(动项目结构,虽纯增益且可逆)。
**估时**:小。

---

### P2-7 🔵 文档滞后 ✅已验证

**现象**:PROGRESS 写"26/28 测试"实际 33;README 写"client 14 源码"实际 17 文件;声称的 git tag 不存在;`scripts/` 多了 `stub-gen.ts`/`real-gen.ts` 文档未提。

**修复方案**:校准 PROGRESS/README 数字与文件地图。
**边界**:⚠️ 文档双方都可能改,**需先和 codex/阿宁约定谁负责文档同步**,避免互相覆盖。建议:各自只在自己改动范围内追加,留一份共享 PROGRESS 由一方收口。
**估时**:小。

---

## P3 — 需协调 / 需资源

### P3-8 🟣 schema 缺"vote 平票兜底"校验 ✅已修

**位置**:[validate.ts:138](packages/schema/src/validate.ts#L138)(现仅校验"存在可达 reveal")

**现象**:现有校验保证"DAG 里存在一条能到 reveal 的路径",但**不保证 vote 环节平票/无多数时有出路**。若生成器产出"vote 出边全是 voteResult、无 always 兜底"的 DAG,平票时 `selectNextPhase` 返回 null → `flow_end` → 在投票后直接 finished,**跳过揭晓**。mock 安全(`p_vote` 有 always 兜底边),但生成剧本不保证。

**修复结果**:
- `packages/schema/src/validate.ts`:含 `voteResult` 出边的 vote 环节必须另有 `always` 兜底出边。
- `packages/schema/tests/validate.test.ts`:新增"投票分支缺 always 兜底"测试。
- `packages/generator/src/pipeline.ts`:生成器 `repairScript` 会补齐投票引用与分支兜底。
- `packages/server/src/engine/flow.ts`:运行时最后保险,无 voteResult 命中时进入 voteResult reveal 出边,不直接 `flow_end`。
- `packages/server/tests/integration.test.ts`:新增平票无 always 时仍进入 reveal 的测试。

**验证**:`pnpm typecheck` / `pnpm build` / `pnpm -r test` 全绿。

---

### P3-9 ✅ 真实出图(封面 + 9 线索图)已打通  2026-06-08 完成

**结果**:_mock 剧本 23 张油画素材全部真实出图落盘,`meta.status: ready`。出图链路同时加固为崩溃可恢复(reconcile 自愈 + 原子写 + promptHash + `--status`,实战经受 2 次 session 关闭/进程 kill)。

**关键产出**:
- 调用方式与 SSE 解析铁律见 [packages/visual-pipeline/README.md](packages/visual-pipeline/README.md)(gpt-5.5 + `/v1/responses`,stream 不跳过 partial、多行 data 拼接)。
- 落盘自愈方案见 [PROGRESS.md](PROGRESS.md) 第八轮。
- 新会话验证状态:`npx tsx packages/visual-pipeline/src/cli.ts content/_mock/script.json --status`。

**后续**(可选):用 `pnpm produce` 生成新剧本时,同一套链路自动出图;若某张触发内容审核失败,改软 prompt 后 `--resume` 补跑。

---

## 推荐执行顺序

1. **真实生成验收**: 用 `pnpm produce --skip-visual` 生成新本,检查故事质量、线索节奏和 validate 结果。
2. **游戏性/UI 继续打磨**: 搜证/公开线索节奏、主持人提示、角色任务、玩家笔记、投票等待与讨论体验。
3. **文档继续收口**: README/PROGRESS 已校准到第十一轮状态,后续随实测继续补。
4. **P2-6 git 基线**: 用户已说初版完成后再处理,当前暂缓。

## 需阿宁拍板 / 协调的事项
- [ ] 是否现在跑一份真实 LLM 生成(`ANTHROPIC_API_KEY` 就绪时)做人工质量评审?
- [ ] 下一轮继续 UI/游戏性,还是先做真实生成验收?
