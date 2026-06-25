# 剧本创作规范 · SCRIPT-SPEC

> **面向对象**：LLM / 新作者 / 自动化脚本。本文档自包含，无需项目上下文即可产出合规剧本。

---

## 核心设计原则

### 双层关系网

每个剧本必须构建两层角色关系：

**第一层 · 显性关系**（`isPublic: true`）
- 所有玩家在公共线索中可观察到的互动
- 包括：公开的亲属关系、主仆关系、事业合作、公开的敌对/同盟
- 设计目标：让玩家在自我介绍阶段就能建立初步的社交地图

**第二层 · 隐性关系**（`isPublic: false`）
- 仅限两个角色之间知晓的隐秘剧情
- 设计模式：
  - **互助式**：A 帮 B 藏匿关键证物 / 提供不在场证明
  - **共犯式**：C 误以为 D 是凶手而替其掩盖
  - **约定式**：E 与 F 之间存在秘密交易或共同隐瞒的过往
  - **互制式**：G 知道 H 的秘密，H 也知道 G 的秘密，形成互相牵制
- 设计目标：制造信息不对称，增加玩家间的试探、博弈与推理深度
- **关键**：每对隐性关系必须包含至少一条`sharedSecret`（双方共同知晓且不愿公开的事）

### 多结局架构

突破传统"凶手落网 / 逍遥法外"二元结局。至少设计 4 种结局：

| 结局类型 | 触发条件 | 叙事维度 |
|---------|---------|---------|
| **正义伸张** | 投票正确 | 真相大白，众人释然 |
| **替罪羔羊** | 投票指向某无辜者 | 冤案形成，真凶隐藏，某种程度的良心煎熬 |
| **惊人反转** | 投票触发特殊条件 | 真凶身份发生反转，颠覆前期所有推理 |
| **真相湮灭** | 平票 / 无人达成共识 | 案件悬而未决，但每个人都背负着秘密继续生活 |

额外可选结局方向：
- **救赎之路**：受害者家属选择原谅，与凶手共同完成某种救赎
- **制度之变**：案件成为触发更大变革的导火索

**角色命运线**：每个结局下，不只交代凶手的结果，还要为每个主要角色设计他们在该结局下的归宿——成长、堕落、牺牲或觉醒。

---

## 目录结构

每个剧本是一个目录，放在 `content/<scriptId>/` 下。目录名即为 `scriptId`，必须全部小写字母+数字+下划线。

```
content/my-mystery/
  meta.json                 ← 元信息（标题/难度/时长等）
  characters/
    order.json              ← 角色加载顺序（ID 数组）
    c_victim.json           ← 死者（isVictim: true）
    c_suspect_a.json        ← 嫌疑人（每人一个文件）
    c_suspect_b.json
    ...
  clues.json                ← 所有线索
  scenes.json               ← 所有搜证场景
  props.json                ← 所有道具（可选）
  phases.json               ← 所有环节
  flow.json                 ← 环节 DAG 流程图
  truth.json                ← 真相（仅服务端，不下发给玩家）
```

---

## 文件格式速查

### 1. meta.json — 剧本元信息

```jsonc
{
  "id": "my-mystery",                    // 与目录名一致
  "title": "迷雾山庄",                    // 剧本标题
  "theme": "民国·山庄命案",               // 主题标签
  "playerCount": { "min": 5, "max": 6 }, // 支持玩家数
  "difficulty": "normal",                // easy | normal | hard | expert
  "durationMin": 150,                    // 预计时长（分钟）
  "synopsis": "一句话简介，不超过100字。",
  "styleGuide": "美术风格描述，英文 prompt 片段",
  "cover": {                             // 封面图（可选，M2 出图后回填）
    "kind": "cover",
    "prompt": "封面图 prompt",
    "aspect": "3:4"
  },
  "schemaVersion": "1.0.0",
  "status": "draft"                      // draft | validated | ready
}
```

> **styleGuide** 用于 M2 视觉管线统一出图风格。写法示例：`"1935 Shanghai, realistic oil painting, warm sepia, cinematic lighting"`

---

### 2. characters/<角色id>.json — 角色定义

文件名 = 角色 ID（如 `c_victim.json`、`c_wife.json`）。

