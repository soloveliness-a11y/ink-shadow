# 01 · 剧本数据契约(Schema)

> ⭐ **这是整个系统的脊椎。** M1 往它生成、M2 按它出图、M3 按它运行。本契约 = `packages/schema`。
> 任何模块动工前必须先冻结本契约。改契约 = 改全员,需显式同步并升 `schemaVersion`。
> 类型用 TypeScript 表达;运行时校验用 **zod**(zod schema 与下列 interface 一一对应,单一来源)。

## 0. 设计原则

1. **静态剧本(Script)与运行态(RuntimeState)分离**:Script 是离线产物(剧本包),只读;RuntimeState 是 M3 运行时状态,在游戏中变化。两者都在本契约定义,供 C/S 共享。
2. **B 方案:环节自定义 DAG**。剧本自带 `phases`(节点池)+ `flow`(DAG 边),引擎是通用解释器,不硬编码流程。
3. **视觉字段内嵌**:角色/场景/道具的 `visual` 字段由 M1 生成描述、M2 回填资源路径,无需独立映射表。
4. **真相隔离**:`Truth` 与各角色 `isMurderer` 等敏感字段,M3 运行时**绝不下发给客户端**(防作弊),仅服务器持有。

---

## 1. 顶层结构

```typescript
interface Script {
  meta: ScriptMeta;
  characters: Character[];   // 玩家角色 + 死者
  clues: Clue[];             // 全部线索
  scenes: Scene[];           // 场景(搜证地点,出场景图)
  props?: Prop[];            // 道具(可选,出道具图)
  phases: Phase[];           // 环节节点池
  flow: PhaseFlow;           // 环节 DAG(B 方案核心)
  truth: Truth;              // 真相(仅服务器可见)
}

interface ScriptMeta {
  id: string;                // 唯一 id(slug)
  title: string;
  theme: string;             // 题材:如 "民国上海谍战"
  playerCount: { min: number; max: number };   // 4~8
  difficulty: 'easy' | 'normal' | 'hard' | 'expert';
  durationMin: number;       // 预计时长(分钟)
  synopsis: string;          // 公开梗概(开场展示)
  styleGuide: string;        // 全局美术风格基调(M2 出图统一风格用)
  schemaVersion: string;     // 契约版本,如 "1.0.0"
  status: 'draft' | 'validated' | 'ready';  // 生产期状态:草稿→过校验→配图完成
}
```

---

## 2. 角色 Character

```typescript
interface Character {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  age?: number;
  isVictim: boolean;
  isMurderer: boolean;                 // 服务器侧;运行时不下发
  publicProfile: string;               // 公开身份(全员可见)
  privateScript: string;               // 私人剧本开篇(仅本人可见)
  storyByPhase?: Record<string, string>; // 分幕解锁的私人剧情,key 对应 Phase.unlocks.storyKey
  objectives: Objective[];             // 任务目标
  secrets: string[];                   // 需隐藏的秘密
  timeline: TimelineEntry[];           // 案发前后行踪
  relationships: Relationship[];       // 与他人关系
  visual: VisualSpec;                  // 头像出图(必填)
}

interface Objective { id: string; kind: 'main' | 'side' | 'hidden'; description: string; scoring?: number; }
interface TimelineEntry { time: string; location: string; action: string; isPublic: boolean; }
interface Relationship { targetCharId: string; relation: string; isPublic: boolean; }
```

> `storyByPhase` 实现"分幕发本":第二轮搜证才解锁某角色的新记忆,由 `Phase.unlocks.storyKey` 触发。

---

## 3. 线索 Clue / 场景 Scene / 道具 Prop

```typescript
interface Clue {
  id: string;
  title: string;
  content: string;                     // 线索正文
  sceneId?: string;                    // 所在场景(搜证地点)
  ownerCharId?: string;                // 归属角色(私有线索)
  visibility: 'public' | 'private' | 'searchable'; // 公开/私有/需搜证获取
  round?: number;                      // 第几轮搜证可得(配合 Phase.unlocks)
  isKey: boolean;                      // 破案关键线索
  pointsTo: string[];                  // 指向的真相要素 key(自洽校验:isKey 必须非空)
  visual?: VisualSpec;                 // 线索卡/道具图(可选)
}

interface Scene {
  id: string;
  name: string;
  description: string;
  visual: VisualSpec;                  // 场景图(必填)
}

interface Prop {
  id: string;
  name: string;
  description: string;
  visual: VisualSpec;                  // 道具图(必填)
}
```

---

## 4. 视觉素材契约 VisualSpec(M1↔M2 接口)

