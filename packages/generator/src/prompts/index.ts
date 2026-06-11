export const SYSTEM_PROMPT = `你是一位资深剧本杀编剧和逻辑推理设计师。你的任务是创作结构严谨、推理自洽、角色平衡的剧本杀剧本。

硬约束(不可违反):
1. 可解性:玩家凭借线索能推出凶手身份和作案手法。每个关键线索(pointsTo 非空)必须可达。
2. 无矛盾:角色时间线无冲突,同一人同一时间不在两个地点。
3. 角色平衡:每个非死者角色都有至少一个主线任务、至少 3 条时间线、至少 1 个秘密,并持有或可获取与自己目标相关的线索。
4. 凶手隐藏:凶手的公开身份不应一眼暴露,但线索链最终指向凶手。
5. 线索分配:关键线索分轮次/角色/场景分布,不要集中在一个人身上。
6. 误导合理:误导线索(红鲱鱼)必须有合理的故事支撑,不能是凭空捏造。

输出格式:严格按 tool schema 输出 JSON,不要输出任何额外文字。`;

export function stage1Prompt(params: { players: number; theme: string; difficulty: string }): string {
  return `请为一个 ${params.players} 人剧本杀设计**案件真相内核**。

题材: ${params.theme}
难度: ${params.difficulty}
${params.difficulty === 'hard' || params.difficulty === 'expert' ? '要求:需要 2-3 条误导线索(红鲱鱼),推理路径更曲折。' : ''}

请设计:
1. 剧本标题(title,不要剧透凶手)和一句话简介(synopsis,80-140 字)
2. 凶手身份(1 人,${params.players} 名嫌疑人中)
3. 作案手法(具体的杀人方式)
4. 动机(凶手为什么要杀人)
5. 案件真实时间线(3-5 个关键节点)
6. 完整推理链(solutionChain):玩家从哪些线索能逐步推出真相(用描述性 key,如 "witness_saw_butler"、"poison_missing")
7. 两个结局分支:猜对凶手 → 好结局;猜错 → 坏结局
8. 复盘朗读全文(200-300 字,富有戏剧性地揭晓真相)

案件场景和时代背景要契合"${params.theme}"题材。`;
}

export function stage2Prompt(truth: unknown, params: { players: number; theme: string }): string {
  return `基于以下案件真相,设计 ${params.players + 1} 个角色(含 1 名死者)。

案件真相(已有):
${JSON.stringify(truth, null, 2)}

要求:
- 死者:1 人(isVictim=true),公开身份和与他人的关系
- 凶手:1 人(isMurderer=true),公开身份看似无辜,但拥有动机和秘密
- 其他 ${params.players - 1} 名嫌疑人:每人都应有自己的秘密、动机和可疑之处
- 每个角色需要:公开身份(publicProfile)、私人剧本开头(privateScript)、3-5 个任务目标(至少 1 个 main)、1-3 个秘密、3+ 条时间线、与其他角色的关系
- 角色之间的动机应形成交叉怀疑网络(不只指向凶手一人)
- 每个角色有 visual 头像描述(prompt):画出该角色的形象,风格为 ${params.theme} 题材

性别分布尽量均衡。`;
}

export function stage3Prompt(truth: unknown, characters: unknown, params: { difficulty: string }): string {
  return `基于以下案件真相和角色,设计全部线索和搜证场景。

真相: ${JSON.stringify(truth, null, 2).slice(0, 2000)}
角色: ${(JSON.stringify(characters, null, 2)).slice(0, 2000)}

要求:
1. 场景(scenes):2-4 个搜证地点(如书房、花园、卧室),每个配场景图描述(visual.prompt)
2. 关键线索(isKey=true):至少 5 条,每条都有 pointsTo 指向推理链中的关键节点
3. 误导线索:(${params.difficulty === 'hard' || params.difficulty === 'expert' ? '2-3 条' : '0-1 条'})指向错误方向但有故事支撑
4. 线索分布:
   - visibility: public(全员可见)/private(只有归属者能看到)/searchable(需搜证获取)
   - round: 标明在第 1 还是第 2 轮搜证可获得
   - ownerCharId: 私有线索归属某个角色
5. 确保推理链(solutionChain)中的每一步都有可达的线索支撑
6. 每条线索需有 title 和 content(50-150 字的详细描述)`;
}