```jsonc
{
  "id": "c_wife",                        // 必须以 c_ 开头，全局唯一
  "name": "林月如",                       // 角色中文名
  "gender": "female",                    // male | female | other
  "age": 34,                             // 年龄（整数，可选）
  "isVictim": false,                     // true=死者，不参与游戏
  "isMurderer": false,                   // true=真凶（服务端私密，不下发）
  "publicProfile": "公开身份简介，20-40字",
  "privateScript": "私人剧本。200-300字，描述角色背景、与死者的关系、案发前后的行踪。注意：凶手扮演者须明确知晓自己的凶手身份（以便执行隐藏罪行、转移嫌疑的博弈任务），但应以角色视角与文学口吻叙述，避免写成"我杀了X、用Y手法"式的机械坦白。",
  "storyByPhase": {                      // 按阶段解锁的叙事（可选）
    "round2": "第二轮搜证时解锁的回忆。",
    "backstory": "案前风云阶段解锁。从该角色视角看到的晚宴场景。~400字",
    "prologue": "命案前夕阶段解锁。案发前一小时内该角色做了什么。~350字",
    "guided": "迷雾重重阶段解锁。第一轮讨论后该角色的重新思考。~300字",
    "narrow": "最后推论阶段解锁。投票前该角色锁定的嫌疑人。~250字"
  },
  "objectives": [                        // 任务目标
    {
      "id": "o_wife_1",                  // 以 o_<角色名>_序号 命名
      "kind": "main",                    // main | side | hidden
      "description": "任务描述",
      "scoring": 10                      // 分值（main/hidden 建议设）
    }
  ],
  "secrets": [                           // 秘密（服务端私密，不下发）
    "秘密1：简短描述",
    "秘密2：简短描述"
  ],
  "timeline": [                          // 时间线
    {
      "time": "20:00",                   // 格式 HH:MM
      "location": "客厅",
      "action": "出席宴会",               // 做了什么
      "isPublic": true                   // true=全员可见，false=仅自己
    },
    {
      "time": "22:00",
      "location": "走廊",
      "action": "曾路过书房门口",
      "isPublic": false                  // 私密行踪，需自行决定是否公开
    }
  ],
  "relationships": [                     // 角色关系
    {
      "targetCharId": "c_victim",        // 引用其他角色 ID
      "relation": "丈夫",
      "isPublic": true                   // 是否公开（显性关系）
    },
    {
      "targetCharId": "c_singer",
      "relation": "情敌",
      "isPublic": false,                 // 隐性关系：仅双方知晓
      "sharedSecret": "两人曾在花园对峙，互相威胁要揭露对方的秘密"  // 可选但强烈建议
    }
  ],
  "visual": {                            // 头像出图规格
    "kind": "avatar",
    "prompt": "Portrait prompt in English",
    "aspect": "3:4",
    "styleHint": "风格提示（可选）"
  }
}
```

#### 角色设计约束

| 约束 | 说明 |
|------|------|
| 必须有 1 个死者 | `isVictim: true`，不分配玩家 |
| 必须有 1 个凶手 | `isMurderer: true`，服务端不下发给任何人 |
| 每个玩家角色至少 1 个 main 目标 | `objectives[].kind: "main"` |
| 每个玩家角色至少 3 条时间线 | `timeline.length >= 3` |
| 每个玩家角色至少 1 个秘密 | `secrets.length >= 1` |
| 每个玩家角色持有至少 1 条线索 | 线索的 `ownerCharId` 指向该角色 |
| 凶手不能是死者 | `isVictim && isMurderer` 同时为 true 会报错 |

#### storyByPhase 写作指南

每个角色的 storyByPhase 必须提供**差异化信息**——6 个角色看同一事件，但每人看到的/知道的/关心的不同。

