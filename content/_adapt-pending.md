# md→JSON 适配备忘

## 状态：全部完成（0本待处理）

原 10 本待处理列表中所有脚本已完成 meta.json 适配。

2026-06-27 新增 3 本完整适配（meta + characters + clues + scenes + phases + flow + truth）：

| 剧本 | 目录 | 系列编号 | 角色数 | 线索数 | 场景数 | 阶段数 |
|------|------|:--------:|:------:|:------:|:------:|:------:|
| 枉痴心 | wangchixin | #28 | 6 | 9 | 6 | 7 |
| 孤舟萤 | guzhouying | #29 | 7 | 51 | 5 | 6 |
| 曼娜 | manna | #30 | 7 | 54 | 22 | 6 |

## 适配流程

1. 读取 `md/.raw/` 下各角色目录的 OCR 文本
2. 清洗：去除 HTML 标签、图片引用、OCR 噪音
3. 用 LLM 从清洗后文本生成结构化 JSON：
   - meta.json（剧本元信息）
   - characters/*.json（角色数据）
   - clues.json（线索）
   - scenes.json（场景）
   - phases.json（阶段）
   - flow.json（流程 DAG）
   - truth.json（真相）
4. 运行 `npx tsx scripts/repair-adapted.ts` 修复格式
5. 运行 `npx tsx scripts/verify-scripts.ts` 验证

## 工具

- `scripts/repair-adapted.ts` — 批量格式修复
- `scripts/verify-scripts.ts` — 结构+自洽校验
- `content/ADAPT-GUIDE.md` — 适配规范参考
- `docs/SCRIPT-SPEC.md` — 字段规范
