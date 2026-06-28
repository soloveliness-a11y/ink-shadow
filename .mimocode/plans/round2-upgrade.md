# 第二轮全方位升级方案

> 基于4个并行分析子代理（UI细节/交互流程/Bug扫描/性能架构）的交叉碰撞结果

---

## 一、关键Bug修复（3项）

| # | 问题 | 位置 | 修复方案 |
|---|------|------|----------|
| 1 | WaitingPanel字体变量错误 | WaitingPanel.css:9 | `var(--f)` → `var(--fb)` |
| 2 | 私聊气泡颜色不一致 | WaitingPanel.css:246 | `var(--accent-dim)` → `var(--accent-m)` |
| 3 | RoomManager磁盘数据未校验 | RoomManager.ts:146 | 用zod校验后再使用 |

---

## 二、UI细节修复（10项中优先级）

| # | 问题 | 修复方案 |
|---|------|----------|
| 1 | Vote嫌疑人简介硬截断 | `.slice()` → CSS `-webkit-line-clamp` |
| 2 | Reveal真相文本硬截断 | `.slice()` → CSS line-clamp + 展开按钮 |
| 3 | Assigning移动端肖像过窄 | 480px断点改为单列 |
| 4 | Vote移动端卡片过窄 | minmax调整为140px |
| 5 | Header触控目标过小 | 添加min-width/min-height: 44px |
| 6 | Briefing等待列表溢出 | 改为"等待N人"折叠展示 |
| 7 | Briefing底部sticky遮挡 | 内容区增加padding-bottom |
| 8 | CharacterSidebar handle定位 | 添加position: relative |
| 9 | Reveal对比卡片移动端 | 改为单列布局 |
| 10 | 浮动元素重叠 | 统一层级分配策略 |

---

## 三、交互体验增强（8项）

| # | 问题 | 修复方案 |
|---|------|----------|
| 1 | 搜证成功缺少视觉确认 | 添加loading状态+成功动画 |
| 2 | 搜证无确认步骤 | 添加ConfirmDialog确认 |
| 3 | 投票/推理乐观更新无回退 | 监听error事件重置状态 |
| 4 | 大厅等待无引导 | 添加动画脉冲+邀请引导 |
| 5 | 角色离线状态不醒目 | 添加灰色蒙层+离线标签 |
| 6 | 搜证轮次信息不直观 | SearchTab内显示轮次 |
| 7 | 成就解锁toast不醒目 | 显示成就名称和图标 |
| 8 | 返回大厅用reload | 改为状态重置 |

---

## 四、性能优化（3项高优先级）

| # | 问题 | 收益 | 修复方案 |
|---|------|------|----------|
| 1 | BGM音频占dist 69MB | dist 69MB→<1MB | 音频改为运行时加载 |
| 2 | zod打入客户端bundle | JS -56KB | schema类型/runtime分离 |
| 3 | howler.js打入主bundle | JS -43KB | 改为dynamic import |

---

## 五、代码质量（3项）

| # | 问题 | 修复方案 |
|---|------|----------|
| 1 | DmService静默catch无日志 | 添加console.warn |
| 2 | Room DM异步调用静默失败 | 添加warn日志 |
| 3 | 魔法数字 | 提取为常量 |

---

## 执行计划

### Phase 1: Bug+UI修复（1轮）
- 修复3个关键Bug
- 修复10个中优先级UI问题

### Phase 2: 交互增强（1轮）
- 实现8个交互体验增强

### Phase 3: 性能优化（1轮）
- 3个高优先级性能优化

### Phase 4: 全量校验
- TypeScript类型检查
- 全量测试
- 构建验证
