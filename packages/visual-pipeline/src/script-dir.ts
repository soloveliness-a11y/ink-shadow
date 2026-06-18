/**
 * 多文件剧本目录 I/O —— 与单文件 script.json 互转的桥梁。
 *
 * 目录结构(由 split-script.ts 产生):
 *   <dir>/
 *     meta.json
 *     characters/
 *       order.json
 *       <charId>.json
 *     clues.json
 *     scenes.json
 *     props.json
 *     phases.json
 *     flow.json
 *     truth.json
 *     assets/                ← 图片输出目录(由 runner 用)
 *     .visual-progress.json  ← 进度文件(由 runner 用)
 *
 * 用途:生图脚本(M2)不再要求合成全量 script.json,直接读多文件,
 *      回写时也只回写各分文件,clues.json 保持单一真相。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { zScript, type Script, type Clue, type Scene, type Prop, type Character } from '@mmg/schema';

export interface ScriptDir {
  metaPath: string;
  charactersDir: string;
  orderPath: string;
  cluesPath: string;
  scenesPath: string;
  propsPath: string;
  phasesPath: string;
  flowPath: string;
  truthPath: string;
}

/** 解析一个目录的固定文件路径(不一定存在) */
export function resolveScriptDir(dir: string): ScriptDir {
  const root = resolve(dir);
  return {
    metaPath: join(root, 'meta.json'),
    charactersDir: join(root, 'characters'),
    orderPath: join(root, 'characters', 'order.json'),
    cluesPath: join(root, 'clues.json'),
    scenesPath: join(root, 'scenes.json'),
    propsPath: join(root, 'props.json'),
    phasesPath: join(root, 'phases.json'),
    flowPath: join(root, 'flow.json'),
    truthPath: join(root, 'truth.json'),
  };
}

/** 检查一个路径是否像多文件剧本目录(有 meta.json + characters/order.json + clues.json) */
export function isScriptDir(path: string): boolean {
  if (!existsSync(path)) return false;
  return (
    existsSync(join(path, 'meta.json')) &&
    existsSync(join(path, 'clues.json')) &&
    existsSync(join(path, 'characters', 'order.json'))
  );
}

/** 从多文件目录构造 Script(供 runner.run 内部用) */
export function loadFromDir(dir: string): Script {
  const p = resolveScriptDir(dir);
  if (!existsSync(p.metaPath)) throw new Error(`meta.json not found: ${p.metaPath}`);
  if (!existsSync(p.cluesPath)) throw new Error(`clues.json not found: ${p.cluesPath}`);

  const meta = JSON.parse(readFileSync(p.metaPath, 'utf-8'));
  const order: string[] = JSON.parse(readFileSync(p.orderPath, 'utf-8'));
  const characters: Character[] = order.map(id => {
    const charPath = join(p.charactersDir, `${id}.json`);
    if (!existsSync(charPath)) throw new Error(`character file missing: ${charPath}`);
    return JSON.parse(readFileSync(charPath, 'utf-8'));
  });
  const clues: Clue[] = JSON.parse(readFileSync(p.cluesPath, 'utf-8'));
  const scenes: Scene[] = JSON.parse(readFileSync(p.scenesPath, 'utf-8'));
  const props: Prop[] = existsSync(p.propsPath)
    ? JSON.parse(readFileSync(p.propsPath, 'utf-8'))
    : [];
  const phases = JSON.parse(readFileSync(p.phasesPath, 'utf-8'));
  const flow = JSON.parse(readFileSync(p.flowPath, 'utf-8'));
  const truth = JSON.parse(readFileSync(p.truthPath, 'utf-8'));

  const script = { meta, characters, clues, scenes, props, phases, flow, truth };
  const parsed = zScript.safeParse(script);
  if (!parsed.success) {
    throw new Error(`Invalid multi-file script: ${parsed.error.issues.map(i => i.message).join('; ')}`);
  }
  return parsed.data;
}

