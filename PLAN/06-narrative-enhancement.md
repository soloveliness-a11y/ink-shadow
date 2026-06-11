# 叙事系统增强设计

> **状态：已实施** ✅ | 实施日期：2026-06-09

## 一、剧本结构增强：新增4个叙事阶段

### 当前流程 vs 增强后流程

```
当前：brief → intro → search1 → discuss1 → search2 → discuss2 → vote → reveal → finished
增强：brief →【案前风云】→【命案前夕】→ intro → search1 → discuss1 →【迷雾重重】→ search2 → discuss2 →【最后推论】→ vote →【真相揭晓(增强)】→ finished
```

### 实施方法

采用 **Schema最小侵入方案**：
- 在 `Phase` 中新增可选字段 `narrativeText?: string`
- 复用现有 `briefing` PhaseKind
- BriefingScene 检测 `narrativeText` 存在时自动切换为叙事文本模式
- 无需新增PhaseKind、无需新建Scene组件、无需修改PhaseEngine

### 变更清单

| 文件 | 变更 | 
|------|------|
| `packages/schema/src/phase.ts` | Phase 新增 `narrativeText` 字段 |
| `packages/schema/src/protocol.ts` | currentPhase 新增 `narrativeText` |
| `packages/server/src/view.ts` | buildPhaseView 传递 `narrativeText` |
| `packages/client/src/scenes/Briefing.tsx` | 叙事文本模式UI |
| `packages/client/src/styles/base.css` | `.narrative-scene` 等样式 |
| `content/_mock/script.json` | 新增4个叙事阶段+完整叙事文本+场景线索重分配+增强结局 |

---

## 二、新增叙事阶段详情

| 阶段ID | 标题 | 位置 | 叙事文本字数 | 功能 |
|--------|------|------|-------------|------|
| p_backstory | 案前风云 | brief后 | ~1100字 | 6角色假伏笔建立 |
| p_prologue | 命案前夕 | backstory后 | ~900字 | 案发前过渡剧情 |
| p_guided | 迷雾重重 | discuss1后 | ~800字 | 深化误导/引导思考 |
| p_narrow | 最后推论 | discuss2后 | ~650字 | 收束引出投票 |

完整叙事内容见：`PLAN/07-narrative-content.md`

---

## 三、场景线索重新分配

### 新增线索

| ID | 标题 | 场景 | 轮次 | 关键 |
|----|------|------|------|------|
| cl_banquet_menu | 宴席菜单与座次表 | s_hall | 1 | no |
| cl_broken_glass | 碎裂的酒杯 | s_hall | 1 | yes |
| cl_cigarette_butts | 花园的烟蒂 | s_garden | 1 | yes |
| cl_garden_footprint | 泥土中的鞋印 | s_garden | 2 | yes |
| cl_torn_note | 撕碎的字条 | s_garden | 2 | no |

### 调整后各场景可搜索线索数

| 场景 | 第一轮 | 第二轮 | 合计 |
|------|--------|--------|------|
| 书房(s_study) | 2 | 2 | 4 |
| 客厅(s_hall) | 2 | 0 | 2 |
| 花园(s_garden) | 1 | 2 | 3 |

---

## 四、剧本呈现改进：仿纸质书 ScriptBook

### 实施位置
- 新建 `packages/client/src/components/ScriptBook.tsx`
- 样式追加至 `packages/client/src/styles/base.css`
- 集成至 `packages/client/src/App.tsx`

### 功能特性
- 📖 **浮动图标入口**：右下角金色书本图标，仅游戏中显示
- 📄 **仿纸质书UI**：左右双页展开+书脊+页码，纸质纹理背景
- 🖊️ **文本标注**：黄色/绿色/蓝色高亮、下划线、摘录
- 📋 **导出摘录**：一键复制所有摘录到剪贴板
- 💾 **本地持久化**：标注数据存于 localStorage，按 scriptId+playerId 隔离
- 📱 **移动端适配**：小屏自动切换为单页模式，隐藏书脊和右页

### 兼容性
- 零 Schema 变更
- 零服务端协议变更
- 纯前端功能，仅依赖现有 `useGameStore` 读取 view 数据
- 使用 `localStorage` 键前缀 `mmg:script-annos:` 避免与其他数据冲突