| key | 阶段 | 内容要求 |
|-----|------|---------|
| `backstory` | 案前风云 | 从该角色视角看晚宴。包含只有该角色知道的事（秘密、观察到他人的异常行为） |
| `prologue` | 命案前夕 | 案发前一小时该角色的行踪和所见。凶手版本应包含下毒过程的心理活动 |
| `guided` | 迷雾重重 | 第一轮讨论后重新审视。凶手要设计转移嫌疑的话术；其他人要产生新的怀疑 |
| `narrow` | 最后推论 | 投票前锁定的嫌疑人。**关键是：5个非凶手角色应指向不同的错误目标，只有1人（或0人）正确指向凶手。凶手要转移** |
| `round2` | 第二轮搜证 | 解锁的额外记忆（可选，用于已设计的剧本） |

**信息不对称原则**：每个角色的叙事中必须包含至少 1 条**独有信息**（其他 5 个角色都不知道的）。这样玩家必须通过讨论/分享才能拼出全貌。

---

### 3. characters/order.json — 角色顺序

```json
["c_victim", "c_wife", "c_butler", "c_doctor", "c_singer", "c_nephew", "c_secretary"]
```

死者放第一位，其余按叙事重要性排列。这个顺序决定了 UI 中的角色展示顺序。

---

### 4. clues.json — 线索列表

```jsonc
[
  {
    "id": "cl_will",                     // 以 cl_ 开头
    "title": "未签署的新遗嘱",            // 线索标题（10字内）
    "content": "详细内容描述，100-200字。说明线索是什么、在哪发现、包含什么信息。",
    "sceneId": "s_study",                // 所属场景 ID（searchable 线索必填）
    "ownerCharId": "c_butler",           // 持有角色 ID（private 线索必填）
    "visibility": "searchable",          // public | private | searchable
    "round": 1,                          // 解锁轮次（searchable 线索必填）
    "isKey": true,                       // 是否关键线索（指向真相）
    "pointsTo": ["motive_will"],         // 指向的真相要素标签
    "visual": {                          // 线索图（可选）
      "kind": "clue",
      "prompt": "English prompt",
      "aspect": "4:3"
    }
  }
]
```

#### 线索可见性三种

| visibility | 含义 | sceneId | ownerCharId | round |
|-----------|------|---------|-------------|-------|
| `public` | 全员开局可见 | 可选 | 不需要 | 不需要 |
| `private` | 仅持有角色可见（需公开才共享） | 不需要 | **必填** | 不需要 |
| `searchable` | 在指定场景中可被搜索 | **必填** | 不需要 | **必填** |

#### 线索设计约束

| 约束 | 说明 |
|------|------|
| 关键线索 `isKey: true` 的 `pointsTo` 不能为空 | 必须指向真相要素 |
| 关键线索必须可达 | public / 有 ownerCharId / 在 phases 中被 unlock |
| 每个 searchable 线索的 round 必须被至少一个 phase 的 unlock 覆盖 |
| `sceneId` 引用的场景必须在 scenes.json 中存在 |
| `ownerCharId` 引用的角色必须在 characters/ 中存在 |
| 每个非死者角色至少持有 1 条线索 | 避免有角色"无事可做" |

---

### 5. scenes.json — 搜证场景

```jsonc
[
  {
    "id": "s_study",                     // 以 s_ 开头
    "name": "书房",
    "description": "场景的环境描述，50-100字。描述空间氛围和可能引起注意的细节。",
    "visual": {
      "kind": "scene",
      "prompt": "English scene prompt",
      "aspect": "16:9"
    }
  }
]
```

**设计原则**：
- 至少 3 个场景，每个场景至少 1-2 条可搜索线索
- 场景描述应暗示可能存在的线索方向（但不直接说出线索内容）
- 命案现场（如书房）集中关键线索，其他场景分散误导/辅助线索

---

### 6. props.json — 道具（可选）

```jsonc
[
  {
    "id": "p_teaset",                    // 以 p_ 开头
    "name": "参茶茶具",
    "description": "道具描述",
    "visual": {
      "kind": "prop",
      "prompt": "English prompt",
      "aspect": "1:1"
    }
  }
]
```

---

### 7. phases.json — 环节定义

