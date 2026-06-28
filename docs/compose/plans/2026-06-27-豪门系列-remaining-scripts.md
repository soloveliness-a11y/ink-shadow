# 豪门系列剩余15本剧本 OCR→校验→适配 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成豪门系列剩余15本剧本（28-42）的OCR提取、视觉校验、JSON适配，使全部42本豪门系列剧本可在数字平台运行。

**Architecture:** 三阶段流水线：PaddleOCR提取文本 → mimo-v2.5视觉比对校验 → LLM结构化JSON适配。每本剧本独立处理，输出到 `content/<pinyin>/` 目录。

**Tech Stack:** PaddleOCR VL (OCR), mimo-v2.5 (视觉校验), TypeScript (适配脚本), Zod (schema验证)

## Global Constraints

- OCR输出目录：`豪门系列/<编号>-<名称>/md/.raw/<角色名>/` (doc_N.md + layout_det_res_N.jpg)
- JSON输出目录：`content/<pinyin>/` (meta.json + characters/ + clues.json + phases.json + flow.json + truth.json)
- 所有适配脚本必须通过 `npx tsx scripts/verify-scripts.ts` 校验
- OCR文本必须与原图逐字比对，记录所有差异
- 优先级：高（OCR校验已完成）→ 中（数据充足）→ 低（数据不完整）

---

## 状态总览

| 编号 | 名称 | 格式 | 角色数 | 优先级 | 状态 |
|:----:|------|------|:------:|:------:|:----:|
| 28 | 枉痴心 | JPG图片 | 6 | 中 | 待OCR |
| 29 | 孤舟萤 | PDF | 7 | 中 | 待OCR |
| 30 | 曼娜 | PDF | 6 | 中 | 待OCR |
| 31 | 冥海缒幽 | PDF(加密) | 5 | 中 | 待OCR |
| 32 | 诅家庄豪门 | PDF | 7 | 中 | 待OCR |
| 33 | 春味社 | PDF | 7 | 中 | 待OCR |
| 34 | 魍魉塔 | PDF | 7 | 中 | 待OCR |
| 35 | 雨异妍 | PDF | 7 | 中 | 待OCR |
| 36 | 先灵祭 | PDF | 7 | 中 | 待OCR |
| 37 | 蠹虫 | PDF | 9 | 中 | 待OCR |
| 38 | 烛影额妆 | PDF | 7 | 中 | 待OCR |
| 39 | 离地三寸 | PDF | 7 | 中 | 待OCR |
| 40 | 暗波崖 | PDF | 9 | 中 | 待OCR |
| 41 | 歧路梢 | PDF | 9 | 中 | 待OCR |
| 42 | 双影共秀 | PDF | 13 | 中 | 待OCR |

---

## Task 1: 批量OCR提取（15本）

**Covers:** 阶段1 - 素材审查

**Files:**
- Create: `豪门系列/<编号>-<名称>/md/.raw/<角色名>/doc_N.md`
- Create: `豪门系列/<编号>-<名称>/md/.raw/<角色名>/layout_det_res_N.jpg`

**Interfaces:**
- Consumes: PDF/JPG源文件
- Produces: OCR文本(doc_N.md) + 布局检测图片(layout_det_res_N.jpg)

- [ ] **Step 1: 处理28-枉痴心（JPG格式）**

```bash
# 28-枉痴心 使用JPG图片，需逐个角色处理
# 每个角色目录下有1-6.jpg，用PaddleOCR VL提取文本
for char_dir in "/Users/a1np/文档/Design/murder-mystery-game/豪门系列/28-枉痴心/剧本/"*/; do
  char_name=$(basename "$char_dir")
  output_dir="/Users/a1np/文档/Design/murder-mystery-game/豪门系列/28-枉痴心/md/.raw/${char_name}"
  mkdir -p "$output_dir"
  
  page=1
  for img in "${char_dir}"*.jpg; do
    python3 ~/.agents/skills/paddle-ocr/scripts/paddle_ocr.py "$img" \
      --save-dir "$output_dir" \
      --model vl \
      --timeout 600
    # 重命名输出文件为 doc_N.md 和 layout_det_res_N.jpg
    # (PaddleOCR输出文件名可能不同，需根据实际输出调整)
    ((page++))
  done
done
```

