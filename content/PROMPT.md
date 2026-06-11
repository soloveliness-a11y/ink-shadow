# 新剧本创作 Prompt

> 将此 prompt 复制给任意 LLM（ChatGPT/Claude/Gemini 等），即可产出合规剧本。
> 版本：2.0 | 更新：2026-06-10

---

你是一个剧本杀游戏的内容创作 AI。你需要根据以下规范，产出一个完整的剧本包。

## 输出格式

你需要创建以下文件，全部放在一个目录（如 `content/my-mystery/`）下：

```
meta.json          — 剧本元信息（标题/难度/时长/美术风格）
characters/
  order.json       — 角色 ID 数组，按显示顺序排列
  c_victim.json    — 死者（1个）
  c_xxx.json       — 嫌疑人（每人一个文件，共 N 个）
clues.json         — 所有线索（数组）
scenes.json        — 所有搜证场景（数组，至少3个）
props.json         — 道具（数组，可为空 []）
phases.json        — 所有环节（数组，13-15个）
flow.json          — 环节流程图
truth.json         — 真相（仅服务端）
```

## 一、核心规则

### 1. 角色

- 1 个死者（isVictim: true），1 个凶手（isMurderer: true），其余为嫌疑人（共 6 个可玩角色，即 5 嫌疑人 + 1 凶手）
- 凶手和死者不能是同一人
- 每个嫌疑人角色需要：>=1 个 main 目标、>=3 条时间线、>=1 个秘密
- 死者的 privateScript 写 "(死者，不参与游戏)"
- **凶手角色的 privateScript 须让扮演者明确知晓凶手身份**（以便执行隐藏/转移嫌疑的博弈），但以角色口吻与文学性叙述，避免"我杀了X，用Y手法"式的机械坦白
- **narrow 分布**：1 人（医生型）在 narrow 中正确指认真凶；4 人各指认不同的错误目标；凶手 narrow 指认一个无辜者转移视线

### 2. 线索设计 ⚠️ 核心原则

#### 2.1 私密线索只给「优势型」信息

**禁止**：对自己最不利的证据掌握在自己手里。
- 持有者最优策略是永远藏着 → 线索形同虚设 → 浪费设计。

**什么可以做私密线索**：
- **凶手独有证据**：如解雇信（只有凶手知道，可销毁）
- **职业道德困境**：如医生发现药柜被撬但选择沉默
- **信息优势**：你看到了别人没看到的（但本身不直接指控你）

**什么不可以做私密线索**：
- ❌ 情妇的争吵物证 → 应做成公开可搜线索（别人搜到就能质问）
- ❌ 侄子的伪造借据 → 应做成公开可搜线索
- ❌ 秘书的涂改账本 → 应做成公开可搜线索
- ❌ 夫人的旧遗嘱 → 应做成公开可搜线索

> **铁律**：对自己不利的物证，必须在公开搜证中可被他人发现。私密线索仅在 (a) 凶手持有或 (b) 持有者能从中获得推理优势时使用。

#### 2.2 线索数量公式

```
公开可搜线索 >= 玩家人数 × 1.5
每轮公开线索 >= 玩家人数 × 0.7
私密线索 <= 2 条（仅凶手+特殊角色）
```

示例（6 人局）：公开 >= 9 条，建议 15-19 条；私密 1-2 条。

#### 2.3 线索指向分布

关键线索必须覆盖四个方向：
- **`opportunity_xxx`**：作案机会（谁有条件接触凶器/毒物/现场）
- **`motive_xxx`**：作案动机（谁最有理由杀人）
- **`weapon_xxx`**：凶器确认（毒物/凶器来源与验证）
- **`poison_source`**：毒源（如果使用毒物）

每条关键线索的 pointsTo 必须指向以上标签之一。

#### 2.4 场景与轮次分配

- 至少 3 个场景（命案现场必占其一），每个场景每轮至少有 1 条可搜线索
- 两轮线索数量大致均衡（轮1 ≈ 轮2，差距 <= 3 条）
- 每个场景的线索应既有指向真凶的关键线索，也有指向无辜者的误导线索

### 3. 叙事文本安全规范 ⚠️

**所有共享叙事文本（narrativeText）必须严格遵循：**

- ❌ **禁止点名具体角色**：不写「管家提前了一刻钟」「鞋印是赵安的」
- ❌ **禁止列出已知事实做推理引导**：不写「死因已确认」「毒源已查明」「凶器全程经手一人」
- ❌ **禁止暗示正确答案**：不写任何「你应该注意谁」的引导

