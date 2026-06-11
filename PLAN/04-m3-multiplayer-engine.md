# 04 · M3 联机游戏引擎

> 目标:加载剧本包,4~8 名玩家浏览器端联机,从开房到复盘跑完整局,**服务器权威**、可断线重连。
> 包:`packages/server`(Node + `ws`)+ `packages/client`(React + Vite + Zustand)。协议类型在 `packages/schema/src/protocol.ts`。

## 1. 原则

1. **服务器权威**:唯一真相在服务器。客户端只发"意图"、只渲染"下发视图"。所有规则校验、状态变更、可见性裁剪在服务器。
2. **通用解释器**:`PhaseEngine` 解释剧本的 `phases`+`flow`(DAG),**不硬编码任何具体流程**——换剧本即换流程(B 方案)。
3. **运行时零 LLM/出图**:只读已打包剧本。
4. **可见性即安全**:防作弊 = 服务器下发时严格裁剪(`Truth`、他人私密、未获取线索一律不发)。

## 2. 模块结构

```
packages/server/src/
├── index.ts            # ws 服务入口,连接 → session
├── room/
│   ├── RoomManager.ts  # 房间池:创建/加入/房间码/玩家会话
│   └── Room.ts         # 单房间:持有 Script + RuntimeState + PhaseEngine
├── engine/
│   ├── PhaseEngine.ts  # ⭐ DAG 解释器:enter/handleAction/checkExit/advance
│   └── flow.ts         # FlowCondition 求值
├── subsystems/
│   ├── clue.ts         # 搜证 / 公开线索
│   ├── vote.ts         # 投票统计
│   ├── chat.ts         # 公开发言
│   └── privateChat.ts  # 私聊密谋
├── view.ts             # RuntimeState → ClientStateView(可见性裁剪)
├── persist.ts          # SQLite 快照(断线重连/崩溃恢复)
└── loader.ts           # 剧本包加载 + 校验

packages/client/src/
├── net/                # WebSocket 连接 + 协议收发 + 重连
├── store/              # Zustand:持有 ClientStateView
├── scenes/             # 各环节 UI:Lobby/Briefing/Intro/Search/Discuss/Vote/Reveal
└── components/         # 线索卡 / 角色卡 / 私聊面板 / 投票面板
```

## 3. ⭐ PhaseEngine(DAG 解释器,M3 的心脏)

```typescript
class PhaseEngine {
  constructor(private script: Script, private state: RuntimeState, private bus: Broadcaster) {}

  enter(phaseId: string) {
    const phase = this.getPhase(phaseId);
    this.state.currentPhaseId = phaseId;
    this.state.phaseRuntime = { phaseId, startedAt: now(), actedCharIds: [],
      turnIndex: phase.kind === 'sequential' ? 0 : undefined,
      deadline: phase.exit.kind === 'timer' ? now() + phase.exit.timerSec! * 1000 : undefined };
    // 应用解锁:开放可搜证线索 / 解锁分幕剧情
    if (phase.unlocks?.clueIds) this.state.flags[`unlocked:${phaseId}`] = true;
    this.bus.broadcastState();           // 广播裁剪后的新状态
    this.bus.event({ type: 'phase_enter', payload: { phaseId } });
  }

  handleAction(charId: string, action: ClientIntent): Result {
    const phase = this.current();
    // 1) 该 action 是否被本环节允许
    if (!phase.allowedActions.includes(action.kind)) return reject('action_not_allowed');
    // 2) 环节特定校验
    if (phase.kind === 'sequential' && !this.isCurrentTurn(charId)) return reject('not_your_turn');
    if (action.kind === 'searchClue' && !this.isClueSearchable(charId, action.clueId)) return reject('clue_locked');
    // 3) 派发到子系统执行 → 改 state
    this.dispatch(charId, action);
    // 4) 记录已行动 / 推进回合指针
    this.markActed(charId, phase);
    this.bus.broadcastState();
    // 5) 检查是否可推进
    if (this.checkExit()) this.advance();
    return ok();
  }

  checkExit(): boolean {
    const phase = this.current();
    switch (phase.exit.kind) {
      case 'allReady':     return this.allReady();
      case 'allActed':     return this.allActedOrTurnsDone(phase);
      case 'voteComplete': return this.allVoted();
      case 'timer':        return now() >= this.state.phaseRuntime.deadline!;
      case 'hostAdvance':  return false; // 仅房主显式触发
    }
  }

  advance() {
    const next = selectNextPhase(this.script.flow, this.state); // 按 edges + FlowCondition
    if (!next) return this.finish();
    this.enter(next);
  }
}
```