- [ ] **Step 2: 处理29-孤舟萤（PDF格式）**

```bash
# 29-孤舟萤 使用PDF格式
for pdf in "/Users/a1np/文档/Design/murder-mystery-game/豪门系列/29-孤舟萤（无水印）/剧本/"*.pdf; do
  char_name=$(basename "$pdf" .pdf)
  output_dir="/Users/a1np/文档/Design/murder-mystery-game/豪门系列/29-孤舟萤（无水印）/md/.raw/${char_name}"
  mkdir -p "$output_dir"
  
  python3 ~/.agents/skills/paddle-ocr/scripts/paddle_ocr.py "$pdf" \
    --save-dir "$output_dir" \
    --model vl \
    --timeout 600
done
```

- [ ] **Step 3: 处理30-曼娜（PDF格式）**

```bash
# 30-曼娜 使用PDF格式
for pdf in "/Users/a1np/文档/Design/murder-mystery-game/豪门系列/30-曼娜（开本整理）/剧本/"*.pdf; do
  char_name=$(basename "$pdf" .pdf | sed 's/^[0-9]*\.//')
  output_dir="/Users/a1np/文档/Design/murder-mystery-game/豪门系列/30-曼娜（开本整理）/md/.raw/${char_name}"
  mkdir -p "$output_dir"
  
  python3 ~/.agents/skills/paddle-ocr/scripts/paddle_ocr.py "$pdf" \
    --save-dir "$output_dir" \
    --model vl \
    --timeout 600
done
```

- [ ] **Step 4: 处理31-冥海缒幽（加密PDF）**

```bash
# 31-冥海缒幽 PDF文件名含_encrypt，可能需要密码
# 先尝试无密码OCR，如果失败则记录并跳过
for pdf in "/Users/a1np/文档/Design/murder-mystery-game/豪门系列/31-冥海缒幽/剧本/"*.pdf; do
  char_name=$(basename "$pdf" _encrypt.pdf)
  output_dir="/Users/a1np/文档/Design/murder-mystery-game/豪门系列/31-冥海缒幽/md/.raw/${char_name}"
  mkdir -p "$output_dir"
  
  python3 ~/.agents/skills/paddle-ocr/scripts/paddle_ocr.py "$pdf" \
    --save-dir "$output_dir" \
    --model vl \
    --timeout 600 || echo "FAILED: $pdf (可能需要密码)"
done
```

- [ ] **Step 5: 批量处理32-42（PDF格式）**

```bash
# 32-42 均为PDF格式，批量处理
for script_num in 32 33 34 35 36 37 38 39 40 41 42; do
  # 查找对应目录
  script_dir=$(find "/Users/a1np/文档/Design/murder-mystery-game/豪门系列/" -maxdepth 1 -name "${script_num}-*" -type d | head -1)
  if [[ -z "$script_dir" ]]; then
    echo "SKIP: ${script_num} 目录不存在"
    continue
  fi
  
  script_name=$(basename "$script_dir")
  echo "Processing: $script_name"
  
  # 处理每个PDF
  for pdf in "${script_dir}/剧本/"*.pdf; do
    char_name=$(basename "$pdf" .pdf | sed 's/^[0-9]*\.//')
    output_dir="${script_dir}/md/.raw/${char_name}"
    mkdir -p "$output_dir"
    
    python3 ~/.agents/skills/paddle-ocr/scripts/paddle_ocr.py "$pdf" \
      --save-dir "$output_dir" \
      --model vl \
      --timeout 600 || echo "FAILED: $pdf"
  done
done
```

- [ ] **Step 6: 验证OCR输出完整性**