```jsonc
[
  {
    "id": "p_brief",                     // 以 p_ 开头
    "kind": "briefing",                  // briefing | sequential | free | vote | reveal
    "title": "开场·发本",
    "instruction": "环节引导文字，显示在 UI 中。",
    "participants": "all",               // "all" 或 ["c_wife","c_butler",...]
    "allowedActions": ["readScript", "ready"],
    "turnOrder": ["c_wife", "c_butler"], // 仅 sequential 环节需要
    "unlocks": {                         // 可选
      "clueIds": ["cl_will", "cl_teacup"],
      "storyKey": "backstory"            // 解锁角色 storyByPhase[key]
    },
    "exit": {
      "kind": "allReady",                // allReady | allActed | timer | hostAdvance | voteComplete
      "timerSec": 600                    // 仅 timer 需要
    },
    "narrativeText": "共享框架文本（可选），1-2句。角色差异化叙事由 storyKey 提供。"
  }
]
```

#### PhaseKind 与允许的操作

| kind | 说明 | 典型 allowedActions |
|------|------|-------------------|
| `briefing` | 阅读/就绪 | `["readScript","ready"]` |
| `sequential` | 顺序发言 | `["speak"]` |
| `free` | 自由阶段（搜证/讨论） | `["speak","searchClue","revealClue","privateMessage"]` |
| `vote` | 投票指认 | `["castVote"]` |
| `reveal` | 结局揭晓 | `[]` |

#### ExitCondition

| kind | 推进条件 | 需要 timerSec |
|------|---------|--------------|
| `allReady` | 所有在线玩家就绪 | 否 |
| `allActed` | 所有在线玩家执行过操作 | 否 |
| `timer` | 倒计时结束 | **是** |
| `hostAdvance` | 房主手动推进 | 否 |
| `voteComplete` | 所有在线玩家已投票 | 否 |

#### 推荐阶段流程（6人本）

```
p_brief    → briefing, allReady              // 开场发本
p_backstory→ briefing, allReady, storyKey    // 背景故事（差异化）
p_prologue → briefing, allReady, storyKey    // 案发前夕（差异化）
p_intro    → sequential, allActed, turnOrder // 自我介绍
p_search1  → free, timer(600), clueIds       // 第一轮搜证
p_discuss1 → free, hostAdvance               // 第一轮讨论
p_guided   → briefing, allReady, storyKey    // 引导/误导（差异化）
p_search2  → free, timer(600), clueIds       // 第二轮搜证
p_discuss2 → free, hostAdvance               // 第二轮讨论
p_narrow   → briefing, allReady, storyKey    // 最后推论（差异化）
p_vote     → vote, voteComplete              // 投票指认
p_end_good → reveal, timer(15)               // 真相大白
p_end_bad  → reveal, timer(15)               // 真凶逃脱
```

---

### 8. flow.json — 环节 DAG

```jsonc
{
  "entry": "p_brief",                    // 起始环节 ID
  "edges": [
    { "from": "p_brief", "to": "p_backstory" },
    { "from": "p_backstory", "to": "p_prologue" },
    { "from": "p_prologue", "to": "p_intro" },
    // ... 中间省略 ...
    {
      "from": "p_vote",
      "to": "p_end_good",
      "condition": {                      // 条件分支
        "kind": "voteResult",
        "equalsCharId": "c_butler"        // 投票结果=管家 → 好结局
      }
    },
    {
      "from": "p_vote",
      "to": "p_end_bad",
      "condition": { "kind": "always" }   // 兜底 → 坏结局
    }
  ]
}
```

#### FlowCondition 三种

| kind | 参数 | 用途 |
|------|------|------|
| `"always"` | 无 | 无条件转移（默认分支） |
| `"voteResult"` | `equalsCharId` | 投票多数=指定角色时触发 |
| `"flag"` | `flag`, `equals` | 自定义标记（暂未使用） |

**约束**：
- 所有非 reveal 环节必须有出边（不允许死胡同）
- 至少 1 个 reveal 终局环节可从 entry 到达
- 投票环节如有 `voteResult` 分支，必须还有 `always` 兜底分支

---

### 9. truth.json — 真相（服务端私密）

