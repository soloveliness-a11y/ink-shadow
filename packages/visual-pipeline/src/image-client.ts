import type { VisualSpec } from '@mmg/schema';

export interface ImageClientOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  stub?: boolean;
}

const SYSTEM_PROMPT =
  'You are an image generation assistant. When the user asks for an image, ' +
  'you must call the image_generation tool to generate the image. Do not ' +
  'describe the image in text. Return the generated image directly.';

const IMAGE_PREFIXES = ['iVBOR', '/9j/', 'UklGR', 'R0lGOD', 'Qk'];
const PREFERRED_KEYS = ['result', 'b64_json', 'image_base64', 'base64', 'data', 'image'];

/**
 * 中转站生图客户端。
 * 使用 POST /v1/responses + tools: [image_generation]。
 * 兼容 SSE streaming 和 JSON 两种响应模式。
 */
export class ImageClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private stub: boolean;

  constructor(opts: ImageClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/v1$/, '').replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gpt-5.5';
    this.stub = opts.stub ?? false;
  }

  async generateAndWait(spec: VisualSpec, styleGuide: string): Promise<Buffer> {
    if (this.stub) return this.stubImage();

    const prompt = this.buildPrompt(spec, styleGuide);
    console.log(`  Prompt: ${prompt.slice(0, 80)}...`);

    // gpt-image-* 走纯 JSON 模式,跳过 stream(stream 会触发中转站额外 text 计费)
    const isImageModel = this.model.startsWith('gpt-image');

    if (!isImageModel) {
      // Stream 优先: 保持连接活跃,避免 Cloudflare 120s 超时
      try {
        const buf = await this.tryStream(prompt);
        if (buf) return buf;
      } catch (e) {
        console.warn(`  stream mode failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // JSON 模式
    try {
      const buf = await this.tryJson(prompt);
      if (buf) return buf;
    } catch (e) {
      console.warn(`  JSON mode failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    throw new Error('No base64 image found in API response');
  }

  /** SSE streaming 模式(推荐:避免 Cloudflare 120s 超时) */
  private async tryStream(prompt: string): Promise<Buffer | null> {
    const url = `${this.baseUrl}/v1/responses`;
    const body = JSON.stringify(this.buildPayload(prompt, true));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.headers(true),
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text.slice(0, 500)}`);
    }

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/event-stream')) {
      // 非 SSE — 按 JSON 处理
      const data = await res.json();
      return this.extractImage(data);
    }

    // 解析 SSE(按规范:同一 event 的多行 data: 用 \n 拼接后 parse)
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let dataLines: string[] = [];

    const flush = (): Buffer | null => {
      if (dataLines.length === 0) return null;
      const dataStr = dataLines.join('\n');
      dataLines = [];
      if (dataStr === '[DONE]') return null;
      try {
        const data = JSON.parse(dataStr);
        return this.extractImage(data);
      } catch {
        return null;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const img = flush();
        if (img) return img;
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (line === '') {
          // event 边界: 触发一次解析
          const img = flush();
          if (img) return img;
          continue;
        }
        if (line.startsWith(':')) continue;       // comment
        if (line.startsWith('event:')) continue;  // 不依赖 event 名
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^\s/, ''));
        }
      }
    }

    return null;
  }

  /** JSON 模式(备选:可能触发 Cloudflare 120s 超时) */
  private async tryJson(prompt: string): Promise<Buffer | null> {
    const url = `${this.baseUrl}/v1/responses`;
    const body = JSON.stringify(this.buildPayload(prompt, false));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.headers(false),
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = await res.json();
    return this.extractImage(data);
  }

  private buildPayload(prompt: string, stream: boolean): unknown {
    return {
      model: this.model,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Generate an image from this description: ${prompt}` },
      ],
      tools: [{ type: 'image_generation', output_format: 'png' }],
      stream,
    };
  }

  private headers(stream: boolean): Record<string, string> {
    return {
      'content-type': 'application/json',
      'authorization': `Bearer ${this.apiKey}`,
      'accept': stream ? 'text/event-stream' : 'application/json',
      'chatgpt-account-id': '',
      'version': '0.122.0',
      'originator': 'mmg-visual-pipeline',
      'session_id': `mmg-img-${Date.now()}`,
    };
  }

  private buildPrompt(spec: VisualSpec, styleGuide: string): string {
    const parts: string[] = [spec.prompt];
    if (styleGuide) parts.push(`Art style: ${styleGuide}`);
    if (spec.styleHint) parts.push(spec.styleHint);
    if (spec.aspect && spec.aspect !== '1:1') parts.push(`Aspect ratio: ${spec.aspect}`);
    return parts.join('. ');
  }

  // ─── 递归查找 base64 图片 ───

  private extractImage(obj: unknown): Buffer | null {
    if (obj == null) return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = this.extractImage(item);
        if (found) return found;
      }
      return null;
    }
    if (typeof obj === 'object') {
      const dict = obj as Record<string, unknown>;
      // 优先检查已知 key
      for (const key of PREFERRED_KEYS) {
        const val = dict[key];
        if (this.looksLikeBase64Image(val)) {
          return this.decodeBase64Image(val as string);
        }
      }
      // 递归搜索所有值
      for (const val of Object.values(dict)) {
        const found = this.extractImage(val);
        if (found) return found;
      }
    }
    if (typeof obj === 'string' && this.looksLikeBase64Image(obj)) {
      return this.decodeBase64Image(obj);
    }
    return null;
  }

  private looksLikeBase64Image(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    if (value.startsWith('data:image/')) return true;
    if (value.length < 1000) return false;
    return IMAGE_PREFIXES.some(p => value.startsWith(p));
  }

  private decodeBase64Image(value: string): Buffer {
    if (value.startsWith('data:image/')) {
      const encoded = value.split(',', 2)[1] ?? '';
      return Buffer.from(encoded, 'base64');
    }
    return Buffer.from(value, 'base64');
  }

  private stubImage(): Buffer {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
  }
}
