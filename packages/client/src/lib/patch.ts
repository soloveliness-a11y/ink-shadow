/**
 * 按 JSON Pointer 路径设置值。
 * 特殊路径约定: '/log/-' 表示 log 数组追加（值为新增元素数组）。
 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return;

  // 特殊处理: '/log/-' → 追加到 log 数组
  if (parts.length >= 2 && parts[parts.length - 1] === '-') {
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 2; i++) {
      const key = parts[i]!;
      const next = cur[key];
      if (next == null || typeof next !== 'object') cur[key] = {};
      cur = cur[key] as Record<string, unknown>;
    }
    const arrKey = parts[parts.length - 2]!;
    const arr = cur[arrKey];
    if (Array.isArray(arr) && Array.isArray(value)) {
      arr.push(...value);
    } else if (Array.isArray(value)) {
      cur[arrKey] = value;
    }
    return;
  }

  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (next == null || typeof next !== 'object') {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/** 按 JSON Pointer 路径删除值 */
export function deleteByPath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]!];
    if (next == null || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]!];
}
