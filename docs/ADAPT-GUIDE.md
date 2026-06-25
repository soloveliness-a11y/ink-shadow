# 现有剧本适配规范 · ADAPT-GUIDE

> **面向对象**：将纸质/实体剧本杀适配到本数字系统的人。
> 基于《丹水山庄》（豪门惊情系列·7人本）适配经验总结。
> 版本：1.0 | 更新：2026-06-12

---

## 一、适配原则

### 核心铁律

1. **系统适配剧本，不是剧本适配系统** — 不要为了系统便利而删改原作内容
2. **忠实优先** — 原版规则 > 系统默认行为。如果原版有特殊规则，优先实装
3. **先读后做** — 通读全部原始素材后再动手，不要边做边猜
4. **验证原文** — 所有线索/叙事内容必须对照原图验证，OCR 文本常有错误

### 与新建剧本的区别

| 维度 | 新建剧本 (SCRIPT-SPEC) | 适配现有剧本 (本指南) |
|------|----------------------|---------------------|
| 内容来源 | LLM/作者原创 | 纸质剧本 OCR + 原图 |
| 规则适配 | 按系统设计 | 必须保留原版规则 |
| 结局设计 | 按规范 4+ 种 | 忠实原版结局 |
| 线索结构 | 按 schema 设计 | 可能需要扩展 schema |
| 工作重心 | 内容创作 | 规则还原 + 数据校验 |

---

## 二、适配流程（6 阶段）

### 阶段 1：素材审查（不做任何代码）

**目标**：完整理解原版游戏的所有规则和内容。

```
□ 通读游戏说明书 — 理解完整流程（两场制/三场制等）
□ 通读所有角色剧本 — 每个角色的 6 个文件（1-6.md）
□ 查看地图 — 理解区域划分和角色归属
□ 查看线索卡 — 理解线索结构（区域线索 + 秘密线索）
□ 查看调查报告 — 理解终局问答机制
□ 记录特殊规则 — 原版有但系统没有的机制
```

**输出**：一份《原版规则清单》，列出所有需要适配的规则。

### 阶段 2：Schema 评估

**目标**：判断系统 schema 是否需要扩展。

常见需要扩展的场景：

| 原版规则 | 需要的 schema 扩展 | 丹水山庄案例 |
|---------|-------------------|-------------|
| 角色有专属技能 | `Character.skills` | 武术/药物/恭维等 |
| 技能门控秘密线索 | `Clue.requiredSkill` | 搜到普通线索→技能触发秘密线索 |
| 角色所在区域 | `Character.sceneId` | 不能搜查自己区域 |
| 必须公开的信息 | `Character.mandatoryReveal` | 被问到时必须回答 |
| 被动线索给予 | `Character.passiveClueGivers` | 赵卫可向冯双骥要线索 |
| 角色调查报告 | `Character.investigationReport` | 终局问答题 |
| 叙事过渡文本 | `Phase.narrativeText` | 阶段切换时的氛围渲染 |

**原则**：先检查 schema 是否已有对应字段，再决定是否扩展。

### 阶段 3：数据转换

**目标**：将原始素材转换为 `script.json`。

#### 3.1 角色转换

```json
{
  "id": "feng",                    // 简短英文 ID
  "name": "冯双骥",                // 保留原名
  "gender": "male",
  "age": 41,
  "isVictim": false,
  "isMurderer": true,
  "publicProfile": "...",          // 从原版提取公开简介
  "privateScript": "...",          // 完整角色故事（保留全部细节）
  "storyByPhase": {                // 按阶段解锁的剧情
    "social": "...",               // 第一场的内容
    "afternoon": "...",            // 第二场的内容
    "investigation": "..."         // 搜证阶段的内容
  },
  "objectives": [...],             // 保留原版计分规则
  "secrets": [...],                // 角色秘密
  "timeline": [...],               // 时间线（用于验证一致性）
  "relationships": [...],          // 关系（分公开/隐秘）
  "skills": ["武术", "药物"],       // 角色技能
  "sceneId": "s_butler",           // 角色所在区域
  "mandatoryReveal": [...],        // 必须公开的信息
  "investigationReport": "...",    // 调查报告问题
  "passiveClueGivers": [...]       // 被动线索给予
}
```

