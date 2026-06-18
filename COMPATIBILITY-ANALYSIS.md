# 剧本杀游戏系统兼容性分析报告

## 分析日期
2026-06-18

## 分析范围
- 已转换剧本：#1-#14（14个）
- 系统架构：前端（React）、后端（Node.js）、数据模型（Zod Schema）

## 当前系统能力评估

### 已实现的核心能力 ✓

| 能力 | 实现位置 | 状态 |
|------|----------|:----:|
| 多幕结构 | PhaseEngine.ts | ✓ |
| 解锁机制 | PhaseEngine.enter() | ✓ |
| 时钟机制 | PhaseEngine.advanceClock() | ✓ |
| 抉择机制 | PhaseEngine.makeChoice() | ✓ |
| 关键词触发 | PhaseEngine.scanKeywordMemories() | ✓ |
| 分幕解锁 | PhaseEngine.storyByPhase | ✓ |
| 投票机制 | PhaseEngine.votes | ✓ |
| 平票决胜 | PhaseEngine.tieCharIds | ✓ |
| 轮次搜查 | PhaseEngine.maxRounds | ✓ |
| 技能触发 | PhaseEngine.linkedSecretClueId | ✓ |

### 抉择效果类型 ✓

| 效果类型 | 说明 | 状态 |
|----------|------|:----:|
| giveClue | 给予线索 | ✓ |
| setFlag | 设置标志 | ✓ |
| advanceClock | 推进时钟 | ✓ |
| unlockStory | 解锁故事 | ✓ |
| jumpPhase | 跳转阶段 | ✓ |

### 需要验证的能力 ?

| 能力 | 说明 | 状态 |
|------|------|:----:|
| 多凶手校验 | truth.murdererCharIds 支持多凶手 | ? |
| 推理链自洽 | truth.solutionChain 校验逻辑 | ? |
| 阵营机制 | character.faction/team | ? |
| 数值资源 | character.resources | ? |
| 前端UI | 支持所有机制的界面 | ? |

## 豪门剧本复杂机制

### 1. 阶段机制
- **多幕结构**：act1, act2, act3, act4（紫藤夫人）
- **解锁机制**：storyKey, clueIds
- **时钟机制**：clock（傀儡的记忆）
- **抉择机制**：choice（傀儡的记忆）

### 2. 角色机制
- **关键词记忆**：keywordMemories（傀儡的记忆）
- **分幕解锁**：storyByPhase（紫藤夫人）
- **阵营标识**：faction, team（待验证）
- **数值资源**：resources（待验证）

### 3. 线索机制
- **公开/私有/可搜索线索**：visibility
- **技能要求**：requiredSkill
- **关联秘密线索**：linkedSecretClueId

### 4. 真相机制
- **多凶手**：murdererCharIds（紫藤夫人）
- **复杂犯罪时间线**：crimeTimeline
- **推理链**：solutionChain
- **多结局**：endings

## 已转换剧本JSON结构对比

### 完整结构（早期剧本）
- #1 丹水山庄：meta, characters, clues, scenes, phases, flow, truth
- #2 傀儡的记忆：meta, characters, clues, scenes, phases, flow, truth
- #10 紫藤夫人：meta, characters, clues, scenes, phases, flow, truth

### 简化结构（新适配剧本）
- #3 幽灵复仇：meta, characters, clues, scenes, phases, flow, truth
- #4 惊魂醉阳楼：meta（其他缺失）
- #5 孝衣新娘：meta, characters, clues, scenes, phases, flow, truth
- #6 跌落的玫瑰：meta, characters, clues, scenes, phases, flow, truth
- #7 珠帘异梦：meta, characters, clues, scenes, phases, flow, truth
- #8 孽岛疑云：meta, characters, clues, scenes, phases, flow, truth
- #9 瑾园孤花：meta, characters, clues, scenes, phases, flow, truth
- #11 水袖情：meta, characters, clues, scenes, phases, flow, truth
- #12 嗜睡蔷薇：meta, characters, clues, scenes, phases, flow, truth
- #13 裂镜重圆：meta, characters, clues, scenes, phases, flow, truth
- #14 岳麓山下：meta, characters, clues, scenes, phases, flow, truth

## 问题与改进建议

### 问题1：新适配剧本JSON结构不完整
**问题描述**：
- 惊魂醉阳楼（#4）只有meta.json，其他文件缺失
- 新适配剧本JSON字段不完整，缺少很多必要字段

**改进建议**：
1. 补全惊魂醉阳楼的JSON文件
2. 统一新适配剧本的JSON格式
3. 确保所有剧本都有完整的meta/characters/clues/scenes/phases/flow/truth

### 问题2：JSON格式不统一
**问题描述**：
- 早期剧本（#1, #2, #10）使用完整JSON结构
- 新适配剧本（#3-#9, #11-#14）使用简化JSON结构
- 字段名称和结构不一致

**改进建议**：
1. 定义统一的JSON格式标准
2. 编写转换脚本，将简化结构转换为完整结构
3. 建立JSON Schema验证，确保格式正确

### 问题3：需要验证前端/后端支持所有机制
**问题描述**：
- 多凶手校验逻辑未验证
- 推理链自洽校验未验证
- 阵营机制和数值资源机制未验证
- 前端UI可能不支持所有机制

**改进建议**：
1. 编写测试用例，验证所有机制
2. 修复发现的问题
3. 完善前端UI，支持所有机制

### 问题4：缺乏质量检查流程
**问题描述**：
- 剧本适配后没有统一的质量检查
- 无法确保剧本能正常运行

**改进建议**：
1. 建立质量检查流程
2. 编写自动化测试
3. 定期进行兼容性测试

## 下一步行动计划

### 短期（1-2周）
1. 补全惊魂醉阳楼的JSON文件
2. 统一新适配剧本的JSON格式
3. 验证前端/后端支持所有机制

### 中期（1个月）
1. 编写转换脚本，统一JSON格式
2. 建立JSON Schema验证
3. 编写自动化测试

### 长期（3个月）
1. 完善前端UI，支持所有机制
2. 建立质量检查流程
3. 编写剧本适配指南

## 结论

当前剧本杀游戏系统已经实现了大部分核心能力，能够支持豪门剧本的复杂机制。但是，新适配剧本的JSON结构不完整，需要补全和统一格式。同时，需要验证前端/后端是否支持所有机制，并建立质量检查流程。

建议按照上述行动计划，逐步改进系统，确保能够兼容各种剧本类型。
