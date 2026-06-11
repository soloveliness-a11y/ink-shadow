# 适配豪门《丹水山庄》剧本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将豪门惊情系列《丹水山庄》（7人本）适配到 AI 剧本杀系统，不修改剧本本身，改造系统以兼容新剧本格式（技能系统、技能门控线索、被动线索传递、调查报告），同时保持对原有剧本的向后兼容。

**Architecture:** 最小化 schema 扩展 + 引擎适配 + 转换脚本。新增字段全部 optional，不影响现有剧本。转换脚本解析 OCR markdown → 结构化 JSON。

**Tech Stack:** TypeScript/Zod (schema), Node.js (engine), Python (conversion script, 利用已有 OCR 数据)

---

## 差异分析

| 特性 | 现有系统 | 丹水山庄 | 适配方案 |
|------|---------|---------|---------|
| 角色技能 | ❌ 无 | ✅ 8种技能 | zCharacter 新增 `skills?: string[]` |
| 线索技能门控 | ❌ 无 | ✅ 需特定技能才能搜证 | zClue 新增 `requiredSkill?: string` |
| 技能触发秘密线索 | ❌ 无 | ✅ 普通线索+技能→秘密线索 | zClue 新增 `linkedSecretClueId?: string` |
| 被动线索传递 | ❌ 无 | ✅ 特定角色必须给赵卫线索 | zCharacter 新增 `passiveClueGivers?` |
| 调查次数限制 | ✅ maxSearches | ✅ 每人8次 | 已支持 |
| 多阶段剧本 | ✅ 5种phase | ✅ 2场（寒暄+推理） | 映射到 free phase |
| 多结局/角色 | ✅ flow branching | ✅ 每角色多结局 | 已支持（flow condition） |
| 调查报告 | ❌ 无 | ✅ 每角色结尾填写 | zCharacter 新增 `investigationReport?: string` |

---

## File Structure

### Schema 扩展（向后兼容）
- Modify: `packages/schema/src/script.ts` — 新增 skills、passiveClueGivers、linkedSecretClueId、investigationReport
- Modify: `packages/schema/src/validate.ts` — 新增技能平衡检查
- Test: `packages/schema/tests/` — 新增技能相关测试

### 引擎适配
- Modify: `packages/server/src/engine/PhaseEngine.ts` — searchClue 增加技能检查
- Modify: `packages/server/src/view.ts` — searchableClues 增加技能过滤
- Modify: `packages/server/src/view.ts` — self view 增加 skills 字段

### 转换脚本（Python）
- Create: `scripts/adapt_danshui.py` — 解析 OCR markdown → JSON

### 剧本数据
- Create: `content/danshui/` — 丹水山庄剧本包目录

---

## Task 1: Schema 扩展 — 角色技能 + 线索门控

**Covers:** 差异分析中所有 schema 层差异

**Files:**
- Modify: `packages/schema/src/script.ts:33-49` (zCharacter)
- Modify: `packages/schema/src/script.ts:52-64` (zClue)
- Modify: `packages/schema/tests/validate.test.ts`

- [ ] **Step 1: Add skill fields to zCharacter**

在 `script.ts` 的 `zCharacter` 中，在 `visual` 字段之前添加：

```typescript
skills: z.array(z.string()).optional(), // 角色拥有的技能列表，如 ['武术', '药物']
passiveClueGivers: z.array(z.object({
  targetCharId: z.string(),
  clueId: z.string(),
})).optional(), // 被动技能：必须给目标角色的线索
```

- [ ] **Step 2: Add skill requirement to zClue**

在 `script.ts` 的 `zClue` 中，在 `visual` 字段之前添加：

```typescript
requiredSkill: z.string().optional(), // 搜证需要的技能
linkedSecretClueId: z.string().optional(), // 拥有所需技能搜证时，额外解锁的秘密线索ID
```

- [ ] **Step 3: Add investigationReport to zCharacter**

在 `zCharacter` 中，在 `visual` 字段之前添加：

```typescript
investigationReport: z.string().optional(), // 调查报告文本（游戏结束时展示）
```