**`selectNextPhase`(`flow.ts`)**:从 `flow.edges` 取所有 `from === currentPhaseId` 的边,按顺序求值 `condition`(`always` / `voteResult` 统计多数票 / `flag` 查标志位),命中第一条即转移。无命中且无 `always` 兜底 → 终局。

> 计时环节需要一个 tick 循环(每秒)驱动 `timer` 类 `checkExit`;`hostAdvance` 由房主的 `hostAdvance` intent 触发 `advance()`。

## 4. WebSocket 协议(`schema/protocol.ts`)

```typescript
// 客户端 → 服务器(玩家意图)
type ClientIntent =
  | { kind: 'join'; roomCode: string; nickname: string; sessionToken?: string }
  | { kind: 'selectChar'; charId: string }
  | { kind: 'ready' }
  | { kind: 'speak'; text: string }
  | { kind: 'searchClue'; clueId: string }
  | { kind: 'revealClue'; clueId: string }           // 公开自己持有的线索
  | { kind: 'privateMessage'; toCharId: string; text: string }
  | { kind: 'castVote'; targetCharId: string }
  | { kind: 'submitTheory'; text: string }
  | { kind: 'hostAdvance' };                          // 仅房主

// 服务器 → 客户端
type ServerMessage =
  | { kind: 'joined'; playerId: string; sessionToken: string }
  | { kind: 'assigned'; charId: string }              // 私密:仅发给本人
  | { kind: 'stateSync'; view: ClientStateView }      // 裁剪后的全量/增量状态
  | { kind: 'event'; event: GameEvent }               // 公开事件(谁发言/谁公开线索)
  | { kind: 'privateMessage'; fromCharId: string; text: string } // 仅发给收信人
  | { kind: 'error'; code: string; message: string };
```

> MVP 用**全量 `stateSync`**(单房间状态量小);后续可换 JSON patch 增量优化带宽。

## 5. 房间生命周期

```
lobby ──(满员/房主开始)──> assigning ──(全员选定角色)──> playing ──(flow 终局)──> finished
```
- **lobby**:房主 `createRoom(scriptId)` 拿房间码;玩家 `join(roomCode)`。展示剧本梗概、人数要求。
- **assigning**:角色分配。MVP 支持**手选**(先到先选)+ **随机兜底**(房主一键随机)。分配后向各人私发 `assigned` + 私人剧本。
- **playing**:`PhaseEngine.enter(flow.entry)` 启动,按 DAG 推进至终局。
- **finished**:下发 `Truth.reveal` + 命中的 `Ending` + 投票结算。

## 6. 各环节服务器逻辑

| 环节 kind | 服务器行为 |
|-----------|-----------|
| `briefing` | 私发各人 `privateScript`/分幕 `storyByPhase[storyKey]`;收集 `ready`;`allReady` 推进 |
| `sequential` | 维护 `turnOrder` 指针,仅当前 charId 可 `speak`;其发言广播为公开 `event`;轮完 `allActed` 推进 |
| `free` | 并发受理 `searchClue`/`revealClue`/`speak`/`privateMessage`;搜证校验解锁与归属;`timer`/`hostAdvance` 推进 |
| `vote` | 受理 `castVote`,记 `votes`;`voteComplete`(全投)后由 `selectNextPhase` 按 `voteResult` 分流 |
| `reveal` | 下发 `truth.reveal` + 命中 `Ending.narrative` + 票数统计;`hostAdvance` 结束 |

## 7. 可见性裁剪 ClientStateView(`view.ts`,防作弊核心)