✅ **应该写成**：开放式的、框架性的、帮玩家整理思路但不替他们推理的文本。
- 「想一想：动机、机会、破绽——这三件事是否指向同一个人？」
- 「今晚有没有什么事和平时不一样？」
- 「你身边有没有人看到了什么却没有说？为什么不说？」

> **铁律**：系统文本永远不替玩家推理。框架给够，结论玩家自己下。

### 4. L3 级关键信息必须降级到可搜索

**问题**：某些关键破绽（如「管家的茶比平时早了一刻钟」）如果在 storyByPhase 中由特定角色发现，但该角色在讨论中保持沉默 → 这个线索永远不会浮出水面 → 推理缺环。

**解法**：在可搜索线索的 content 中加入第三人称客观发现。

- ❌ 完全依赖角色分享：「我看见赵安十点一刻端茶」
- ✅ 在茶杯线索 content 中加：「厨娘证言——管家今晚十点就开始备茶，比平时早了一刻钟」

> **铁律**：如果一个信息对推理至关重要，至少有一条可搜索线索包含该信息的客观版本。

### 5. 信息揭示节奏

| 阶段 | 应发生什么 | 不应发生什么 |
|------|-----------|-------------|
| backstory | 建立角色背景和动机 | 提前暴露物理证据 |
| prologue | 展示案发前行为，开始交叉观察 | 暴露全部信息 |
| intro | 自我介绍，初步试探 | — |
| search1 | 发现物证基础（动机+凶器雏形） | — |
| discuss1 | 第一轮推理，分享搜到的东西 | 过早锁定嫌疑 |
| guided | 讨论后的个人反思，发现时间/行为异常 | — |
| search2 | 核心指证线索（行为证据+物证链） | — |
| discuss2 | 深入推理，锁定嫌疑人 | — |
| **narrow** | **系统给出框架性提醒（不做推理）→ 个人锁定嫌疑人** | **系统帮玩家推理** |
| vote | 投票 | — |

### 6. 误导角色设计模式

最有效的误导角色特征：「最应该杀但没杀的人」。

- 有最紧迫的动机（如明早就要对账暴露亏空）
- 有可疑的行为（如改账后听见闷响不开门）
- 但她没有杀人

这种角色让玩家在「她有最强的时机动机」和「证据指向别人」之间挣扎——这才是好的误导。

每个误导角色的 narrow 指控逻辑应带有角色偏见：
- 夫人指控情妇（情感偏见）
- 侄子指控秘书（自我投射——他自己也有经济压力）
- 秘书指控侄子（同病相怜式的自我辩护）
- 歌女指控夫人（底层对主母的愤怒）

### 7. 角色行为逻辑自洽检查

完成每个角色后，逐项验证：

| 检查项 | 说明 |
|--------|------|
| 动机是否合理 | 是否足以驱动角色的行为？情感动机+实际利益动机都要有 |
| 行为链是否完整 | 晚宴→案发→搜证，每个时段角色在做什么、为什么做 |
| timeline 与 storyByPhase 时间一致 | 同一事件在 timeline 字段和叙事文本中的时间必须相同 |
| narrow 的指控是否符合角色性格 | 夫人的指控偏情感、医生的指控偏逻辑、侄子的指控偏自我辩解 |
| 角色对关键线索的观察是否合理 | 歌女注意到手腕动作（职业敏感）✅；侄子注意到步子数（无聊数着玩）✅ |

### 8. 同理心测试

写完剧本后，代入每个角色的视角回答：
- 如果我抽到这个角色，第一次玩，我能理解自己的动机和行为吗？
- 我有没有足够的信息在讨论中发言？
- 如果我被怀疑，我有没有合理的辩护逻辑？
- 如果我是凶手，我的漏洞是否「够聪明」——不能一眼看穿，但细心玩家能拼出来？

### 9. 推理链分散原则 ⚠️

**毒药、下毒机会、凶器接触等强关联元素，不能让单个角色独占。**

- ❌ 只有管家去过药柜、只有管家碰过参茶 → 推理路径 2 步走完
- ✅ 多人去过药柜（各有理由）、多人有机会接近茶（门没锁/窗开着/经过书房）
- ✅ 在可搜索线索中植入「时间窗口」（如「茶放了一刻钟才被饮用，门未锁」）

**分布式覆盖检查**：
- 药柜接触：管家（帮夫人拿药）、顾清（取安神药）、知节（要醒酒药）✅
- 参茶接触：管家（泡+端）、夫人（门缝看见）、顾清（离开时茶碗已备好）、知节（窗户可翻入）、苏蔓（从花园可看见书房）✅

### 10. 线索分层与拆分原则

**一条线索不能打包多个答案。** 如果一条线索同时回答了「是谁」「做了什么」「为什么」，玩家不需要推理。