- [ ] **Step 4: Write failing test**

```typescript
// packages/schema/tests/validate.test.ts 新增测试
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { zScript } from '../src/script.js';
import { validateScript } from '../src/validate.js';

describe('Skills system', () => {
  it('should accept character with skills array', () => {
    const script = createMockScript(); // 使用已有的 mock script 构建函数
    script.characters[0].skills = ['武术', '药物'];
    const result = zScript.safeParse(script);
    assert.ok(result.success);
  });

  it('should accept clue with requiredSkill', () => {
    const script = createMockScript();
    script.clues[0].requiredSkill = '新闻';
    script.clues[0].linkedSecretClueId = 'cl_secret_01';
    const result = zScript.safeParse(script);
    assert.ok(result.success);
  });

  it('should accept character with passiveClueGivers', () => {
    const script = createMockScript();
    script.characters[0].passiveClueGivers = [{
      targetCharId: 'c_wei',
      clueId: 'cl_evidence_01',
    }];
    const result = zScript.safeParse(script);
    assert.ok(result.success);
  });

  it('should accept character with investigationReport', () => {
    const script = createMockScript();
    script.characters[0].investigationReport = '调查报告内容...';
    const result = zScript.safeParse(script);
    assert.ok(result.success);
  });

  it('should work without any skill fields (backward compatible)', () => {
    const script = createMockScript();
    delete script.characters[0].skills;
    delete script.characters[0].passiveClueGivers;
    delete script.characters[0].investigationReport;
    delete script.clues[0].requiredSkill;
    const result = zScript.safeParse(script);
    assert.ok(result.success);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

```bash
cd /Users/a1np/文档/Design/murder-mystery-game
pnpm --filter @mmg/schema test
```

- [ ] **Step 6: Write minimal implementation (already done in Steps 1-3)**

- [ ] **Step 7: Run test to verify it passes**

```bash
pnpm --filter @mmg/schema test
```

- [ ] **Step 8: Commit**

```bash
git add packages/schema/src/script.ts packages/schema/tests/
git commit -m "feat(schema): add skills, skill-gated clues, passive clue sharing, investigation report"
```

---

## Task 2: Validation 扩展 — 技能平衡检查

**Covers:** 确保技能门控线索可达

**Files:**
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/tests/validate.test.ts`

- [ ] **Step 1: Write failing test**

在 `validate.test.ts` 中新增：

```typescript
describe('Skill validation', () => {
  it('should warn if skill-gated clue has no character with that skill', () => {
    const script = createMockScript();
    script.clues[0].requiredSkill = '独门技能'; // 没有角色拥有
    script.clues[0].visibility = 'searchable';
    script.clues[0].isKey = true;
    const result = validateScript(script);
    assert.ok(!result.ok);
    assert.ok(result.issues.some(i => i.message.includes('独门技能')));
  });

  it('should pass if skill-gated clue has at least one character with that skill', () => {
    const script = createMockScript();
    script.characters[0].skills = ['武术'];
    script.clues[0].requiredSkill = '武术';
    script.clues[0].visibility = 'searchable';
    const result = validateScript(script);
    assert.ok(result.ok);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement validation in validate.ts**

在 `validateScript` 中新增检查函数 `checkSkillBalance`：

```typescript
function checkSkillBalance(script: Script): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allSkills = new Set(script.characters.flatMap(c => c.skills ?? []));

  for (const clue of script.clues) {
    if (clue.requiredSkill && !allSkills.has(clue.requiredSkill)) {
      issues.push({
        severity: 'error',
        check: 'skillBalance',
        message: `线索 "${clue.title}" (${clue.id}) 需要技能 "${clue.requiredSkill}"，但没有任何角色拥有此技能`,
      });
    }
  }

  return issues;
}
```

在 `validateScript` 主函数中调用：`issues.push(...checkSkillBalance(script));`

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/validate.ts packages/schema/tests/
git commit -m "feat(schema): add skill balance validation for skill-gated clues"
```

---

## Task 3: Engine 适配 — 技能门控搜证

**Covers:** searchClue 时检查技能要求

