/**
 * 轻量级 JSON 文件持久化，零外部依赖。
 * 用于房间快照的防抖写入和恢复。
 */
import { writeFile, readFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const debouncers = new Map<string, ReturnType<typeof setTimeout>>();

/** 确保目录存在 */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * 防抖写入：短时间内多次调用只执行最后一次。
 * 用于 broadcastState 高频触发场景，避免每秒写盘多次。
 */
export function debouncedWrite(filePath: string, data: unknown, delayMs = 2000): void {
  const existing = debouncers.get(filePath);
  if (existing) clearTimeout(existing);
  debouncers.set(filePath, setTimeout(() => {
    debouncers.delete(filePath);
    writeJsonFile(filePath, data).catch(() => {});
  }, delayMs));
}

/** 取消防抖写入（清理房间时用） */
export function cancelDebouncedWrite(filePath: string): void {
  const existing = debouncers.get(filePath);
  if (existing) { clearTimeout(existing); debouncers.delete(filePath); }
}

/**
 * 立即同步写入 JSON 文件。
 * mode 0o600 = 仅 owner 可读写，保护 API key 等敏感数据。
 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await writeFile(filePath, json, { mode: 0o600 });
}

/** 读取 JSON 文件，不存在或损坏返回 null */
export async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

/** 删除文件，已不存在则静默 */
export async function deleteFile(filePath: string): Promise<void> {
  try { await unlink(filePath); } catch { /* already gone */ }
}

/** 扫描目录中所有 .json 文件，返回完整路径列表 */
export async function scanDirectory(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter(e => e.endsWith('.json')).map(e => join(dir, e));
  } catch { return []; }
}
