/**
 * 轻量级 JSON 文件持久化，零外部依赖。
 * 用于房间快照的防抖写入和恢复。
 */
import { writeFile, readFile, mkdir, readdir, unlink, rename } from 'node:fs/promises';
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
 * 立即同步写入 JSON 文件(原子写:tmp+rename,防止崩溃写半截损坏)。
 * mode 0o600 = 仅 owner 可读写，保护 API key 等敏感数据。
 * H3: 进程在写到一半被 kill/断电时,直接 writeFile 会留下半截 JSON,
 * 重启后 readJsonFile 解析失败 → 整局进度永久丢失。
 * 改为:写 .tmp → rename(同分区原子)→ 写成功后保留 .bak 备份。
 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data);
  const tmpPath = `${filePath}.tmp`;
  const bakPath = `${filePath}.bak`;
  await writeFile(tmpPath, json, { mode: 0o600 });
  await rename(tmpPath, filePath); // 原子替换:要么完整旧文件,要么完整新文件
  // 保留一份备份(供 readJsonFile 在主文件损坏时兜底恢复)
  try {
    await writeFile(bakPath, json, { mode: 0o600 });
  } catch {
    /* 备份失败不阻断主写(可能磁盘满,主写已成功) */
  }
}

/** 读取 JSON 文件,不存在或损坏返回 null。损坏时尝试从 .bak 恢复(H3) */
export async function readJsonFile(filePath: string): Promise<unknown | null> {
  const tryParse = async (p: string): Promise<unknown | null> => {
    try {
      const raw = await readFile(p, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  // 主文件
  const data = await tryParse(filePath);
  if (data !== null) return data;
  // 主文件损坏/不存在 → 尝试 .bak 备份
  const bak = await tryParse(`${filePath}.bak`);
  if (bak !== null) {
    console.warn(`[persistence] ${filePath} 损坏,已从 .bak 恢复`);
    return bak;
  }
  return null;
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
