# 03 · M2 视觉素材管线

> 目标:读剧本包的 `visual` 字段 → 批量出图 → 回填 `visual.asset` → 零悬空引用。
> 包:`packages/visual-pipeline`,CLI 名 `mmg-visualize`。**复用 open-design `od media`,不自研图像生成。**
> 本文细节基于对 open-design 源码的实测调研(`apps/daemon/src/cli.ts`、`media-models.ts`、`media-config.ts`、`docs/external-media-orchestration.md`)。

## 1. open-design 集成事实(已核实)

**出图命令(CLI):**
```bash
od media generate --surface image --model gpt-image-2 \
  --prompt "<画面描述>" --aspect 3:4 --output char_butler.png --project <projectId>
```
- **异步**:返回 `{taskId}`,内部轮询 `od media wait <taskId>`,done 输出一行 `{"file":{name,size,mime,...}}`。
- 图片字节由 daemon **写进 project 的 files 文件夹**(`.od/projects/<projectId>/files/`)。

**出图 HTTP(推荐外部系统用,`external-media-orchestration.md` 明确推荐 HTTP 而非 shell out):**
- `POST /api/projects/:id/media/generate` body `{surface, model, prompt, aspect, output, image?}` → `{taskId, status}`
  - legacy 项目端点,**无需 token**,适合外部调用。
- `POST /api/media/tasks/:taskId/wait` body `{since, timeoutMs}` → 快照 `{status: queued|running|done|failed|interrupted, file?, progress?, nextSince}`
- `GET /api/media/models` → 可用模型清单。

**模型(`media-models.ts` 实测):**
- 默认 **`gpt-image-2`**(OpenAI,t2i/i2i/inpaint)。
- **国内直连可选**(服务器在国内时):`doubao-seedream-*`(volcengine 火山引擎)、`senseaudio-image-2.0`、`minimax`、`nanobanana`(Gemini)。
- 图生图(角色一致性用):`gpt-image-2` / `seededit-3.0` / `flux-kontext-pro` 支持 i2i,配 `--image <参考图>`。

**Key 配置(`media-config.ts` 实测,走环境变量最省心,适合云服务器):**
```bash
OD_OPENAI_API_KEY=sk-...        # openai 系(gpt-image-2/dall-e)
OD_NANOBANANA_API_KEY=...       # 或 GOOGLE_API_KEY / GEMINI_API_KEY
OD_FAL_KEY=...                  # fal.ai(FLUX 系)
# volcengine 豆包等同理,按 provider 的 ENV_KEYS
```

**起服务(M2 出图前置):**
```bash
# 在 open-design 目录:起 daemon(带出图 key)
cd open-design && OD_OPENAI_API_KEY=sk-... pnpm tools-dev run web --daemon-port 17456 --web-port 17573
# M2 通过 daemon-url=http://127.0.0.1:17456 连接
```
- `stub` provider 无需 key,产出确定性占位图——**仅供联调**,严禁当成品。

## 2. 集成架构(推荐 HTTP 直连)

```
mmg-visualize script.json
   │
   ├─ planner: 遍历 script,抽出所有 VisualSpec → 出图任务清单
   │
   ├─ od-client(HTTP → daemon http://127.0.0.1:17456)
   │     ① 确保有 projectId(首次 `od project create --name <scriptId> --json` 拿 id,缓存到 .od-project)
   │     ② generate(prompt+aspect+model) → taskId
   │     ③ wait(taskId) → file(检测 providerError,拒收 stub)
   │     ④ download: 从 project files 取字节 → 写 content/<id>/assets/<name>.png
   │
   ├─ runner: 并发限流(默认 3)+ 失败重试(2 次)+ 断点续传(已 done 跳过)
   │
   └─ 回填: 把 assets/<name>.png 写回对应 VisualSpec.asset,status=done
```

## 3. od-client 核心骨架(基于实测端点)

