import { resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 把目录配置解析为绝对路径(P1-4)。
 * 绝对路径直接用(部署友好);相对路径相对 baseUrl(传 import.meta.url)解析。
 */
export function resolveDir(val: string, baseUrl: string): string {
  return isAbsolute(val) ? val : fileURLToPath(new URL(val, baseUrl));
}

/**
 * 把 URL 路径安全解析到 base 目录内,防止路径穿越(P1-3)。
 * 先 decode(处理 %2e/%2f 等编码),再 resolve,最后校验结果仍落在 base 之内。
 * 越界(穿越到 base 之外)或编码非法 → 返回 null。
 */
export function safeResolve(base: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // 非法百分号编码
  }
  const rel = decoded.replace(/^\/+/, ''); // 去开头斜杠 → 相对 base
  const resolved = resolve(base, rel);
  if (resolved !== base && !resolved.startsWith(base + sep)) return null;
  return resolved;
}