```typescript
interface ClientStateView {
  roomCode: string; status: RoomStatus;
  players: { playerId: string; nickname: string; charId?: string; connected: boolean; ready: boolean; isHost: boolean }[];
  self: { charId: string; privateScript: string; storyUnlocked: string[]; objectives: Objective[]; myClues: Clue[] };
  currentPhase: { id: string; kind: PhaseKind; title: string; instruction: string; allowedActions: ActionKind[]; turnCharId?: string; deadline?: number };
  publicCharacters: { id: string; name: string; publicProfile: string; avatar?: string }[]; // 仅公开身份 + 头像
  revealedClues: Clue[];        // 已公开的线索(含道具图)
  sceneImages: Record<string, string>; // sceneId -> 场景图 path
  votesPublic?: Record<string, string>; // vote 环节可选公开
  ending?: { title: string; narrative: string; truthReveal: string }; // 仅 finished 才有
  log: GameEvent[];
}
```
**裁剪规则**:`buildView(state, forCharId)` 必须剔除 `Truth`、`isMurderer`、他人 `privateScript`/`secrets`、未公开/未获取的线索内容。**单元测试必须断言**:非终局阶段任何玩家视图都查不到凶手身份。

## 8. 断线重连与持久化

- **会话令牌**:`join` 成功发 `sessionToken`;断线后 `join` 带 token → 复用原 `PlayerSlot`,标 `connected=true`,补发当前 `ClientStateView` 全量快照。
- **持久化**(`persist.ts`,SQLite):每次状态变更后写房间快照(`roomCode → RuntimeState JSON`)。服务器崩溃重启可从快照恢复进行中的局。MVP 可先只做内存 + 重连,SQLite 快照作为 M3 后半段任务。
- **掉线不阻塞**:`allReady`/`allActed` 判定只算 `connected` 玩家;房主可"踢出/跳过"掉线者(避免卡局)。

## 9. 客户端(`packages/client`)

- `net/`:WebSocket 封装,自动重连(指数退避),收 `ServerMessage` 派发到 store。
- `store/`(Zustand):持有最新 `ClientStateView` + `self`;UI 纯函数渲染。
- `scenes/`:按 `currentPhase.kind` 切换场景组件;`allowedActions` 决定哪些操作按钮可用(服务器仍二次校验)。
- 渲染:角色头像/场景图/线索道具图直接用 `view` 里的 `asset.path`(剧本包静态资源,由服务器一并托管)。
- 私聊面板、线索卡翻看、投票面板、倒计时条为关键组件。

## 10. 任务清单(执行顺序)

1. `schema/protocol.ts` 定稿(ClientIntent / ServerMessage / ClientStateView)。
2. server 骨架:`ws` 服务 + RoomManager + join/创建房间 + 用 **mock 剧本包**加载。
3. `PhaseEngine` 解释器 + `flow.ts`(先支持 always/voteResult)。
4. 五类环节逐个实现 + 子系统(clue/vote/chat/private)。
5. `view.ts` 裁剪 + 防作弊单测。
6. client:net/store/lobby/角色分配/各 scene。
7. 断线重连(sessionToken + 快照补发)。
8. SQLite 快照持久化(可后置)。
9. 自检:本地开 6 个浏览器标签,跑完整一局(开房→分配→各环节→投票→复盘)。

## 11. 验收标准

- [ ] 用 mock 剧本包,6 人(6 个浏览器标签)从开房到复盘跑通完整局。
- [ ] DAG 分支生效:投不同凶手走到不同 `Ending`。
- [ ] 防作弊单测:非终局任何玩家视图不含 `Truth`/他人私密/未获取线索。
- [ ] 回合环节顺序锁生效;自由环节并发广播正常;倒计时推进正常。
- [ ] 任一玩家刷新/断网后凭 token 重连,状态完整恢复。
- [ ] 4 人与 8 人两种人数均可成局。

## 12. 已知难点

- **时钟同步**:倒计时以服务器 `deadline` 时间戳为准,客户端只做展示插值。
- **并发竞态**:`free` 环节多人同时操作 → 服务器单房间串行处理 intent 队列,避免竞态。
- **房主权力**:`hostAdvance`/踢人需校验 `isHost`。
- **带宽**:全量 stateSync 在 8 人 + 大量线索时可能偏大,留 JSON patch 增量优化位(post-MVP)。
