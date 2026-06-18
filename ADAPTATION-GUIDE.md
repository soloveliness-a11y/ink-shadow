# 剧本杀游戏系统 - 剧本适配指南

## 概述

本指南用于帮助开发者将豪门系列剧本适配到剧本杀游戏系统中。系统支持多种复杂机制，包括多幕结构、关键词触发、抉择机制等。

## 适配流程

### 第一步：OCR转换（PDF→md）

使用PaddleOCR将PDF剧本转换为Markdown格式：

```bash
export PADDLEOCR_TOKEN=<token>
python3 ~/.claude/skills/paddle-ocr/scripts/paddle_ocr.py "<PDF路径>" --save-dir "<输出目录>"
```

### 第二步：全量校验（mimo-v2.5）

使用mimo-v2.5视觉模型逐页校验OCR结果：

```bash
mimo run "请对比这张原图和OCR识别结果，检查是否有错字、漏字、多字或格式错误。" -f "<原图路径>" -f "<md文件路径>" -m xiaomi/mimo-v2.5
```

### 第三步：JSON适配（md→JSON）

将Markdown转换为系统支持的JSON格式：

#### 3.1 创建meta.json

```json
{
  "id": "剧本ID",
  "title": "剧本标题",
  "theme": "时代·场景",
  "playerCount": { "min": 6, "max": 6 },
  "difficulty": "hard",
  "durationMin": 300,
  "synopsis": "一句话简介",
  "styleGuide": "Art style description",
  "cover": {
    "kind": "cover",
    "prompt": "Cover image prompt",
    "aspect": "3:4"
  },
  "schemaVersion": "1.0.0",
  "status": "draft",
  "genre": "murder"
}
```

#### 3.2 创建characters/*.json

每个角色一个JSON文件：

```json
{
  "id": "角色ID",
  "name": "角色名",
  "gender": "male/female",
  "age": 25,
  "isVictim": false,
  "isMurderer": false,
  "publicProfile": "公开身份描述",
  "privateScript": "私有剧本内容",
  "storyByPhase": {
    "act1": "第一幕内容",
    "act2": "第二幕内容"
  },
  "objectives": [
    {
      "id": "obj1",
      "kind": "main",
      "description": "主要目标",
      "scoring": 10
    }
  ],
  "secrets": ["秘密1", "秘密2"],
  "timeline": [
    {
      "time": "9:00",
      "location": "地点",
      "action": "行动",
      "isPublic": false
    }
  ],
  "relationships": [
    {
      "targetCharId": "其他角色ID",
      "relation": "关系",
      "isPublic": false,
      "sharedSecret": "共享秘密"
    }
  ],
  "skills": ["技能1", "技能2"],
  "sceneId": "所在场景ID",
  "keywordMemories": [
    {
      "id": "mem1",
      "keyword": "触发关键词",
      "text": "记忆内容"
    }
  ],
  "visual": {
    "kind": "character",
    "prompt": "角色形象描述",
    "aspect": "3:4"
  }
}
```

#### 3.3 创建clues.json

```json
[
  {
    "id": "线索ID",
    "title": "线索标题",
    "content": "线索内容",
    "sceneId": "所在场景ID",
    "visibility": "searchable",
    "isKey": true,
    "pointsTo": ["指向的真相要素"],
    "visual": {
      "kind": "clue",
      "prompt": "线索图片描述",
      "aspect": "1:1"
    }
  }
]
```

#### 3.4 创建scenes.json

```json
[
  {
    "id": "场景ID",
    "name": "场景名称",
    "description": "场景描述",
    "visual": {
      "kind": "scene",
      "prompt": "场景图片描述",
      "aspect": "16:9"
    }
  }
]
```

#### 3.5 创建phases.json

```json
[
  {
    "id": "阶段ID",
    "kind": "briefing/sequential/free/vote/reveal",
    "title": "阶段标题",
    "instruction": "阶段说明",
    "participants": "all",
    "allowedActions": ["readScript", "speak", "searchClue"],
    "exit": {
      "kind": "allReady/allActed/timer/hostAdvance/voteComplete"
    },
    "unlocks": {
      "storyKey": "解锁的故事",
      "clueIds": ["解锁的线索ID"]
    },
    "clock": {
      "startTime": "21:05",
      "stepMin": 5,
      "endTime": "22:15"
    },
    "choice": {
      "id": "抉择ID",
      "prompt": "抉择说明",
      "options": [
        {
          "id": "选项ID",
          "label": "选项标签",
          "effects": [
            { "kind": "giveClue", "clueId": "线索ID" },
            { "kind": "setFlag", "flag": "标志名" },
            { "kind": "advanceClock" },
            { "kind": "unlockStory", "storyKey": "故事键" },
            { "kind": "jumpPhase", "phaseId": "跳转阶段ID" }
          ]
        }
      ]
    }
  }
]
```

#### 3.6 创建flow.json

```json
{
  "entry": "起始阶段ID",
  "phases": [
    {
      "id": "阶段ID",
      "next": "下一阶段ID"
    }
  ]
}
```

#### 3.7 创建truth.json

```json
{
  "murdererCharIds": ["凶手角色ID"],
  "method": "作案手法",
  "motive": "作案动机",
  "crimeTimeline": [
    {
      "time": "时间",
      "location": "地点",
      "action": "行动",
      "isPublic": false
    }
  ],
  "solutionChain": ["线索ID1", "线索ID2"],
  "reveal": "真相揭示",
  "endings": [
    {
      "id": "结局ID",
      "condition": { "kind": "always" },
      "title": "结局标题",
      "narrative": "结局叙述"
    }
  ]
}
```

## 支持的机制

### 1. 多幕结构
- 使用phases数组定义多个阶段
- 每个阶段可以有不同的参与者、允许的操作、解锁内容

### 2. 关键词触发
- 在角色JSON中定义keywordMemories
- 当其他玩家发言包含关键词时，自动触发记忆

### 3. 抉择机制
- 在phase中定义choice
- 支持多种效果：giveClue、setFlag、advanceClock、unlockStory、jumpPhase

### 4. 时钟机制
- 在phase中定义clock
- 自动推进游戏内时间

### 5. 投票机制
- 支持多种投票模式：char、team、proposal
- 支持平票决胜

### 6. 轮次搜查
- 在phase中定义maxRounds
- 每轮每人一次搜查机会

### 7. 技能触发
- 在线索中定义requiredSkill
- 当角色拥有对应技能时，解锁关联的秘密线索

## 质量检查

### 1. JSON格式验证
```bash
for f in *.json characters/*.json; do python3 -m json.tool "$f" > /dev/null && echo "✓ $f" || echo "✗ $f"; done
```

### 2. 系统兼容性测试
- 选择典型剧本进行测试
- 验证所有机制正常运行
- 修复发现的问题

## 常见问题

### 1. JSON格式错误
- 检查中文引号，使用角引号「」或转义
- 确保所有必填字段都已填写

### 2. 机制不支持
- 检查系统是否已实现该机制
- 参考schema定义，确保字段名称正确

### 3. 前端UI问题
- 检查前端是否支持该机制
- 参考现有剧本的实现

## 参考资料

- 数据模型定义：`packages/schema/src/script.ts`
- 阶段定义：`packages/schema/src/phase.ts`
- 校验逻辑：`packages/schema/src/validate.ts`
- 游戏引擎：`packages/server/src/engine/PhaseEngine.ts`
- 前端实现：`packages/client/src/`