```typescript
interface VisualSpec {
  // —— M1 生成 ——
  kind: 'avatar' | 'scene' | 'prop';
  prompt: string;                      // 画面描述(M2 直接喂给 od media)
  aspect: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'; // 头像3:4 / 场景16:9 / 道具1:1
  styleHint?: string;                  // 与 meta.styleGuide 叠加的局部风格
  negativePrompt?: string;
  // —— M2 回填 ——
  asset?: {
    path: string;                      // 相对剧本包:assets/xxx.png
    model: string;                     // 实际模型 id
    generatedAt: string;               // ISO 时间
    status: 'pending' | 'done' | 'failed';
    error?: string;
  };
}
```

> M2 的全部输入就是这个结构:读 `prompt`+`aspect`+`styleHint` → 调 `od media generate` → 写回 `asset`。这是 M2 与剧本的唯一耦合点。

---

## 5. 环节 DAG(B 方案核心)

### 5.1 环节节点 Phase

```typescript
type PhaseKind = 'briefing' | 'sequential' | 'free' | 'vote' | 'reveal';

type ActionKind =
  | 'readScript'      // 阅读私人剧本
  | 'speak'           // 公开发言
  | 'searchClue'      // 搜证(领取线索)
  | 'revealClue'      // 公开/共享一张线索
  | 'privateMessage'  // 私聊密谋
  | 'castVote'        // 投票
  | 'submitTheory'    // 提交推理
  | 'ready';          // 标记准备就绪

interface Phase {
  id: string;
  kind: PhaseKind;
  title: string;
  instruction: string;                 // 主持词/环节说明
  participants: 'all' | string[];      // 参与角色,默认 'all'
  allowedActions: ActionKind[];        // 本环节允许的操作
  turnOrder?: string[];                // 仅 sequential:回合顺序(charId 列表)
  unlocks?: {
    clueIds?: string[];                // 进入时开放搜证的线索
    storyKey?: string;                 // 解锁各角色 storyByPhase[storyKey]
  };
  exit: ExitCondition;                 // 推进条件
}

interface ExitCondition {
  kind: 'allReady' | 'allActed' | 'timer' | 'hostAdvance' | 'voteComplete';
  timerSec?: number;                   // kind=timer 时必填;其他可作为兜底上限
}
```

**五种环节语义:**
| kind | 同步模型 | 典型用途 | 推进 |
|------|---------|---------|------|
| `briefing` | 各自阅读 | 开场发本、分幕剧情 | `allReady` |
| `sequential` | 回合锁 | 自我介绍、最终陈词 | `allActed`(按 turnOrder 轮完) |
| `free` | 并发广播 | 搜证、自由讨论、线索共享、私聊 | `timer` 或 `hostAdvance` |
| `vote` | 同时提交 | 指认凶手 | `voteComplete` |
| `reveal` | 系统播放 | 真相揭晓、结局、复盘 | `hostAdvance` |

### 5.2 流程 DAG PhaseFlow

```typescript
interface PhaseFlow {
  entry: string;                       // 起始 phase id
  edges: PhaseEdge[];
}

interface PhaseEdge {
  from: string;
  to: string;
  condition?: FlowCondition;           // 缺省 = always(默认转移)
}

type FlowCondition =
  | { kind: 'always' }
  | { kind: 'voteResult'; equalsCharId: string }   // 投票指向某角色 → 走该分支
  | { kind: 'flag'; flag: string; equals: boolean }; // 运行时标志位(剧情触发)
```

> DAG 表达力:**线性**(标准流程)、**循环**(多轮"搜证→讨论"回到前一节点)、**分支**(投票结果分流到不同结局)全部支持。引擎是通用解释器,见 `04-m3`。

### 5.3 标准流程示例(JSON,展示 DAG 用法)

```json
{
  "flow": {
    "entry": "p_brief",
    "edges": [
      { "from": "p_brief",   "to": "p_intro" },
      { "from": "p_intro",   "to": "p_search1" },
      { "from": "p_search1", "to": "p_discuss1" },
      { "from": "p_discuss1","to": "p_search2" },
      { "from": "p_search2", "to": "p_discuss2" },
      { "from": "p_discuss2","to": "p_vote" },
      { "from": "p_vote", "to": "p_end_good", "condition": { "kind": "voteResult", "equalsCharId": "c_butler" } },
      { "from": "p_vote", "to": "p_end_bad",  "condition": { "kind": "always" } }
    ]
  }
}
```

---

## 6. 真相与结局 Truth

```typescript
interface Truth {
  murdererCharIds: string[];           // 支持多凶手
  method: string;                      // 手法
  motive: string;                      // 动机
  crimeTimeline: TimelineEntry[];      // 案件真实时间线
  solutionChain: string[];             // 完整推理链(每步引用 clue.id / 真相要素)
  reveal: string;                      // 复盘朗读全文
  endings: Ending[];                   // 多结局
}

interface Ending {
  id: string;
  condition: FlowCondition;            // 触发条件
  title: string;
  narrative: string;                   // 结局文本
}
```