```bash
# 检查每个脚本的OCR输出
for script_num in 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42; do
  script_dir=$(find "/Users/a1np/文档/Design/murder-mystery-game/豪门系列/" -maxdepth 1 -name "${script_num}-*" -type d | head -1)
  if [[ -z "$script_dir" ]]; then continue; fi
  
  script_name=$(basename "$script_dir")
  raw_dir="${script_dir}/md/.raw"
  
  if [[ ! -d "$raw_dir" ]]; then
    echo "❌ $script_name: 无OCR输出"
    continue
  fi
  
  char_count=$(ls -d "${raw_dir}"/*/ 2>/dev/null | wc -l | tr -d ' ')
  doc_count=$(find "${raw_dir}" -name "doc_*.md" 2>/dev/null | wc -l | tr -d ' ')
  
  echo "$script_name: ${char_count}角色, ${doc_count}个doc文件"
done
```

---

## Task 2: 视觉校验（mimo-v2.5比对）

**Covers:** 阶段1 - 素材审查（原文验证）

**Files:**
- Read: `豪门系列/<编号>-<名称>/md/.raw/<角色名>/doc_N.md`
- Read: `豪门系列/<编号>-<名称>/md/.raw/<角色名>/layout_det_res_N.jpg`

**Interfaces:**
- Consumes: OCR文本 + 布局检测图片
- Produces: 校验报告（差异记录）

- [ ] **Step 1: 校验28-枉痴心各角色OCR文本**

```bash
# 对每个角色的每个doc文件进行视觉校验
# 使用Read工具读取layout_det_res_N.jpg，与doc_N.md逐字比对
# 记录所有OCR错误（错字、漏字、多字）

# 校验流程：
# 1. 读取 doc_N.md 文本
# 2. 读取 layout_det_res_N.jpg 图片
# 3. 逐段比对，记录差异
# 4. 输出校验结论：VERDICT: OK 或 VERDICT: DIFF (列出差异)
```

- [ ] **Step 2: 校验29-孤舟萤各角色OCR文本**

```bash
# 同Step 1流程
# 注意：PDF可能包含多个页面，需确认doc_N.md与layout_det_res_N.jpg的对应关系
```

- [ ] **Step 3: 校验30-曼娜各角色OCR文本**

```bash
# 同Step 1流程
```

- [ ] **Step 4: 校验31-冥海缒幽（如果OCR成功）**

```bash
# 如果31-冥海缒幽的PDF需要密码，此步骤跳过
# 如果OCR成功，按相同流程校验
```

- [ ] **Step 5: 批量校验32-42各角色OCR文本**

```bash
# 对32-42每个脚本的每个角色进行视觉校验
# 优先校验高优先级脚本（OCR校验已完成的）
# 记录所有OCR错误，为后续JSON适配提供准确文本
```

- [ ] **Step 6: 生成校验汇总报告**

```bash
# 汇总所有脚本的校验结果
# 输出格式：
# 脚本名 | 角色数 | 校验完成 | OCR错误数 | 状态
# 28-枉痴心 | 6 | 6/6 | 12 | ✅ 完成
# 29-孤舟萤 | 7 | 7/7 | 8 | ✅ 完成
# ...
```

---

## Task 3: JSON适配（md→JSON）

**Covers:** 阶段2-6 - Schema评估 → JSON生成 → 修复 → 验证

**Files:**
- Create: `content/<pinyin>/meta.json`
- Create: `content/<pinyin>/characters/*.json`
- Create: `content/<pinyin>/clues.json`
- Create: `content/<pinyin>/phases.json`
- Create: `content/<pinyin>/flow.json`
- Create: `content/<pinyin>/truth.json`

**Interfaces:**
- Consumes: 校验后的OCR文本
- Produces: 结构化JSON剧本文件

- [ ] **Step 1: 适配28-枉痴心**

```bash
# 1. 读取所有角色的OCR文本
# 2. 根据ADAPT-GUIDE.md生成JSON结构
# 3. 运行repair-adapted.ts修复格式
# 4. 运行verify-scripts.ts验证

# 拼音映射：枉痴心 → wangchixin
# 角色：1大小姐, 2少爷, 3二小姐, 4管家, 5表哥, 6客人
```

- [ ] **Step 2: 适配29-孤舟萤**

```bash
# 拼音映射：孤舟萤 → guzhouying
# 角色：商人, 太太, 姨娘, 小姐, 文员, 老师
# 注意：真相揭秘.pdf 可能包含真相信息，需单独处理
```

