/**
 * AI DM 叙事服务 — 在关键游戏节点生成戏剧化旁白。
 *
 * 设计原则：
 * - 异步非阻塞：LLM 返回后才推送，不卡游戏流程
 * - 2s 超时静默放弃：绝不因 DM 卡顿影响游戏
 * - 不配 API key 则完全不启用，零开销
 * - 支持 Anthropic 原生 + OpenAI 兼容两种 provider
 */

import Anthropic from '@anthropic-ai/sdk';

export interface DmConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  /** OpenAI 兼容模式需要的基础 URL */
  apiUrl?: string;
  model: string;
}

export interface DmContext {
  phaseTitle: string;
  phaseKind: string;
  publicClueTitles: string[];
  scriptTitle: string;
  characterNames: string[];
}

interface DmMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `你是「墨影」剧本杀游戏的主持人/旁白，名为"说书人"。

你的职责是用简短、富有戏剧张力的语言为玩家渲染氛围、推进叙事。你的风格：
- 氛围感强，用画面感强的短句
- 适当使用省略号和悬念
- 不超过80字
- 中文为主

铁律：
1. 绝对不能剧透真相（谁是凶手、动机、手法）
2. 不能提及任何玩家尚未公开的线索内容
3. 不能替玩家做推理或暗示推理方向
4. 只渲染氛围和情绪，不提供任何事实性信息`;

/** 判断事件是否需要 DM 旁白 */
function shouldRespond(eventType: string): boolean {
  return ['phase_enter', 'search_clue', 'vote_cast', 'flow_end'].includes(eventType);
}

/** 根据事件类型构造 user prompt */
function buildUserPrompt(eventType: string, payload: Record<string, string>, ctx: DmContext): string {
  const clues = ctx.publicClueTitles.length > 0
    ? `\n已公开线索: ${ctx.publicClueTitles.slice(-5).join('、')}`
    : '';

  switch (eventType) {
    case 'phase_enter':
      return `[剧本「${ctx.scriptTitle}」]\n进入环节「${ctx.phaseTitle}」\n在场: ${ctx.characterNames.join('、')}${clues}\n请生成一段环节开启的旁白。`;
    case 'search_clue': {
      const actor = payload.actorName ?? '某人';
      const clue = payload.clueTitle ?? '线索';
      return `[剧本「${ctx.scriptTitle}」· 环节「${ctx.phaseTitle}」]\n${actor}刚刚发现了一条线索「${clue}」。${clues}\n请生成一段氛围描写（不要描述线索内容）。`;
    }
    case 'vote_cast':
      return `[剧本「${ctx.scriptTitle}」· 投票环节]\n所有人已完成投票，真相即将揭晓。${clues}\n请生成一段投票结束后的紧张旁白。`;
    case 'flow_end':
      return `[剧本「${ctx.scriptTitle}」]\n游戏结束，真相揭晓。请生成一段收尾旁白。`;
    default:
      return '';
  }
}

export class DmService {
  private config: DmConfig;
  private history: DmMessage[] = [];
  private anthropicClient: Anthropic | null = null;
  private enabled: boolean;

  constructor(config: DmConfig | null) {
    if (!config || !config.apiKey) {
      this.enabled = false;
      this.config = { provider: 'anthropic', apiKey: '', model: 'claude-haiku-4-5' };
    } else {
      this.enabled = true;
      this.config = config;
      if (config.provider === 'anthropic') {
        this.anthropicClient = new Anthropic({ apiKey: config.apiKey });
      }
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** 重置对话历史（新一局开始时调用） */
  resetHistory(): void {
    this.history = [];
  }

  /**
   * 处理游戏事件，异步生成 DM 旁白。
   * 返回 null 表示不需要响应（事件类型不匹配或超时/失败）。
   */
  async onEvent(
    eventType: string,
    payload: Record<string, string>,
    context: DmContext,
  ): Promise<{ text: string; charId?: string } | null> {
    if (!this.enabled) return null;
    if (!shouldRespond(eventType)) return null;

    const userPrompt = buildUserPrompt(eventType, payload, context);
    if (!userPrompt) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    try {
      const text = await this.generateText(SYSTEM_PROMPT, userPrompt, controller.signal as unknown as AbortSignal);

      // 维护轻量历史（最近 5 轮）
      this.history.push({ role: 'user', content: userPrompt });
      this.history.push({ role: 'assistant', content: text });
      if (this.history.length > 10) {
        this.history = this.history.slice(-10);
      }

      return { text };
    } catch {
      // 超时或 API 错误 — 静默放弃
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async generateText(system: string, user: string, signal?: AbortSignal): Promise<string> {
    if (this.config.provider === 'anthropic') {
      return this.generateAnthropic(system, user, signal);
    } else {
      return this.generateOpenAI(system, user, signal);
    }
  }

  private async generateAnthropic(system: string, user: string, signal?: AbortSignal): Promise<string> {
    if (!this.anthropicClient) throw new Error('No Anthropic client');

    const messages: Anthropic.MessageParam[] = this.history.map(m => ({
      role: m.role,
      content: m.content,
    }));
    messages.push({ role: 'user', content: user });

    const resp = await this.anthropicClient.messages.create({
      model: this.config.model,
      max_tokens: 200,
      system,
      messages,
    }, { signal: signal as any });

    const block = resp.content[0];
    if (block && block.type === 'text') return block.text.trim();
    throw new Error('No text in response');
  }

  private async generateOpenAI(system: string, user: string, signal?: AbortSignal): Promise<string> {
    const baseUrl = this.config.apiUrl?.replace(/\/$/, '') ?? 'https://api.openai.com/v1';
    const messages = [
      { role: 'system' as const, content: system },
      ...this.history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: user },
    ];

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: 200,
        temperature: 0.8,
      }),
      signal,
    });

    if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status}`);
    const data = await resp.json() as any;
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