export function stage4Prompt(characters: Array<{ id: string; name: string; isVictim?: boolean }>): string {
  const playable = characters.filter((c) => !c.isVictim);
  const charList = playable.map((c) => `- ${c.id}: ${c.name}`).join('\n');

  return `为一场 ${playable.length} 人剧本杀设计标准的环节流程。

可玩角色 ID(只能使用这些 ID,不要使用死者或自造 ID):
${charList}

标准流程:
1. 开场发本(briefing) - 阅读私人剧本
2. 自我介绍(sequential) - 按 turnOrder 轮流发言
3. 第一轮搜证(free, 600s timer) - 解锁 round=1 线索
4. 第一轮讨论(free, hostAdvance) - 圆桌讨论
5. 第二轮搜证(free, 600s timer) - 解锁 round=2 线索 + 分幕剧情解锁
6. 第二轮讨论(free, hostAdvance) - 最后讨论
7. 投票指认(vote) - 同时投票
8. 好结局(reveal) - 猜对凶手
9. 坏结局(reveal) - 猜错

请输出 phases 数组和 flow DAG。
硬约束:
- turnOrder 只能由上面的可玩角色 ID 组成,不能包含死者,不能漏掉任何可玩角色
- 第一轮搜证必须有 unlocks.clueIds,用于解锁 round=1 的 searchable 线索
- 第二轮搜证必须有 unlocks.clueIds 和 unlocks.storyKey="round2",用于解锁 round=2 的 searchable 线索和分幕剧情
- 投票分支的 voteResult.equalsCharId 先留空字符串,后续系统会回填真实凶手 ID`;
}

export function stage5Prompt(characters: unknown, phases: unknown): string {
  return `为以下角色的第二轮剧情设计分幕解锁内容(storyByPhase)。

角色列表: ${(JSON.stringify(characters, null, 2)).slice(0, 2000)}
环节列表: ${(JSON.stringify(phases, null, 2)).slice(0, 1000)}

要求:
- 只需为 storyKey="round2" 的环节写内容(即第二轮搜证解锁的新记忆)
- 每个角色的 round2 内容应是 1-3 句新记忆/发现,推动剧情但不暴露凶手
- 凶手角色的 round2 内容应包含一个需要解释的疑点(制造压力)
- 返回 Record<string, string>,key 是角色 ID,value 是解锁文本`;
}

export function stage6Prompt(styleGuide: string): string {
  return `为所有角色头像、场景图、道具图生成 visual.prompt 画面描述。

全局风格: ${styleGuide || '写实风格,电影质感'}

注意:
- avatar: 角色肖像画,aspect 3:4,详细描述外貌/服饰/表情
- scene: 场景图,aspect 16:9,描述环境氛围/光线/关键物品
- prop: 道具图,aspect 1:1,物品特写

(本阶段不需要重新生成,只需确保所有 visual.prompt 已填充。如果已有描述,保持不变。)`;
}

export function stage7Prompt(truth: unknown, flow: unknown): string {
  return `基于真相和流程分支,完善结局内容。

真相: ${JSON.stringify(truth, null, 2).slice(0, 1500)}
流程: ${JSON.stringify(flow, null, 2)}

要求:
- 确认 endings 数组有两个结局(好/坏)
- truth.reveal 复盘文(200-300 字)完整、有戏剧性
- 每条 ending 的 condition 对应 flow 中的分支`;
}

export const CRITIC_PROMPT = `你是一个严格的逻辑审校。你的唯一任务是找出角色时间线中的矛盾。

审查规则:
- 同一角色不能在同一时间出现在两个不同地点
- 时间线中的时间应有合理顺序
- 行为描述不应与角色身份/动机矛盾

输出格式(JSON):
{ "conflicts": [{ "charId": "xxx", "issue": "描述矛盾点", "suggestion": "修改建议" }] }
如果没有矛盾,输出: { "conflicts": [] }`;