```typescript
// src/od-client.ts
export class OdMediaClient {
  constructor(private base: string, private defaultModel = 'gpt-image-2') {}

  async ensureProject(scriptId: string): Promise<string> {
    // 优先复用缓存的 projectId;否则 shell out `od project create --name <scriptId> --json`
    // (od project create 已实测存在;也可改为对应 HTTP 端点)
  }

  async generate(projectId: string, spec: { prompt: string; aspect: string; model?: string; output: string; image?: string }) {
    const res = await fetch(`${this.base}/api/projects/${projectId}/media/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        surface: 'image',
        model: spec.model ?? this.defaultModel,
        prompt: spec.prompt, aspect: spec.aspect, output: spec.output, image: spec.image,
      }),
    });
    if (!res.ok) throw new Error(`generate ${res.status}: ${await res.text()}`);
    return (await res.json()) as { taskId: string; status?: string };
  }

  async wait(taskId: string, timeoutMs = 180_000) {
    let since = 0; const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await fetch(`${this.base}/api/media/tasks/${taskId}/wait`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ since, timeoutMs: 4000 }),
      });
      const snap = await res.json();
      if (typeof snap.nextSince === 'number') since = snap.nextSince;
      if (snap.status === 'done') {
        // ⚠️ 实测:provider 失败时 daemon 写 stub 占位并带 file.providerError,exit 5
        if (snap.file?.providerError) throw new ProviderStubError(snap.file.providerError);
        return snap.file as { name: string; size: number; mime: string };
      }
      if (snap.status === 'failed' || snap.status === 'interrupted')
        throw new Error(snap.error?.message ?? snap.status);
    }
    throw new Error(`task ${taskId} timeout`);
  }
}
```

> **关键容错(铁律:不发半成品)**:`providerError` = 出图实际失败、返回的是占位 stub。M2 必须捕获并标 `asset.status='failed'`,**绝不把 stub 当成品回填**。打包阶段(`scripts/produce`)对 `failed` 直接拦截。

## 4. 风格统一与角色一致性

- **全局风格**:每条出图 prompt = `${spec.prompt}. Art style: ${meta.styleGuide}${spec.styleHint ? ', ' + spec.styleHint : ''}`。保证全剧本美术一致。
- **角色一致性**(已知难点):同一角色若需多张图,长相要稳。
  - MVP:在 avatar prompt 里固定外貌锚点(年龄/发型/服饰/特征),其余场景图不画角色脸。
  - 进阶:先出角色 avatar,再用 **i2i**(`--image <avatar>`,模型用 `gpt-image-2`/`flux-kontext-pro`)生成同角色其他姿态。schema 的 `visual.asset` 已可作为后续 i2i 的参考图来源。

## 5. CLI 契约

```bash
mmg-visualize content/minguo-01/script.json \
  --daemon-url http://127.0.0.1:17456 \
  [--model gpt-image-2] [--concurrency 3] [--resume] [--dry-run]
# --dry-run: 只打印任务清单与预估张数,不出图
# --resume: 跳过 asset.status=done 的项(断点续传)
# 完成后:回填 script.json,status: validated → ready(全部 asset done 才置 ready)
```

## 6. 任务清单(执行顺序)

1. 脚手架 `packages/visual-pipeline`。先用 `--model stub` 跑通全链路(免 key,验证 planner/runner/回填/打包),再换真实模型。
2. 实现 `od-client`(generate/wait/ensureProject/download),对照本文端点。
3. 实现 `planner`:遍历 characters/scenes/props,生成任务清单(含 output 命名规则:`<kind>_<id>.png`)。
4. 实现 `runner`:p-limit 并发 + 重试 + resume + 进度落盘(`content/<id>/.visual-progress.json`)。
5. 回填与打包校验:全部 done → `status=ready`;任一 failed → 报告并阻断。
6. 联调真实出图:gpt-image-2 跑一个 6 人本(约 6 头像 + 5 场景 + 数个道具 ≈ 15~20 张)。
7. 自检:`script.json` 无悬空 asset,图片可打开,风格统一。

## 7. 验收标准

- [ ] `--model stub` 全链路跑通(免 key 自测)。
- [ ] 真实模型给 6 人本批量出图,全部 `asset.status=done`,零 `failed` 漏网。
- [ ] 断网/超时后 `--resume` 续跑,不重复已成图。
- [ ] `providerError`/stub 被正确识别为 failed,不污染成品。
- [ ] 回填后 `script.json` 通过"视觉完整"校验(schema §8 #8),`status=ready`。

## 8. 部署提醒

- 生产期 M2 与 open-design daemon **同机**跑最简单(本地回环,无跨网鉴权问题)。
- M2 是**离线 pipeline**,与 M3 游戏服务器无运行时耦合——出完图,剧本包就是静态文件,M3 只读文件。