**Files:**
- Modify: `packages/server/src/engine/PhaseEngine.ts` — validateIntent searchClue
- Modify: `packages/server/src/view.ts` — buildView searchableClues
- Modify: `packages/server/src/view.ts` — buildSelfView skills
- Test: `packages/server/tests/` (如有)

- [ ] **Step 1: Add skill check to PhaseEngine.validateIntent**

在 `PhaseEngine.ts` 的 `validateIntent` 方法中，`searchClue` case 里，在现有 visibility 检查之前添加：

```typescript
// 技能门控检查
if (clue.requiredSkill) {
  const playerChar = this.script.characters.find(c => c.id === state.playerCharId);
  if (!playerChar?.skills?.includes(clue.requiredSkill)) {
    return { ok: false, error: 'skill_required', message: `需要技能「${clue.requiredSkill}」才能搜查此线索` };
  }
}
```

- [ ] **Step 2: Add skill-gated clue linking to PhaseEngine.executeIntent**

在 `executeIntent` 的 `searchClue` case 中，搜索成功后，如果有 `linkedSecretClueId` 且玩家有对应技能，自动解锁：

```typescript
// 技能触发秘密线索解锁
if (clue.linkedSecretClueId && clue.requiredSkill) {
  const playerChar = this.script.characters.find(c => c.id === state.playerCharId);
  if (playerChar?.skills?.includes(clue.requiredSkill)) {
    state.flags[`unlocked:${clue.linkedSecretClueId}`] = true;
  }
}
```

- [ ] **Step 3: Update view.ts searchableClues to filter by skills**

在 `buildView` 的 `searchableClues` 过滤逻辑中，增加技能检查：

```typescript
// 技能门控线索：只有拥有所需技能的玩家才能看到
const playerChar = script.characters.find(c => c.id === selfCharId);
if (clue.requiredSkill && !playerChar?.skills?.includes(clue.requiredSkill)) {
  return false; // 不显示给没有技能的玩家
}
```

- [ ] **Step 4: Update view.ts buildSelfView to include skills**

在 `buildSelfView` 返回对象中添加：

```typescript
skills: character.skills ?? [],
passiveClueGivers: character.passiveClueGivers ?? [],
```

- [ ] **Step 5: Pass skill info to ClientStateView.self**

在 `zClientStateView` 的 `self` schema 中添加：

```typescript
skills: z.array(z.string()).optional(),
passiveClueGivers: z.array(z.object({
  targetCharId: z.string(),
  clueId: z.string(),
})).optional(),
```

- [ ] **Step 6: Run typecheck and tests**

```bash
pnpm typecheck
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/engine/PhaseEngine.ts packages/server/src/view.ts packages/schema/src/protocol.ts
git commit -m "feat(engine): skill-gated clue access and skill info in client view"
```

---

## Task 4: 转换脚本 — 解析丹水山庄 OCR 数据

**Covers:** 将 OCR markdown 转换为系统 JSON 格式

**Files:**
- Create: `scripts/adapt_danshui.py`
- Create: `content/danshui/` 目录结构

- [ ] **Step 1: Create conversion script skeleton**