/**
 * 把 Script 回写到多文件目录 —— 关键:只回写被生图影响的部分,
 * 其余字段(如 content / narrative / secrets 等)在写入时是原值,
 * 但因为我们读出来再写回,内容应该等价。prompt / asset 字段由 runner 改过。
 *
 * 这意味着:多文件目录的"主文件"(clues.json / characters/<id>.json 等)
 * 必须用与读时相同的"窄 schema"写出 —— 否则会把不认识的字段污染。
 *
 * 当前实现:直接深拷贝每个文件的 schema 字段(character/clue/scene/prop 的核心字段),
 * 丢弃临时键。后续若 schema 演进,这里要同步更新白名单。
 */
const CHARACTER_FIELDS: (keyof Character)[] = [
  'id', 'name', 'gender', 'age', 'isVictim', 'isMurderer',
  'publicProfile', 'privateScript', 'storyByPhase',
  'objectives', 'secrets', 'timeline', 'relationships', 'visual',
];
const CLUE_FIELDS: (keyof Clue)[] = [
  'id', 'title', 'content', 'sceneId', 'ownerCharId',
  'visibility', 'round', 'isKey', 'pointsTo', 'visual',
];
const SCENE_FIELDS: (keyof Scene)[] = ['id', 'name', 'description', 'visual'];
const PROP_FIELDS: (keyof Prop)[] = ['id', 'name', 'description', 'visual'];

function pickFields<T extends object, K extends keyof T>(obj: T, fields: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const f of fields) {
    if (obj[f] !== undefined) out[f] = obj[f];
  }
  return out;
}

export function saveToDir(dir: string, script: Script): void {
  const p = resolveScriptDir(dir);
  // 1. meta
  writeFileSync(p.metaPath, JSON.stringify(script.meta, null, 2), 'utf-8');
  // 2. characters (按 order.json 顺序)
  for (const ch of script.characters) {
    const charPath = join(p.charactersDir, `${ch.id}.json`);
    writeFileSync(charPath, JSON.stringify(pickFields(ch, CHARACTER_FIELDS), null, 2), 'utf-8');
  }
  // 3. clues
  writeFileSync(p.cluesPath, JSON.stringify(script.clues.map(c => pickFields(c, CLUE_FIELDS)), null, 2), 'utf-8');
  // 4. scenes
  writeFileSync(p.scenesPath, JSON.stringify(script.scenes.map(s => pickFields(s, SCENE_FIELDS)), null, 2), 'utf-8');
  // 5. props
  writeFileSync(p.propsPath, JSON.stringify((script.props ?? []).map(pr => pickFields(pr, PROP_FIELDS)), null, 2), 'utf-8');
  // 6. phases / flow / truth —— M2 不改,原样写回
  writeFileSync(p.phasesPath, JSON.stringify(script.phases, null, 2), 'utf-8');
  writeFileSync(p.flowPath, JSON.stringify(script.flow, null, 2), 'utf-8');
  writeFileSync(p.truthPath, JSON.stringify(script.truth, null, 2), 'utf-8');
}

/** 检测一个路径:是单文件 script.json 还是多文件目录。
 *  - .json 后缀 → file
 *  - 多文件标志齐备(force flag 也会绕过 script.json 存在与否的判断)→ dir
 *  - 否则抛错
 */
export function detectScriptPath(path: string, forceDir = false): { mode: 'file' | 'dir'; path: string } {
  const abs = resolve(path);
  if (forceDir) {
    if (!isScriptDir(abs)) {
      throw new Error(`--dir requested but ${path} is not a valid multi-file script dir (need meta.json + clues.json + characters/order.json)`);
    }
    return { mode: 'dir', path: abs };
  }
  if (existsSync(abs) && abs.endsWith('.json')) return { mode: 'file', path: abs };
  if (isScriptDir(abs)) return { mode: 'dir', path: abs };
  throw new Error(`Not a script file or dir: ${path}`);
}
