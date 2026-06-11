import { z } from 'zod';

/** 视觉素材种类 */
export const zVisualKind = z.enum(['avatar', 'scene', 'prop', 'cover', 'clue']);
export type VisualKind = z.infer<typeof zVisualKind>;

/** 出图宽高比(对应 od media --aspect) */
export const zAspect = z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']);
export type Aspect = z.infer<typeof zAspect>;

/** M2 回填的产物信息 */
export const zVisualAsset = z.object({
  path: z.string(), // 相对剧本包:assets/xxx.png
  model: z.string(), // 实际使用的模型 id
  generatedAt: z.string(), // ISO 时间
  status: z.enum(['pending', 'done', 'failed']),
  error: z.string().optional(),
  promptHash: z.string().optional(), // 出图时 prompt+style 的指纹;变了→旧图作废重出
});
export type VisualAsset = z.infer<typeof zVisualAsset>;

/**
 * 视觉素材契约 —— M1↔M2 唯一耦合点。
 * M1 生成 prompt/aspect/kind/styleHint;M2 调 od media 后回填 asset。
 */
export const zVisualSpec = z.object({
  kind: zVisualKind,
  prompt: z.string().min(1),
  aspect: zAspect,
  styleHint: z.string().optional(),
  negativePrompt: z.string().optional(),
  asset: zVisualAsset.optional(),
});
export type VisualSpec = z.infer<typeof zVisualSpec>;