- [ ] **Step 3: 适配30-曼娜**

```bash
# 拼音映射：曼娜 → manna
# 角色：谭太太, 韦太太, 尚致, 海悠, 承格, 廖公子
```

- [ ] **Step 4: 适配31-冥海缒幽（如果数据可用）**

```bash
# 拼音映射：冥海缒幽 → minghaizhuiyou
# 角色：于跃洋, 孙孟真, 浦澄裳, 王赶海, 颜睦宛
# 如果PDF加密导致OCR失败，此步骤跳过
```

- [ ] **Step 5: 批量适配32-42**

```bash
# 对32-42每个脚本进行JSON适配
# 拼音映射表：
# 32-诅家庄 → zujiazhuang
# 33-春味社 → chunweishe
# 34-魍魉塔 → wangliangta
# 35-雨异妍 → yuyiyan
# 36-先灵祭 → xianlingji
# 37-蠹虫 → duchong
# 38-烛影额妆 → zhuyingeziang
# 39-离地三寸 → lidisancun
# 40-暗波崖 → anboya
# 41-歧路梢 → qilushao
# 42-双影共秀 → shuangyinggongxiu
```

- [ ] **Step 6: 运行全局验证**

```bash
# 验证所有适配脚本
npx tsx scripts/verify-scripts.ts

# 预期输出：所有脚本通过校验
# 28/29 通过 → 42/42 通过
```

---

## Task 4: 修复与优化

**Covers:** 阶段4-5 - 修复 → 验证

**Files:**
- Modify: `content/<pinyin>/*.json`
- Run: `scripts/repair-adapted.ts`
- Run: `scripts/fix-consistency.ts`

**Interfaces:**
- Consumes: 初始JSON文件
- Produces: 修复后的JSON文件

- [ ] **Step 1: 运行repair-adapted.ts批量修复**

```bash
# 修复格式问题
npx tsx scripts/repair-adapted.ts

# 修复内容：
# - characters字段补全
# - phases格式统一
# - flow DAG结构修复
# - truth字段规范化
```

- [ ] **Step 2: 运行fix-consistency.ts一致性修复**

```bash
# 修复一致性问题
npx tsx scripts/fix-consistency.ts

# 修复内容：
# - relationships映射
# - 凶手标记
# - 线索解锁
# - NPC条目创建
```

- [ ] **Step 3: 最终验证**

```bash
# 最终验证所有脚本
npx tsx scripts/verify-scripts.ts

# 预期输出：42/42 通过
# 无任何警告或错误
```

---

## Task 5: 更新项目文档

**Covers:** 文档维护

**Files:**
- Modify: `content/_adapt-pending.md`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: 适配完成状态
- Produces: 更新后的文档

- [ ] **Step 1: 更新_adapt-pending.md**

```bash
# 将已完成的脚本从"待处理"列表移除
# 更新状态表格
```

- [ ] **Step 2: 更新MEMORY.md**

```bash
# 记录新适配的脚本信息
# 更新项目上下文
# 记录任何新发现的OCR错误模式
```

- [ ] **Step 3: 生成最终报告**

```bash
# 输出最终适配汇总
# 豪门系列42本全部完成
# 每本的角色数、OCR错误数、适配状态
```

---

## 执行顺序

1. **Task 1** → 批量OCR提取（15本）
2. **Task 2** → 视觉校验（mimo-v2.5比对）
3. **Task 3** → JSON适配（md→JSON）
4. **Task 4** → 修复与优化
5. **Task 5** → 更新项目文档

## 预期结果

- 15本豪门系列剧本完成OCR提取
- 所有OCR文本经过视觉校验
- 所有剧本完成JSON适配
- 全部42本豪门系列剧本通过verify-scripts.ts校验
- 项目文档更新完成

## 风险与注意事项

1. **加密PDF**：31-冥海缒幽的PDF可能需要密码，需提前确认
2. **OCR质量**：PaddleOCR VL可能对某些字体/排版识别不准确，需人工校验
3. **时间消耗**：OCR提取耗时较长（每页3-6分钟），需耐心等待
4. **目录名特殊字符**：部分目录名含Unicode字符，需特别注意路径处理