```jsonc
{
  "murdererCharIds": ["c_butler"],       // 凶手角色 ID 列表
  "method": "作案手法描述，50-100字",
  "motive": "作案动机描述，50-100字",
  "crimeTimeline": [                     // 犯罪时间线
    {
      "time": "21:20",
      "location": "药房",
      "action": "撬锁窃取砒霜",
      "isPublic": false
    },
    {
      "time": "21:45",
      "location": "书房",
      "action": "借送参茶之机下毒",
      "isPublic": false
    }
  ],
  "solutionChain": [                     // 推理链：按顺序引用关键线索 ID
    "cl_will",                           // 遗嘱 → 动机
    "cl_letter",                         // 解雇信 → 动机强化
    "cl_arsenic",                        // 砒霜缺失 → 凶器来源
    "cl_teacup",                         // 参茶 → 下毒途径
    "cl_butler_alibi"                    // 行踪破绽 → 机会
  ],
  "reveal": "真相揭晓的完整叙事文本。500-800字。包含：作案手法分步还原、伏笔回收列表、角色后话。",
  "endings": [                           // 结局分支
    {
      "id": "en_good",
      "condition": {
        "kind": "voteResult",
        "equalsCharId": "c_butler"       // 投票正确 → 好结局
      },
      "title": "真相大白",
      "narrative": "结局叙事，100-200字。描述投票正确后的场景。"
    },
    {
      "id": "en_bad",
      "condition": { "kind": "always" },
      "title": "真凶逃脱",
      "narrative": "结局叙事，100-200字。描述投票错误后的场景。"
    }
  ]
}
```

**约束**：
- `murdererCharIds` 至少 1 个，引用的角色必须存在
- `solutionChain` 引用的线索必须存在且可达（public / 有 owner / 在 phases 中解锁）
- 结局必须有 `always` 兜底（避免无结局可显示）
- `reveal` 叙事应包含伏笔回收——列出剧本中埋下的线索如何指向真凶

---
## 补充设计原则（v2.1 新增）

### 推理链分散原则

毒药、下毒机会、凶器接触等强关联元素，不能让单个角色独占。至少 3 个角色与药柜/凶器/毒源产生关联，至少 2 个角色有机会接触凶器所在位置。

### 线索拆分原则

一条线索不能打包多个答案。鞋印、铁丝、花肥应该分布在至少 2 条不同线索中，玩家需要跨线索拼接。

### 线索措辞客观性

线索内容只描述客观发现，不做鉴定/对比/结论工作。不出现「与XX的鞋印吻合」「与药柜锁孔一致」等提前替玩家做好的比对。

### 解释口径

给凶手准备一条可被其他角色证实的合理辩解，确保三方口径对齐（目击者+当事人+凶手），短期无法被证伪。

### guided 均衡原则

每个角色的 guided 必须覆盖全部其他 5 人，每人 1-2 句。用客观行为描述替代主观断言。对凶手的观察是可验证的事实，而非「可疑」标签。

### narrow 一致性

窄阶段锁定唯一目标，不摇摆、不括号补充。字数 250-450 字，角色间差异 ≤200 字。分布：1人正确+4人分散错误+凶手转移。

### 私密线索设计铁律

> **对自己不利的物证，必须做成公开可搜。私密线索仅用于凶手持有或信息优势型。**

- ❌ 情妇的争吵物证由情妇私藏 → 转为公开可搜（花园石阶翡翠碎片）
- ❌ 侄子的伪造借据由侄子私藏 → 转为公开可搜（假山石下信封）
- ✅ 医生的药柜被撬 → 私密持有（职业道德困境，持有者因此两难）
- ✅ 凶手的解雇信 → 私密持有（凶手独有，可选择隐藏）

### 线索数量公式

```
公开线索 >= 玩家数 × 1.5
每轮公开线索 >= 玩家数 × 0.7
私密线索 <= 2 条
```

示例（6 人局）：公开 >= 9 条，建议 15-19 条。

### L3 关键信息降级

如果一个破绽（如时间异常）仅出现在角色 storyByPhase 中，但角色可能选择不分享 → 在至少一条公开可搜线索中加入同信息的客观版本。

示例：「管家提前一刻钟端茶」→ 在茶杯线索 content 中加「厨娘证言：管家今晚十点就开始备茶，比平时早一刻钟」。

### 叙事文本中性原则

所有 narrativeText 必须遵循：
- 不点名具体角色
- 不罗列已知事实做推理引导
- 只提供思考框架（「想一想：动机、机会、破绽——是否指向同一个人？」）