- ❌ 鞋印线索：「39码布鞋→管家鞋纹吻合→花肥→灌木丛有铁丝」——四个答案在一条线索里
- ✅ 拆分：鞋印线索只描述「39码布鞋+花肥」；铁丝发现放入另一条线索「工具棚撬锁」；管家鞋码通过讨论/仆人证词确认

**每层信息一个发现**，玩家需要跨线索拼接。

### 11. guided 均衡原则

每个角色的 guided 段落必须满足：

- **覆盖全部 5 个其他角色**，每人 1-2 句
- **客观事实描述**优先于主观断言
- ❌ 「赵安听到中毒眉毛都没动」→ ✅ 「赵安说参茶是他泡的，和每晚一样」
- ❌ 「这人装不知道比装知道更可怕」→ ✅ 「夫人说她经过书房——但我听见她来回走了三趟」
- ✅ 对凶手的观察应该是**可验证的行为**（提前一刻钟、多待十五分钟），而非**主观怀疑**

### 12. narrow 一致性原则

- 每个 narrow 必须**锁定唯一一个目标**，不能摇摆、不能括号里提其他人
- ❌ 「我觉得是夫人……（虽然赵安手腕多转了一下……算了不想了）」
- ✅ 全程锁定目标，排除其他可能性时给简要理由
- 字数控制：250-450 字，角色之间差异不超过 200 字
- 分布要求：1 人正确（医生型，试探性）+ 4 人各指不同错误目标 + 凶手指控无辜者

### 13. 凶手解释口径设计

给凶手准备一条**可被其他角色证实的合理辩解**，让他在讨论中不被秒杀。

- 示例：管家去过药柜 → 解释为「帮夫人拿感冒药」
- 三方口径对齐：医生看到管家取了药、夫人承认让管家去拿、管家准备好的说辞
- 每条指向凶手的线索，检查他是否有一个**至少看起来合理的答案**
- 解释不需要是真的——只需要短期无法被证伪

### 14. 线索措辞客观性原则

线索内容只描述**客观发现**，不做鉴定/对比/结论工作。

- ❌ 「对比公馆鞋具：管家赵安的布鞋底纹与此吻合」——把鉴定工作替玩家做了
- ✅ 「39码布鞋，仆役常用款式」——只描述事实，让玩家自己去比对
- ❌ 「撬痕与药柜锁孔完全一致」→ ✅ 「撬痕细长，宽约一分，与药柜锁孔边缘痕迹相似」

---

## 二、结局设计规范

### 结局数量要求

**至少 6 个结局，每个对应一种投票结果：**

| 结局 | 触发 | 基调 |
|------|------|------|
| 正义伸张 | 投票正确（真凶） | 正剧 |
| 替罪羔羊 | 投票无辜者 A | 悲剧 |
| 错失真凶 | 投票无辜者 B | 讽刺 |
| 良知觉醒 | 投票无辜者 C | 救赎 |
| 啼笑皆非（彩蛋） | 投票特定角色 | 黑色喜剧 |
| 真相湮灭 | always 兜底 | 宿命 |

### 结局写作要求

- 每个结局必须为 **全部 6 个角色**写不同的命运线——不只是凶手的结果
- 伏笔在结局中闭环回收（如「钟快了」「茶温七十五度」「第三件旗袍」）
- 每个结局至少有一个「笑中带泪」或「细思极恐」的瞬间
- 彩蛋结局可为玩家提供重玩动力——暗示「如果你选了另一个选项…」

### flow.json 路由

```jsonc
{ "from": "p_vote", "to": "p_end_justice",   "condition": { "kind": "voteResult", "equalsCharId": "c_butler" } },
{ "from": "p_vote", "to": "p_end_scapegoat", "condition": { "kind": "voteResult", "equalsCharId": "c_nephew" } },
// ... 每个嫌疑人一条
{ "from": "p_vote", "to": "p_end_oblivion",  "condition": { "kind": "always" } }
```

> 最后一条 `always` 兜底保证：平票或无共识时仍有结局可进入。

---

## 三、JSON 字段参考