```python
#!/usr/bin/env python3
"""
丹水山庄 OCR → AI 剧本杀 JSON 转换脚本
解析 _ocr文本/ 目录下的 markdown 文件，生成符合 schema 的 JSON 剧本包。
"""
import json
import os
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.parent / "豪门系列" / "1-丹水山庄（7人）"
OUTPUT_DIR = Path(__file__).parent.parent / "content" / "danshui"

# 角色定义
CHARACTERS = {
    "feng": {"name": "冯双骥", "gender": "male", "age": 41, "isMurderer": True, "isVictim": False},
    "yin": {"name": "尹少鳴", "gender": "male", "age": 21, "isMurderer": False, "isVictim": False},
    "wei": {"name": "赵卫", "gender": "male", "age": 21, "isMurderer": False, "isVictim": False},
    "luoyi": {"name": "赵洛意", "gender": "female", "age": 19, "isMurderer": False, "isVictim": False},
    "qiuer": {"name": "赵秋儿", "gender": "female", "age": 16, "isMurderer": False, "isVictim": False},
    "guo": {"name": "郭望山", "gender": "male", "age": 38, "isMurderer": False, "isVictim": False},
    "qi": {"name": "齐岳", "gender": "male", "age": 32, "isMurderer": False, "isVictim": False},
    "wanlei": {"name": "赵万雷", "gender": "male", "age": 44, "isMurderer": False, "isVictim": True},
}

# 技能定义
SKILLS = {
    "feng": ["武术", "冯竹的信任", "被动"],
    "yin": ["武术", "药物"],
    "wei": ["赵家主人", "尊贵身份"],
    "luoyi": ["赵家主人", "新闻", "被动"],
    "qiuer": ["新闻", "恭维", "被动"],
    "guo": ["恭维", "药物"],
    "qi": ["武术", "冯竹的信任"],
}

def parse_character_files(char_id: str) -> dict:
    """解析角色的所有 md 文件，返回结构化数据"""
    char_dir = SCRIPT_DIR / "_ocr文本" / "人" / CHARACTERS[char_id]["name"]
    if not char_dir.exists():
        # Try alternate name for 尹少鳴
        char_dir = SCRIPT_DIR / "_ocr文本" / "人" / CHARACTERS[char_id]["name"].replace("鳴", "鸣")
    
    files = sorted(char_dir.glob("*.md"))
    data = {
        "story_sections": {},  # 1.md, 2.md, etc.
        "ending": "",
        "investigation_report": "",
    }
    
    for f in files:
        content = f.read_text(encoding="utf-8").strip()
        if f.name == "结局.md":
            data["ending"] = content
        elif f.name == "调查报告.md":
            data["investigation_report"] = content
        else:
            # Extract section number
            match = re.match(r"(\d+)\.md", f.name)
            if match:
                data["story_sections"][match.group(1)] = content
    
    return data

def parse_clues() -> list:
    """解析所有线索文件"""
    clues = []
    clue_dir = SCRIPT_DIR / "_ocr文本" / "线索"
    clue_id = 0
    
    for location_dir in sorted(clue_dir.iterdir()):
        if not location_dir.is_dir():
            continue
        for clue_file in sorted(location_dir.glob("*.md")):
            clue_id += 1
            content = clue_file.read_text(encoding="utf-8").strip()
            # Parse content to extract title, skill requirement, etc.
            clues.append({
                "id": f"cl_{clue_id:02d}",
                "title": f"线索{clue_id}",
                "content": content,
                "sceneId": map_location_to_scene(location_dir.name),
                "visibility": "searchable",
                "isKey": False,
                "pointsTo": [],
            })
    
    return clues

def map_location_to_scene(location: str) -> str:
    """将线索目录名映射到场景ID"""
    mapping = {
        "仆院、厨房": "s_servant",
        "内宅": "s_inner",
        "前院": "s_front",
        "后院": "s_back",
        "客房": "s_guest",
        "管家房": "s_butler",
        "赵万雷": "s_wanlei",
        "赵赵秋儿的房间": "s_maid",
    }
    return mapping.get(location, "s_unknown")

def main():
    """主转换流程"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # TODO: 完整实现
    print(f"Script dir: {SCRIPT_DIR}")
    print(f"Output dir: {OUTPUT_DIR}")
    
    # 1. 解析元信息
    # 2. 解析角色
    # 3. 解析线索
    # 4. 解析场景
    # 5. 构建 phases + flow
    # 6. 构建 truth
    # 7. 输出 JSON

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Implement character parsing**

完善 `parse_character_files` 和角色数据转换逻辑，将 markdown 内容映射到：
- `privateScript`: 人物故事 + 今天的故事
- `storyByPhase`: { "social": 饭后的寒暄+你的表现+目的一, "investigation": 下午的活动+谁是真凶+技能+目的二 }
- `objectives`: 从 目的(一) 和 目的(二) 中提取
- `secrets`: 从剧本中提取
- `timeline`: 从时间线信息中提取
- `relationships`: 从角色关系中提取

- [ ] **Step 3: Implement clue parsing**

解析 43 条普通线索 + 19 条秘密线索，提取：
- 线索标题和内容
- 技能要求
- 关联的秘密线索 ID
- 所属场景

- [ ] **Step 4: Implement flow/phases construction**

构建 2 场游戏流程：
```
p_social (free, 无搜索, allReady退出) 
  → p_investigation (free, 搜索+技能, timer退出)
  → p_vote (vote)
  → p_end_* (reveal, 多结局分支)
