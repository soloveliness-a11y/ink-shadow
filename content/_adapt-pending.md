# md→JSON 适配备忘

## 状态：待处理（10本）

| 剧本 | 目录 | OCR 文件数 | 总行数 | 缺失页 | 优先级 |
|------|------|:---------:|:------:|:------:|:------:|
| 失真的旋律 | shizhen | 38 | 226 | 3 | 低（数据不完整） |
| 武器云浮 | wuqiyunfu | 33 | 328 | 6 | 低（数据不完整） |
| 望海祠 | wanghaici | 37 | 1048 | 0 | 中 |
| 夜壶游谈 | yehuyoutan | 37 | 2038 | 0 | 中 |
| 浮泉楼 | fuquanlou | 38 | 2100 | 0 | 中 |
| 全之馆 | quanzhiguan | 38 | 2116 | 0 | 中 |
| 一室之门 | yishizhihmen | 66 | 1954 | 0 | 中 |
| 七寻阿姨 | qixunaiji | 72 | 1742 | 0 | 中 |
| 绝崖雕 | jueyadiao | 49 | 3657 | 0 | 高（OCR校验已完成） |
| 张东镇 | zhangdongzhen | 49 | 4295 | 0 | 高（OCR校验已完成） |

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