---

## 7. 运行态契约 RuntimeState(M3 用,C/S 共享)

```typescript
interface RuntimeState {
  roomCode: string;
  scriptId: string;
  status: 'lobby' | 'assigning' | 'playing' | 'finished';
  players: PlayerSlot[];
  currentPhaseId: string;
  phaseRuntime: PhaseRuntime;          // 当前环节的临时态
  revealedClues: string[];             // 已公开线索 id
  acquiredClues: Record<string, string[]>; // charId -> 已获取线索 id
  votes: Record<string, string>;       // voterCharId -> targetCharId
  flags: Record<string, boolean>;      // 剧情标志位(FlowCondition.flag 用)
  log: GameEvent[];
}

interface PlayerSlot {
  playerId: string;
  charId?: string;                     // 已分配角色
  nickname: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
}

interface PhaseRuntime {
  phaseId: string;
  turnIndex?: number;                  // sequential:当前轮到第几个
  startedAt: number;
  deadline?: number;                   // timer 环节的截止时间戳
  actedCharIds: string[];              // 本环节已完成必做操作的角色
}

interface GameEvent {
  ts: number;
  type: string;                        // 'phase_enter' | 'clue_revealed' | 'vote_cast' | 'speak' | ...
  actorCharId?: string;
  payload?: unknown;
}
```

> **下发裁剪**:服务器向某玩家广播 RuntimeState 时,必须剔除 `Truth`、他人 `privateScript`/`secrets`/`isMurderer`、未获取线索内容。下发视图类型 `ClientStateView` 在 `04-m3` 定义。

---

## 8. 校验规则(M1 校验器必须全过)

**结构层(zod):** 所有必填字段存在;所有 id 引用无悬空(charId/sceneId/clueId/phaseId 互引有效)。

**自洽层(语义校验,部分需 LLM 辅助):**
1. 至少 1 名 `isVictim`;`murdererCharIds` 非空且都指向真实角色。
2. 每个 `isKey` 线索:`pointsTo` 非空,且必须可被玩家获取(存在某 `Phase.unlocks.clueIds` 或 `visibility` 可达路径)。
3. `truth.solutionChain` 引用的每条线索都存在,且整链玩家可达(破案路径不断裂)。
4. 每个非死者角色:≥1 个 `main` objective、完整 `timeline`(≥3 条)、≥1 个 `secret`。
5. **环节 DAG**:`entry` 存在;从 `entry` 出发可达所有 phase(无孤岛);至少一条路径终于 `reveal`;循环必须有退出边(防死循环)。
6. **投票分支**:每个 `voteResult` 分支目标都有对应 `Ending` 或 reveal 节点。
7. **时间线无矛盾**:同一角色同一时间不出现在两个 location(LLM 辅助交叉检查)。
8. **视觉完整**:每个 Character 有 `visual(avatar)`;每个 Scene 有 `visual(scene)`;Prop 有 `visual`。
9. **角色平衡**:每个角色都"有事可做"——拥有或可获取 ≥1 条与自身 objective 相关的线索。

> 校验失败 → 返回结构化错误(定位到字段/角色/环节)→ M1 局部回炉重生成对应段落,而非整本重来。详见 `02-m1`。

---

## 9. 字段归属表(谁写谁读)

| 数据 | M1 生成 | M2 回填 | M3 运行时读 | 下发客户端 |
|------|:------:|:------:|:----------:|:---------:|
| `meta` | ✅ | — | ✅ | ✅(部分) |
| `characters[].public*` | ✅ | — | ✅ | ✅ |
| `characters[].private*` `secrets` | ✅ | — | ✅ | 仅本人 |
| `characters[].isMurderer` | ✅ | — | ✅ | ❌ |
| `*.visual.prompt/aspect` | ✅ | — | — | — |
| `*.visual.asset.path` | — | ✅ | ✅ | ✅ |
| `clues` | ✅ | — | ✅ | 按获取状态裁剪 |
| `phases` `flow` | ✅ | — | ✅ | ✅(当前环节) |
| `truth` | ✅ | — | ✅ | ❌(终局才放) |
| `RuntimeState` | — | — | ✅(服务器产生) | ✅(裁剪后) |

---

## 10. 交付物(M0 出口)

- `packages/schema/src/*.ts`:上述全部 interface。
- 对应 **zod schema**(`zScript`, `zCharacter`, …)+ 推导类型 `z.infer`。
- `validateScript(script): ValidationResult` 结构校验入口(自洽层在 M1 实现,但接口在此声明)。
- **一份手写 mock 剧本包** `content/_mock/script.json`(6 人,标准流程,占位图),供 M3 在 M1 未就绪时先行开发。
- 冻结后打 tag `schema@1.0.0`。
