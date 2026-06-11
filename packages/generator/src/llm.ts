import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const MODEL_OPUS = 'claude-opus-4-8';
const MODEL_SONNET = 'claude-sonnet-4-6';

export interface LLMConfig {
  apiKey: string;
  model?: 'opus' | 'sonnet';
  /** Previous stages' text to include as cached prefix */
  cachedContext?: string;
}

export interface LLMResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * 调用 Claude API 并强制通过 tool use 返回结构化 JSON。
 * 失败自动重试(最多 maxRetries 次),每次把校验错误回传。
 */
export async function structuredGenerate<T>(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  toolName: string,
  toolDescription: string,
  maxRetries = 3,
): Promise<LLMResult<T>> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const model = config.model === 'sonnet' ? MODEL_SONNET : MODEL_OPUS;

  const toolDefinition: Anthropic.Messages.Tool = {
    name: toolName,
    description: toolDescription,
    input_schema: zodToJsonSchema(schema) as Anthropic.Messages.Tool.InputSchema,
  };

  let lastError: string | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userContent = attempt === 0
      ? userPrompt
      : `${userPrompt}\n\n⚠️ 上次输出校验失败,请修正:\n${lastError}`;

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userContent },
    ];

    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      system: config.cachedContext
        ? [{ type: 'text', text: config.cachedContext, cache_control: { type: 'ephemeral' } }, { type: 'text', text: systemPrompt }]
        : systemPrompt,
      messages,
      tools: [toolDefinition],
      tool_choice: { type: 'tool', name: toolName },
    });

    // Extract tool use result
    const toolBlock = response.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use' && b.name === toolName);
    if (!toolBlock) {
      lastError = '模型未调用指定 tool,请重试';
      continue;
    }

    const parsed = schema.safeParse(toolBlock.input);
    if (parsed.success) {
      return {
        data: parsed.data,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    }

    // Validation failed — format errors for retry
    lastError = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
  }

  throw new Error(`结构化生成失败(重试 ${maxRetries} 次后仍不过校验):\n${lastError}`);
}

/**
 * 简单文本生成(用于 critic pass 等非结构化场景)。
 */
export async function textGenerate(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const model = config.model === 'sonnet' ? MODEL_SONNET : MODEL_OPUS;

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return textBlock?.text ?? '';
}

// ─── Zod → JSON Schema 转换(简化版,够用) ───

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // zod toJSONSchema 需要额外依赖,这里手动处理常见类型
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(val as z.ZodType);
      if (!(val instanceof z.ZodOptional)) required.push(key);
    }
    return { type: 'object', properties, required };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodArray) {
    const inner = schema.element;
    return { type: 'array', items: zodToJsonSchema(inner as z.ZodType) };
  }
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodDefault) return zodToJsonSchema(schema.removeDefault());
  if (schema instanceof z.ZodRecord) return { type: 'object', additionalProperties: zodToJsonSchema(schema.valueSchema as z.ZodType) };
  if (schema instanceof z.ZodUnion) {
    // 对于 discriminatedUnion,简化为 object
    const first = schema.options[0];
    return first ? zodToJsonSchema(first as z.ZodType) : {};
  }
  return {};
}
