import { createHash } from 'node:crypto';
import type { Script, VisualSpec } from '@mmg/schema';

export interface VisualTask {
  /** 唯一标识 */
  id: string;
  /** 在 script 中的路径,如 "characters.0.visual" */
  path: string;
  /** 输出文件名 */
  outputPath: string;
  /** 视觉描述 */
  spec: VisualSpec;
}

/** 枚举项 = 任务(任务即枚举项中需要出图的子集) */
export type VisualEntry = VisualTask;

/**
 * 枚举剧本中所有 visual spec(含 done 的)。
 * reconcile / status 用:需要看到全部,才能以文件为真相校正状态。
 */
export function listAllVisualEntries(script: Script): VisualEntry[] {
  const entries: VisualEntry[] = [];

  if (script.meta.cover) {
    entries.push({ id: 'meta_cover', path: 'meta.cover', outputPath: 'cover.png', spec: script.meta.cover });
  }

  for (let i = 0; i < script.characters.length; i++) {
    const ch = script.characters[i]!;
    entries.push({
      id: `char_${ch.id}`,
      path: `characters.${i}.visual`,
      outputPath: `avatar_${ch.id}.png`,
      spec: ch.visual,
    });
  }

  for (let i = 0; i < script.scenes.length; i++) {
    const sc = script.scenes[i]!;
    entries.push({
      id: `scene_${sc.id}`,
      path: `scenes.${i}.visual`,
      outputPath: `scene_${sc.id}.png`,
      spec: sc.visual,
    });
  }

  for (let i = 0; i < (script.props?.length ?? 0); i++) {
    const pr = script.props?.[i];
    if (!pr) continue;
    entries.push({
      id: `prop_${pr.id}`,
      path: `props.${i}.visual`,
      outputPath: `prop_${pr.id}.png`,
      spec: pr.visual,
    });
  }

  for (let i = 0; i < script.clues.length; i++) {
    const cl = script.clues[i]!;
    if (!cl.visual) continue;
    entries.push({
      id: `clue_${cl.id}`,
      path: `clues.${i}.visual`,
      outputPath: `clue_${cl.id}.png`,
      spec: cl.visual,
    });
  }

  return entries;
}

/**
 * 抽取出图任务清单:枚举项中跳过 asset.status='done' 的。
 * cover 特殊:meta.cover 不存在时,基于 synopsis 合成一个任务(M2 补封面)。
 */
export function planVisualTasks(script: Script): VisualTask[] {
  const tasks = listAllVisualEntries(script)
    .filter(e => e.spec.asset?.status !== 'done');

  if (!script.meta.cover) {
    tasks.unshift({
      id: 'meta_cover',
      path: 'meta.cover',
      outputPath: 'cover.png',
      spec: {
        kind: 'cover',
        prompt: `Book cover poster for a murder mystery game titled "${script.meta.title}". ${script.meta.synopsis}`,
        aspect: '3:4',
      },
    });
  }

  return tasks;
}

/**
 * prompt 指纹:覆盖所有影响出图结果的输入(prompt/styleHint/aspect/styleGuide)。
 * 任一项改变 → hash 变 → reconcile 判定旧图作废,触发重出。
 */
export function promptFingerprint(spec: VisualSpec, styleGuide?: string): string {
  const basis = [spec.prompt, spec.styleHint ?? '', spec.aspect, styleGuide ?? ''].join('|');
  return createHash('sha256').update(basis).digest('hex').slice(0, 16);
}