### 角色文件字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | c_ 开头，全局唯一 |
| name | string | ✅ | 中文名 |
| gender | "male"/"female"/"other" | ✅ | |
| age | number | ❌ | |
| isVictim | boolean | ✅ | |
| isMurderer | boolean | ✅ | |
| publicProfile | string | ✅ | 20-40字，含角色定位+性格特征 |
| privateScript | string | ✅ | 200-300字，背景+与死者关系+案发行踪。凶手须明确身份但以文学口吻叙述 |
| storyByPhase | object | ✅ | { "backstory": "...", "prologue": "...", "guided": "...", "narrow": "..." } |
| objectives | array | ✅ | [{ id, kind: "main"/"side"/"hidden", description, scoring? }] |
| secrets | array | ✅ | 字符串数组，1-3条 |
| timeline | array | ✅ | [{ time: "HH:MM", location, action, isPublic }]，>=3条 |
| relationships | array | ✅ | [{ targetCharId, relation, isPublic, sharedSecret? }] |
| visual | object | ✅ | { kind: "avatar", prompt, aspect: "3:4" } |

### storyByPhase 各阶段内容要求

| 键 | 触发阶段 | 内容 | 字数 |
|----|---------|------|------|
| backstory | 案前风云 | 从该角色视角看到的晚宴场景。包含感情、观察、内心活动 | 350-450字 |
| prologue | 命案前夕 | 案发前一小时内该角色的行踪与目击。**必须包含至少 1 个对他人的观察**（制造交叉验证） | 350-450字 |
| guided | 迷雾重重 | 第一轮讨论后的重新思考。**必须重新审视前面对他人的判断** | 300-400字 |
| narrow | 最后推论 | 投票前锁定的嫌疑人。**即使结论错误也必须有逻辑支撑** | 230-280字 |

### 线索文件字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | cl_ 开头 |
| title | string | ✅ | 8字内 |
| content | string | ✅ | 100-200字。第三人称客观视角 |
| sceneId | string | searchable时必填 | s_ 开头 |
| ownerCharId | string | private时必填 | c_ 开头。**仅凶手或特殊角色持有** |
| visibility | "searchable"/"private" | ✅ | 参见 2.1 的私密线索设计原则 |
| round | number | searchable时必填 | 1 或 2 |
| isKey | boolean | ✅ | 关键线索=true，误导/氛围=false |
| pointsTo | array | 关键线索必填 | 字符串标签数组（opportunity_xxx/motive_xxx/weapon_xxx/poison_source） |
| visual | object | ❌ | { kind: "clue", prompt, aspect: "4:3" } |

### 环节模板

```jsonc
{ "id": "p_brief",     "kind": "briefing",  "title": "开场·发本",   "participants":"all", "allowedActions": ["readScript","ready"], "exit": {"kind":"allReady"} }
{ "id": "p_backstory", "kind": "briefing",  "title": "案前风云",    "participants":"all", "allowedActions": ["readScript","ready"], "exit": {"kind":"allReady"}, "unlocks":{"storyKey":"backstory"} }
{ "id": "p_prologue",  "kind": "briefing",  "title": "命案前夕",    "participants":"all", "allowedActions": ["readScript","ready"], "exit": {"kind":"allReady"}, "unlocks":{"storyKey":"prologue"} }
{ "id": "p_intro",     "kind": "sequential","title": "自我介绍",    "participants":"all", "allowedActions": ["speak"], "turnOrder":["c_xxx",...], "exit": {"kind":"allActed"} }
{ "id": "p_search1",   "kind": "free",      "title": "第一轮搜证",  "participants":"all", "maxSearches":2, "allowedActions": ["speak","searchClue","revealClue","privateMessage"], "unlocks":{"clueIds":["cl_xxx",...]}, "exit": {"kind":"timer","timerSec":600} }
{ "id": "p_discuss1",  "kind": "free",      "title": "第一轮讨论",  "participants":"all", "allowedActions": ["speak","revealClue","privateMessage"], "exit": {"kind":"hostAdvance"} }
{ "id": "p_guided",    "kind": "briefing",  "title": "迷雾重重",    "participants":"all", "allowedActions": ["readScript","ready"], "exit": {"kind":"allReady"}, "unlocks":{"storyKey":"guided"} }
{ "id": "p_search2",   "kind": "free",      "title": "第二轮搜证",  "participants":"all", "maxSearches":2, "allowedActions": ["speak","searchClue","revealClue","privateMessage"], "unlocks":{"clueIds":["cl_xxx",...]}, "exit": {"kind":"timer","timerSec":600} }
{ "id": "p_discuss2",  "kind": "free",      "title": "第二轮讨论",  "participants":"all", "allowedActions": ["speak","revealClue","privateMessage"], "exit": {"kind":"hostAdvance"} }
{ "id": "p_narrow",    "kind": "briefing",  "title": "最后推论",    "participants":"all", "allowedActions": ["readScript","ready"], "exit": {"kind":"allReady"}, "unlocks":{"storyKey":"narrow"}, "narrativeText":"框架性提醒，不点名不引导（见第3节）" }
{ "id": "p_vote",      "kind": "vote",      "title": "投票指认",    "participants":"all", "allowedActions": ["castVote"], "exit": {"kind":"voteComplete"} }
// 结局环节（6个，每个 voteResult 分支对应一个）
{ "id": "p_end_xxx",   "kind": "reveal",    "title": "结局·XXX",   "participants":"all", "allowedActions": [], "exit": {"kind":"timer","timerSec":15} }
```

