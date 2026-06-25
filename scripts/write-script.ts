/**
 * 把剧本写成拆分格式(_mock 风格多 json 目录),取代单文件 script.json。
 * 长剧本拆分后:维护/校验只需改对应 json,无需全量;与 loader.loadSplitFormat 一一对应。
 *
 * 输出:meta.json + characters/c_<id>.json + order.json + clues.json + scenes.json
 *      + phases.json + (props.json) + flow.json + (truth.json) + (endings.json)
 *      (括号字段仅当存在时写出)
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Script } from '@mmg/schema';

export function writeScriptSplit(script: Script, dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const w = (path: string, data: unknown) => writeFileSync(join(dir, path), JSON.stringify(data, null, 2) + '\n');

  w('meta.json', script.meta);

  const charsDir = join(dir, 'characters');
  if (!existsSync(charsDir)) mkdirSync(charsDir);
  const order: string[] = [];
  for (const c of script.characters) {
    writeFileSync(join(charsDir, `${c.id}.json`), JSON.stringify(c, null, 2) + '\n');
    order.push(c.id);
  }
  writeFileSync(join(charsDir, 'order.json'), JSON.stringify(order, null, 2) + '\n');

  w('clues.json', script.clues);
  w('scenes.json', script.scenes);
  w('phases.json', script.phases);
  if (script.props?.length) w('props.json', script.props);
  w('flow.json', script.flow);
  if (script.truth) w('truth.json', script.truth);
  if (script.endings?.length) w('endings.json', script.endings);
}