### 角色 narrow 分布

6 个可玩角色：1 人正确指认真凶 + 4 人各指认不同错误目标 + 凶手指控无辜者。

### 结局数量

至少 6 个结局，每个投票目标对应一个（+ always 兜底）。每个结局为全部角色写命运线。

### 时间线一致性

每个角色的 timeline 字段与 storyByPhase 中的时间描述必须完全一致。同一事件在跨角色叙述中的时间必须对齐。

### sharedSecret 双向对称

如果 A 的 relationship 中有 targetCharId=B + sharedSecret，B 中也必须有对应条目。不对称关系需在 secret 中标注说明。

### 推理链分散

毒药、下毒机会、凶器接触等强关联元素不能被单人独占。至少 3 人关联药柜/毒源，至少 2 人有机会接触凶器所在地。

### 线索拆分

一条线索不能打包多个答案。鞋印、铁丝、花肥应分布在 ≥2 条不同线索中，玩家需跨线索拼接。

### 线索措辞客观性

线索内容只描述客观发现，不做鉴定/对比/结论。不出现「与XX吻合」「与药柜一致」等预判性比对。

### 解释口径

给凶手准备一条可被其他角色证实的合理辩解，确保三方口径对齐（目击者 + 当事人 + 凶手）。

### guided 均衡

每角色 guided 必须覆盖其他全部 5 人，用客观行为描述替代主观断言。

### narrow 一致性

锁定唯一目标，不摇摆不括号。字数 250-450 字，角色间差异 ≤200 字。分布：1 人正确 + 4 人分散错误 + 凶手转移。

---

## 交叉引用完整性检查清单

创作完成后，逐项确认：

- [ ] 所有 `sceneId` → scenes.json 中存在
- [ ] 所有 `ownerCharId` → characters/ 中存在
- [ ] 所有 `targetCharId` → characters/ 中存在
- [ ] 所有 phase `turnOrder` / `participants` → characters/ 中存在
- [ ] 所有 phase `unlocks.clueIds` → clues.json 中存在
- [ ] flow `entry` → phases.json 中存在
- [ ] flow 所有 `from`/`to` → phases.json 中存在
- [ ] flow `voteResult.equalsCharId` → characters/ 中存在
- [ ] truth `murdererCharIds` → characters/ 中存在
- [ ] truth `solutionChain` → clues.json 中存在
- [ ] 关键线索 pointsTo 不为空
- [ ] 非 reveal 环节都有出边
- [ ] 至少 1 个 reveal 可达
- [ ] 投票环节有 always 兜底
- [ ] 每个非死者角色有 main 目标、>=3 条时间线、>=1 个秘密、>=1 条线索
- [ ] 所有 searchable 线索的 round 被至少一个 phase 解锁
- [ ] 至少 1 个角色的 storyByPhase 包含当前解锁的 storyKey（不需要全部角色都有）

---

## 常见错误

| 错误 | 正确做法 |
|------|---------|
| `"isMurderer": true` 的角色 `privateScript` 直接写"我是凶手" | 凶手扮演者应明确知晓自己是凶手（以便执行隐藏与转移嫌疑的博弈），但以角色口吻与文学性叙述——知晓身份 ≠ 流水账自首 |
| 所有角色 storyByPhase 内容雷同 | 每个角色必须有 1+ 条独有信息 |
| 场景描述直接说"这里藏着线索X" | 场景描述暗示氛围，线索内容在 clues.json 中 |
| flow 中漏了 always 兜底分支 | 投票后必须有一个 always 分支指向兜底结局 |
| turnOrder 漏了某个可玩角色 | sequential 环节的 turnOrder 必须包含所有非死者角色 |
| 凶手角色的 storyByPhase.narrow 指向自己 | 凶手应该指向别人来转移嫌疑 |
| 只有 2 个结局（好/坏） | 至少设计 4 个结局，每个对应不同的投票结果 |
| 所有隐性关系缺少 sharedSecret | 每对 `isPublic: false` 的关系应附带 sharedSecret |
| 角色在结局中只有"被抓/逃脱"二态 | 每个结局应为所有主要角色设计命运线 |