**常见错误**：
- ❌ 删除原版内容以"适配系统" — 应扩展系统来容纳内容
- ❌ 只用 OCR 文本不验证原图 — OCR 常有错别字/漏行
- ❌ 合并多个角色到一个文件 — 每个角色独立字段

#### 3.2 线索转换

```
原版线索卡 → 数字线索
区域线索 → sceneId + visibility: "searchable"
秘密线索 → visibility: "private" + requiredSkill
人证线索 → sceneId（所在区域）+ content（证词全文）
物证线索 → sceneId（发现地点）+ content（详细描述）
```

**关键**：线索 `content` 必须保留原版全文，不要缩写。

#### 3.3 阶段转换

原版的"两场制"对应系统的 `phases`：

```
原版第一场（午饭后的寒暄）→ p_social (kind: free)
原版第二场（谁是真凶？）  → p_investigation (kind: free) + p_discuss (kind: free)
原版投票               → p_vote (kind: vote)
原版结局               → p_end_* (kind: reveal)
```

**注意**：原版的"休息"机制对应系统的 `ready` 操作。

#### 3.4 流程转换

```json
{
  "entry": "p_opening",
  "edges": [
    { "from": "p_opening", "to": "p_social" },
    { "from": "p_social", "to": "p_afternoon" },
    { "from": "p_afternoon", "to": "p_investigation" },
    { "from": "p_investigation", "to": "p_discuss" },
    { "from": "p_discuss", "to": "p_vote" },
    { "from": "p_vote", "to": "p_end_correct", "condition": { "kind": "voteResult", "equalsCharId": "feng" } },
    { "from": "p_vote", "to": "p_vote_tiebreak", "condition": { "kind": "voteTie" } },
    { "from": "p_vote", "to": "p_end_wrong", "condition": { "kind": "always" } },
    { "from": "p_vote_tiebreak", "to": "p_end_correct", "condition": { "kind": "voteResult", "equalsCharId": "feng" } },
    { "from": "p_vote_tiebreak", "to": "p_end_tie", "condition": { "kind": "always" } }
  ]
}
```

**必须有 `always` 兜底边**，否则平票/错误投票时流程断裂。

### 阶段 4：内容验证（最容易跳过的步骤）

**目标**：确保转换后的内容与原版一致。

```
□ 逐个角色核对 privateScript — 对照原图，修正 OCR 错误
□ 逐条线索核对 content — 对照原图，补全缩写内容
□ 核对技能门控 — 每条 requiredSkill 线索，确认有角色拥有该技能
□ 核对秘密线索编号 — 确保 00-19 全部正确映射
□ 核对角色区域分配 — 对照地图确认 sceneId
□ 核对 mandatoryReveal — 从原版"你的表现"提取
□ 核对结局叙事 — 确保每个结局有完整叙事（不是一句话）
□ 运行 validateScript — 零 error 零 warn
```

**验证命令**：
```bash
pnpm typecheck          # 类型检查
pnpm test               # 全量测试
```

### 阶段 5：E2E 测试

**目标**：确保游戏可以完整跑通。

```
□ 测试模式启动 — 7人全部加入
□ p_opening → 全员就绪 → 自动推进
□ p_social → 讨论 → 全员 ready → 推进
□ p_afternoon → 全员就绪 → 推进
□ p_investigation → 搜证 8 次 → 时间到 → 推进
□ p_discuss → 讨论 → 全员 ready → 推进
□ p_vote → 投票 → 结算
□ 结局 → 叙事展示 → 复盘
□ 验证：不能搜查自己区域（报错 "不能搜查自己角色所在的区域"）
□ 验证：技能门控（无技能时报错 "需要XX技能"）
□ 验证：搜证次数限制（8次用完报错 "搜证次数已用完"）
```

### 阶段 6：文档收尾

```
□ 更新 content/ 下的剧本 README（如有）
□ 确认 content/danshui/ 不在 .gitignore 中（版权内容不入库）
□ 记录适配中发现的 schema 扩展（如有）
□ 记录与原版规则的差异（如有）
```

---

## 三、常见坑与解决方案

### 坑 1：OCR 文本错误

**症状**：线索内容与原图不一致，错别字、漏行、格式错乱。

