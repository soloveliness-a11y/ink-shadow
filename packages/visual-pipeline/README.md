# M2 视觉管线 (visual-pipeline)

把 M1 生成的剧本 JSON 里所有 visual spec（角色头像、场景、道具、线索、封面）批量出图，回填 asset 元数据，并把剧本状态推进到 `ready`。

## 架构

```
剧本 JSON (validated)
  │
  ▼
planner.ts          扫描所有 visual spec → 任务清单
  │
  ▼
runner.ts           顺序执行 + 速率控制 + 断点续传 + 重试
  │
  ▼
image-client.ts     调中转站 /v1/responses (image_generation tool)
  │
  ▼
回填 asset → 剧本状态 ready
```

输出位置：`<scriptDir>/assets/*.png`
进度文件：`<scriptDir>/.visual-progress.json`

## 关键调用方式（核心）

**端点**：`POST https://5yuantoken.org/v1/responses`
**模型**：`gpt-5.5`（不是 `gpt-image-2`！见下方踩坑）
**机制**：在 `tools` 里声明 `{ type: "image_generation", output_format: "png" }`，模型理解文本后由服务端调用图片生成工具，返回 base64。

请求体（[image-client.ts](src/image-client.ts)）：
```json
{
  "model": "gpt-5.5",
  "input": [
    { "role": "system", "content": "You are an image generation assistant. Call the image_generation tool..." },
    { "role": "user", "content": "Generate an image from this description: <prompt>. Art style: <styleGuide>" }
  ],
  "tools": [{ "type": "image_generation", "output_format": "png" }],
  "stream": true
}
```

必须的兼容 headers（缺了部分供应商会 502）：
```
content-type: application/json
authorization: Bearer <api-key>
accept: text/event-stream  (stream) | application/json  (json)
chatgpt-account-id: (空)
version: 0.122.0
originator: mmg-visual-pipeline
session_id: mmg-img-<timestamp>
```

## 命令行用法

```bash
cd murder-mystery-game

# 完整出图(默认间隔 240s,匹配中转站节奏)
npx tsx packages/visual-pipeline/src/cli.ts content/mock/script.json \
  --api-key "sk-xxxx" \
  --interval 240

# 断点续传(跳过已完成的)
npx tsx packages/visual-pipeline/src/cli.ts content/mock/script.json \
  --api-key "sk-xxxx" \
  --interval 240 \
  --resume

# 只看任务清单不出图
npx tsx packages/visual-pipeline/src/cli.ts content/mock/script.json --dry-run

# 看每个 spec 的真实状态(文件/asset/progress/指纹是否一致),只读、无需 key
npx tsx packages/visual-pipeline/src/cli.ts content/mock/script.json --status

# 用 stub 模式(1x1 占位图,测试用)
npx tsx packages/visual-pipeline/src/cli.ts content/mock/script.json --model stub
```

### 环境变量
- `MMG_API_KEY` — 等价于 `--api-key`
- `MMG_API_URL` — 等价于 `--api-url`（默认 `https://5yuantoken.org/v1`）
- `MMG_MODEL` — 等价于 `--model`（默认 `gpt-5.5`）

### CLI 参数
| 参数 | 默认 | 说明 |
|------|------|------|
| `--api-key <key>` | 必填 | 中转站 API key |
| `--api-url <url>` | `https://5yuantoken.org/v1` | 中转站 base url |
| `--model <name>` | `gpt-5.5` | `gpt-5.5` / `gpt-image-2` / `stub` |
| `--interval <sec>` | 240 | 每张图之间最小间隔（最低 120） |
| `--resume` | false | 跳过已完成的任务 |
| `--dry-run` | false | 只打印任务清单 |
| `--status` | false | 打印每个 spec 的状态表(只读,无需 key) |
| `--help` | — | 帮助 |

## 速率与重试策略

- **每张间隔 240-300s 随机**（总周期 ~350s，匹配中转站后台观察到的节奏）
- **失败自动重试 4 次**，每次等 90-120s
- **stream 优先 + JSON 回退**（stream 能避免 Cloudflare 120s 超时）
- **单次请求 300s 超时保护**（生图本身 60-120s，留足余量）
- 顺序执行，**禁止并发**（并发会触发 429 风控）

## 落盘与自愈（reconcile）—— 防新会话出图失败的核心

**痛点**：会话垮了重开，`.visual-progress.json` 里可能残留"幽灵 done"（标完成但文件已被删/元素已变），新会话误以为已完成、跳过实际需要的图。

**方案**：以 `assets/*.png` **文件存在为唯一真相**，三方状态（文件 / `script.json` 的 `visual.asset` / `.visual-progress.json`）不一致时自动校正。