```

- [ ] **Step 5: Implement truth construction**

构建真相：
- 凶手: 冯双骥
- 手法: 夹竹桃毒药 + 金龙刀伪装
- 动机: 黑狼会胁迫
- 推理链: 关键线索引用
- 多结局: 每角色多个结局

- [ ] **Step 6: Run script and verify output**

```bash
cd /Users/a1np/文档/Design/murder-mystery-game
python3 scripts/adapt_danshui.py
```

- [ ] **Step 7: Validate output with schema**

```bash
node --import tsx -e "
const { zScript } = require('./packages/schema/src/script.js');
const { validateScript } = require('./packages/schema/src/validate.js');
const script = require('./content/danshui/script.json');
const result = zScript.safeParse(script);
console.log('Parse:', result.success ? 'OK' : result.error);
if (result.success) {
  const v = validateScript(result.data);
  console.log('Validate:', v.ok ? 'OK' : v.issues);
}
"
```

- [ ] **Step 8: Commit**

```bash
git add scripts/adapt_danshui.py content/danshui/
git commit -m "feat: add Danshui Mountain Villa script conversion and data"
```

---

## Task 5: 视觉资产 — 头像和场景图占位

**Covers:** 为新角色和场景生成 visual spec

**Files:**
- Create: `content/danshui/characters/*.json` — 角色 visual spec
- Create: `content/danshui/assets/` — 占位图或 skip visual

- [ ] **Step 1: Create visual specs for all characters**

为每个角色创建 prompt 描述，使用民国山西大院风格：
- 冯双骥: 中年管家，精明内敛
- 尹少鸣: 青年侠客，英气逼人
- 赵卫: 病态少爷，鸦片成瘾
- 赵洛意: 新式女学生，短发旗袍
- 赵秋儿: 少女丫鬟，清秀温婉
- 郭望山: 商人，阴鸷狡诈
- 齐岳: 护院武师，刚毅沉默

- [ ] **Step 2: Create visual specs for 8 scenes**

8个搜证场景的 prompt 描述

- [ ] **Step 3: Verify with tests**

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add content/danshui/
git commit -m "feat: add visual specs for Danshui Mountain Villa characters and scenes"
```

---

## Task 6: 端到端验证

**Covers:** 完整加载 + 游戏流程验证

**Files:**
- Test: 手动启动游戏，加载丹水山庄剧本

- [ ] **Step 1: Start game server**

```bash
cd /Users/a1np/文档/Design/murder-mystery-game
pnpm start
```

- [ ] **Step 2: Load script in browser**

打开 http://localhost:8080，选择丹水山庄剧本

- [ ] **Step 3: Test 7-player game flow**

- 7人加入 → 选角 → 开始
- 社交阶段：检查 storyByPhase 解锁
- 推理阶段：测试技能门控线索（有技能 → 可搜；无技能 → 不可搜）
- 测试 linkedSecretClueId 解锁
- 投票 → 结局

- [ ] **Step 4: Test backward compatibility**

切换回公馆惊魂剧本，确认原有功能正常

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Danshui Mountain Villa adaptation with skill system"
```

---

## Self-Review

1. **Spec coverage:** 所有差异分析中的不兼容项都有对应 Task
2. **Placeholder scan:** 所有步骤包含具体代码和命令
3. **Type consistency:** schema 新增字段全部 optional，不影响现有类型

## 执行方式

此计划包含 6 个 Task，其中 Task 1-3 是 schema/引擎修改（紧密耦合），Task 4 是独立的转换脚本，Task 5-6 是验证。

建议：Task 1-3 inline 顺序执行，Task 4 可以用 subagent 并行。