**解决**：
- 所有关键内容必须对照原图验证
- 使用 `## ` 标记标题（系统会解析为衬线标题）
- 保留原版的 `\n\n` 分段，不要合并

### 坑 2：秘密线索编号偏移

**症状**：秘密线索 00-19 编号与原图不对应。

**解决**：
- 原版秘密线索是 00-19（共 20 张），不是 01-20
- 每条秘密线索的 `id` 必须与原版编号一致
- 验证：`cl_s_qr_00` 到 `cl_s_qr_19` 全部存在

### 坑 3：Bot 自动搜证忽略秘密线索

**症状**：Bot 只搜普通线索，不搜秘密线索。

**解决**：
- `Room.ts` 的 `autoPlayBots` 需要同时处理 `searchable` 和 `private` 线索
- 秘密线索需要检查 bot 角色是否有对应技能
- 优先搜秘密线索（信息量更大）

### 坑 4：PhaseEngine 拦截秘密线索搜索

**症状**：玩家有技能但搜索秘密线索报错 `clue_private`。

**解决**：
- `validateIntent` 中 `searchClue` 的 `private` 分支需要检查：
  1. 线索持有者 → 允许
  2. 已解锁 + 玩家有技能 → 允许
  3. 其他 → 拒绝

### 坑 5：Free 场景不显示叙事文本

**症状**：阶段切换时直接进入操作界面，没有叙事过渡。

**解决**：
- `narrativeText` 只在 `BriefingScene` 中消费
- `FreeScene` 需要额外添加可折叠叙事区域
- 在 `Free.tsx` 中添加 `useTypewriter` + 折叠 UI

### 坑 6：Briefing 阶段卡住不推进

**症状**：全员就绪但不进入下一阶段。

**解决**：
- 测试模式下 `blockAdvance=true`，`allReady` 满足后 `advance()` 被拦截
- `PhaseStatus` 需要检测 `view?.pendingAdvance` 并显示推进按钮
- `BriefingScene` 的 ready 按钮需要在 `pendingAdvance` 时隐藏

### 坑 7：搜证统计栏在讨论阶段显示

**症状**：`p_social` 阶段显示"可搜线索"等统计信息。

**解决**：
- 搜证统计栏只在 `allowed.has('searchClue')` 时显示
- 用条件渲染包裹 `.investigation-summary`

### 坑 8：结局叙事太短

**症状**：结局只有一句话，缺乏沉浸感。

**解决**：
- 每个结局的 `narrative` 至少 200+ 字
- 要描述：凶手的反应、其他角色的命运、未解的悬念
- 不只说"谁被带走了"，要说"他/她带着什么心情离开"

---

## 四、Schema 扩展清单

适配丹水山庄时扩展的 schema 字段：

| 字段 | 位置 | 用途 | 向后兼容 |
|------|------|------|---------|
| `skills` | Character | 角色技能列表 | ✅ optional |
| `sceneId` | Character | 角色所在区域 | ✅ optional |
| `mandatoryReveal` | Character | 必须公开的信息 | ✅ optional |
| `passiveClueGivers` | Character | 被动线索给予 | ✅ optional |
| `investigationReport` | Character | 调查报告问题 | ✅ optional |
| `requiredSkill` | Clue | 技能门控 | ✅ optional |
| `linkedSecretClueId` | Clue | 关联秘密线索 | ✅ optional |

**所有扩展字段均为 optional**，不影响现有剧本。

---

## 五、版权注意事项

- 原版剧本内容（`content/danshui/`）**不得提交到公开仓库**
- 仅系统代码和通用 schema 可以入库
- 原版素材仅用于本地开发和测试
- 如果要发布适配后的剧本，需获得原版权方授权

---

## 六、适配检查清单

快速检查表（适配新剧本时逐项打勾）：

```
□ 原版规则清单已整理
□ Schema 评估完成（是否需要扩展）
□ 角色数据转换完成（含 sceneId/skills/mandatoryReveal）
□ 线索数据转换完成（含 requiredSkill/linkedSecretClueId）
□ 阶段和流程转换完成
□ 结局叙事完整（每个 200+ 字）
□ 全部内容对照原图验证
□ validateScript 零 error
□ typecheck 通过
□ 测试通过
□ E2E 跑通全流程
□ 版权内容未入库
```