`runner.run()` 每次启动先跑一次 `reconcile()`：

1. **清幽灵**：progress 里存在、但剧本已不存在的 task id，直接删掉。
2. **文件在 → done**：文件存在且 prompt 指纹匹配 → 强制 `asset.status='done'`（治幽灵 failed/done 混乱）。
3. **文件不在 → pending**：不论 progress 之前标什么，文件缺失就清 asset、标 pending（让 planner 重新捡起来）。
4. **prompt 变了 → 重出**：每个 asset 存 `promptHash`（prompt+styleHint+aspect+styleGuide 的 sha256）。改了 prompt 即使文件在也标 pending 重出，杜绝"改 prompt 用旧图"。
5. **原子写**：图先写 `*.png.tmp` → `renameSync`，防写一半崩溃留半文件。

reconcile 后立即把校正后的 `script.json` + `.visual-progress.json` 落盘，**即使后续全失败，状态也是自洽的**。

### `--status` 一眼看清（只读，无需 key）

```bash
npx tsx packages/visual-pipeline/src/cli.ts content/mock/script.json --status
```

输出表格：`id | kind | 文件? | asset状态 | progress状态 | 指纹 | action(skip/generate/regen)`。新会话进来**先跑这个**，不要用 `jq` 肉眼判断（之前就是这么误判的）。

## 踩过的坑（会话垮了别再踩一遍）

### 1. 模型名必须用 `gpt-5.5`，不是 `gpt-image-2`
- `gpt-5.5` → 中转站正确路由，模型调用 `image_generation` 工具出图 ✓
- `gpt-image-2` → 间歇性 502（中转站对该模型路由不稳定）✗
- `gpt-5.5` 但中转站清掉 `tools` → 返回 200 但 `output: []` 不出图 ✗
- **验证方式**：调用后看 response 里有没有 `image_generation_call` 和 `iVBOR` base64 数据

### 2. 端点是 `/v1/responses`，不是 `/v1/images/generations`
- `/v1/images/generations` 也能用但间歇性 502
- skill 的官方方式是 `/v1/responses` + `image_generation` tool

### 3. 间隔不能短于 240s
- 90s 间隔 → 触发 429 rate limit
- 240s 间隔 → 稳定
- 中转站后台生图节奏 250-300s，宽裕给 350s 总周期

### 4. JSON 模式会撞 Cloudflare 524 超时
- 中转站 Cloudflare 代理 120s 超时
- 生图本身要 60-120s
- **必须用 stream 模式**保持连接活跃，JSON 作为回退

### 5. 429/502/524 都是中转站上游问题，不是代码 bug
- retry 逻辑能扛住大部分间歇性错误
- 个别图最终失败时，用 `--resume` 单独补跑

### 6. SSE stream 解析必须按规范（对齐 Python skill 参考）
- **不要跳过 `partial_image` 事件** —— 图片常只出现在 partial 事件里，跳过会导致 stream 抓不到图、回退 JSON、撞 524
- **同一 event 的多行 `data:` 要用 `\n` 拼接后再 `JSON.parse`** —— 每行独立 parse 会在大 JSON 跨行时失败被吞掉
- 抓到第一个 base64 就返回（参考 `scripts/generate_image.py` 的 `extract_image_base64`）
- 超时给 300s（生图本身 60-120s + 网络）

## 输出验证

```bash
# 快速验证:检查模型名是否正确
grep MMG_MODEL .env  # 应该是 gpt-5.5，不是 gpt-image-2

# 推荐:一条命令看全(文件/asset/progress/指纹/action)
npx tsx packages/visual-pipeline/src/cli.ts content/mock/script.json --status

# 看生成了几张
ls content/mock/assets/*.png | wc -l

# 看 script.json 里 asset 是否回填
jq '.characters[0].visual.asset.status' content/mock/script.json  # 应该是 "done"

# 看剧本状态
jq '.meta.status' content/mock/script.json  # 全部完成后应该是 "ready"
```

## 开发命令

```bash
pnpm --filter @mmg/visual-pipeline typecheck
pnpm --filter @mmg/visual-pipeline test
```

## 相关文件
- [src/cli.ts](src/cli.ts) — 命令行入口
- [src/image-client.ts](src/image-client.ts) — 中转站 API 客户端
- [src/runner.ts](src/runner.ts) — 出图编排（速率/重试/续传）
- [src/planner.ts](src/planner.ts) — 任务清单生成
- [tests/pipeline.test.ts](tests/pipeline.test.ts) — 单测（stub 模式）
- 中转站 skill 参考：`/tmp/gpt-image-skill/gpt-image-generate/`（从 `~/Downloads/gpt-image-generate.zip` 解压）
