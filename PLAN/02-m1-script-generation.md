# 02 · M1 剧本生成引擎

> 目标:输入参数(人数/题材/难度)→ 输出**通过全部校验**的剧本包 JSON(符合 `01-script-schema`)。
> 包:`packages/generator`,CLI 名 `mmg-generate`。LLM 用 **Claude API**(动工前读 `claude-api` skill)。

## 1. 核心设计:真相先行(逆向生成)

剧本杀生成最大的坑是**逻辑崩坏**——正向"边写边编"会导致线索对不上凶手、推理链断裂、时间线矛盾。

**对策:逆向生成。先定答案,再反推线索。**

```
真相(凶手/手法/动机/案件时间线)
   ↓ 反推
角色(围绕真相分配身份/秘密/动机,凶手藏在其中)
   ↓ 反推
线索链(把"如何从证据推出真相"拆成线索,分配到角色/场景/搜证轮)
   ↓
环节编排 + 分幕剧情 + 视觉描述 + 多结局
```

先有标准答案,线索是"答案的投影",保证**可解性**(玩家能推出来)和**自洽性**(没有矛盾)。

## 2. 生成 Pipeline(分阶段,每阶段独立 LLM 调用 + 局部校验)

| 阶段 | 输入 | 输出 | 模型 |
|------|------|------|------|
| S1 真相内核 | 参数(人数/题材/难度) | `Truth` 草案 + 案件梗概 | Opus |
| S2 角色矩阵 | 真相 + 参数 | `characters[]`(公开/私人/动机/秘密/时间线/关系) | Opus |
| S3 线索链 | 真相 + 角色 | `clues[]` + `scenes[]`(含 round/owner/pointsTo/isKey) | Opus |
| S4 环节编排 | 角色 + 线索 | `phases[]` + `flow`(DAG) | Sonnet(模板化,省成本) |
| S5 分幕剧情 | 角色 + 环节 | `storyByPhase`(各角色分幕解锁) | Opus |
| S6 视觉描述 | 角色/场景/道具 + styleGuide | 各 `visual.prompt`/`aspect` | Sonnet |
| S7 结局 | 真相 + flow 分支 | `endings[]` + `truth.reveal` | Opus |

> **分阶段的价值**:每阶段产出小、可独立校验、可局部回炉。比"一次生成整本"质量高、可控、便于重试。

## 3. 结构化输出与校验回环

- **强制 JSON**:每阶段用 Claude **tool use**(定义对应 zod schema 的 tool)强制结构化输出,而非自由文本解析。失败则带校验错误重试(最多 3 次)。
- **局部校验**:每阶段产出立即跑该段 zod 校验,不过当场重试,不污染下游。
- **全局自洽校验**(全部生成后):跑 `01-schema §8` 的 9 条规则。
  - 结构/引用类错误 → 定位字段 → 重跑对应阶段(只补该段)。
  - **时间线矛盾**等语义错误 → 用一个 **Sonnet "critic" pass**:把全部时间线喂给它,让它找冲突,返回结构化问题清单 → 针对性修订。
- **回炉上限**:全局校验循环最多 3 轮,仍不过则报告失败并落盘当前草稿供人工介入(铁律:失败 3 次换思路/暴露)。

```typescript
// pipeline 主流程伪代码
async function generate(params: GenParams): Promise<Script> {
  const truth = await retryUntilValid(() => stageTruth(params), zTruth);
  const characters = await retryUntilValid(() => stageCharacters(truth, params), zCharacters);
  const { clues, scenes } = await retryUntilValid(() => stageClues(truth, characters), zCluesScenes);
  const { phases, flow } = await stagePhases(characters, clues);
  const storyByPhase = await stageStory(characters, phases);
  await stageVisual(characters, scenes /*, props*/, params.styleGuide);
  const { endings, reveal } = await stageEndings(truth, flow);
  let script = assemble(/* all */);
  script = await validateAndRepair(script, { maxRounds: 3 }); // 全局自洽 + critic + 局部回炉
  return script;
}
```

## 4. Prompt 分层(`src/prompts/`)

- **System prompt(共享,缓存)**:角色="资深剧本杀编剧 + 逻辑推理设计师";注入 schema 摘要、难度准则、题材基调、硬约束(可解性/无矛盾/角色平衡)。用 **prompt caching** 缓存(system + 已生成上下文),跨阶段复用省 token(详见 `claude-api` skill)。
- **各阶段 User prompt**:聚焦本阶段任务 + 上游产出(真相/角色)作为上下文 + 输出 tool schema。
- **Critic prompt**:对抗式——"你是找茬的逻辑审校,只输出矛盾点清单"。

## 5. 模型与成本

- 创作阶段(S1/S2/S3/S5/S7)用 **Opus**(质量优先);模板/描述阶段(S4/S6)与 critic 用 **Sonnet**(省成本)。
- 全程开 **prompt caching**:system + 真相 + 角色矩阵作为稳定前缀缓存,后续阶段命中。
- 落盘每阶段中间产物(`content/<id>/.gen/stageN.json`),崩溃可续跑(铁律:关键状态落盘)。

## 6. CLI 契约

```bash
mmg-generate \
  --players 6 \
  --theme "民国上海谍战" \
  --difficulty hard \
  --style "写实油画质感,暖褐色调" \   # 写入 meta.styleGuide
  --out content/minguo-01/ \
  [--resume] [--seed <n>] [--json]
# 产出:content/minguo-01/script.json(status=validated,visual.asset 尚空,待 M2)
```

## 7. 任务清单(执行顺序)

1. 脚手架 `packages/generator`,接入 Claude SDK,封装"带 tool use + 重试 + 缓存"的调用层。
2. 实现 `retryUntilValid`(结构校验失败回传错误重试)。
3. 逐阶段实现 S1→S7,每阶段配独立 prompt 模板 + tool schema。
4. 实现全局 `validateAndRepair`:自洽 9 规则 + critic pass + 局部回炉路由。
5. 实现中间态落盘与 `--resume`。
6. CLI 封装 + `.env.example`(`ANTHROPIC_API_KEY`)。
7. 自检:跑通 6 人本,人工通读一遍质量(逻辑是否闭合、角色是否平衡)。

## 8. 验收标准

- [ ] `mmg-generate --players 6 ...` 端到端产出 `script.json`。
- [ ] 产物通过 `validateScript` 全部结构 + 自洽规则(脚本化断言)。
- [ ] 随机抽 3 本人工通读:凶手可推理、无逻辑硬伤、每角色有事可做。
- [ ] 支持 4~8 人参数;难度影响线索密度/误导项数量。
- [ ] 崩溃后 `--resume` 能续跑。

## 9. 已知难点 / 给执行者的提醒

- **可解性 vs 误导**:hard 难度要加"红鲱鱼"(误导线索),但不能让真相不可达。校验规则 #2#3 是底线。
- **角色平衡**:避免某角色"打酱油"。校验规则 #9 强制每角色有相关线索。
- **多凶手/隐藏阵营**:schema 已支持 `murdererCharIds[]`;MVP 可先做单凶手,留扩展。
- 本阶段**不出图**,只写 `visual.prompt`。出图是 M2 的事。