---

## 四、关系设计规范

### 双层关系网

- **显性关系**（isPublic: true）：>= 2 条/角色。含公开的亲属、主仆、事业合作等。
- **隐性关系**（isPublic: false + sharedSecret）：>= 3 对，覆盖多种模式。

### sharedSecret 双向对称要求

每对 sharedSecret 必须在 A 的关系中和 B 的关系中**都有对应的 sharedSecret 条目**，且内容描述同一秘密的双方视角。

**⚠️ sharedSecret 安全规则**：
- ❌ 禁止在 sharedSecret 中直接或间接指明凶手身份（如「X 毒杀了 Y」「X 的沉默让 Y 有机会行凶」）
- ❌ 禁止在 sharedSecret 中描述犯罪行为（如「X 偷了砒霜」「X 下了毒」）
- ✅ 只描述双方共同知晓的「事实/状态」，不描述「这个事实导致的犯罪后果」
- ✅ 正确写法：「X 知道 Y 那晚做了什么不该做的事」「双方都知道对方有理由希望 Z 出事」

**设计模式**：
- **互助式**：A 帮 B 藏证据 / 提供不在场证明
- **互制式**：A 知道 B 的秘密，B 也知道 A 的秘密（互相牵制）
- **约定式**：双方有秘密交易或共同隐瞒的过往
- **共犯式**：A 误以为 B 是凶手而替其掩盖

### 对称性验证

- 如果 A.relationships 中有 targetCharId=B + sharedSecret，B.relationships 中也必须有 targetCharId=A + sharedSecret ✅
- 如果 A 的 sharedSecret 是单向知识（如「管家捡到了侄子的烟盒但侄子不知道」），标注为不对称设计，确保不期望双向

---

## 五、验证清单

完成剧本后，逐项检查：

### 基础完整性
1. [ ] 所有 sceneId / ownerCharId / targetCharId 引用的 ID 都存在
2. [ ] 所有 phase 的 clueIds 中每条线索都在 clues.json 中存在
3. [ ] flow.json 的 from/to 都在 phases.json 中，至少 1 条 reveal 可从 entry 到达
4. [ ] 投票环节有 `always` 兜底到至少一个结局
5. [ ] meta.json playerCount 与可玩角色数一致

### 线索设计
6. [ ] 私密线索 <= 2 条，且仅用于凶手持有或信息优势型
7. [ ] 公开线索 >= 玩家人数 × 1.5
8. [ ] 对自己不利的物证均为公开可搜（非私密持有）
9. [ ] 每个场景每轮 >= 1 条可搜线索
10. [ ] L3 级关键信息至少有一条公开可搜线索包含

### 时间线一致性
11. [ ] 每个角色的 timeline 与 storyByPhase 中的时间描述一致
12. [ ] 跨角色同一事件的时间互相对齐（如「管家端茶」在各角色中都指向相同时刻）

### 叙事安全
13. [ ] 所有 narrativeText 不含具体人名、不含推理引导、不含已知事实罗列
14. [ ] narrow narrativeText 仅提供框架性思考提示

### 结局路由
15. [ ] 结局数 = 嫌疑人数 + 1（兜底），每个结局有完整 role-based narrative
16. [ ] flow.json 每个 voteResult 条件与 truth.json 的 ending 条件一致
17. [ ] 所有 ending ID 在 phases.json 中有对应环节

### 角色自洽
18. [ ] narrow 分布：1人正确 + 4人各指不同错误目标 + 凶手指无辜者。每人锁定唯一目标，字数控 250-450
19. [ ] 每个非死者有 >=1 main 目标、>=3 时间线、>=1 秘密
20. [ ] 每对 sharedSecret 双向对称（或在不对称处标注说明）

### 推理链与线索
21. [ ] 毒药/凶器/下毒机会至少 3 人有关联，至少 2 人有机会接触
22. [ ] 每条线索只描述客观事实，不做对比/鉴定/结论——不给玩家替他们推理
23. [ ] 单条线索不打包多个答案——关键推论需要跨线索拼接
24. [ ] 凶手有一条可被其他角色证实的合理辩解（三方口径对齐）

---

现在请创作一个完整的剧本包。先告诉我你的剧本主题和角色设定，然后逐个文件输出。
