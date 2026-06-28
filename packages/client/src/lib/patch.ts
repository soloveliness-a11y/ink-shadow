/**
 * 按 JSON Pointer 路径设置值。
 * 特殊路径约定: '/xxx/-' 表示 xxx 数组追加（值为新增元素数组）。
 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return;

  // 特殊处理: '/xxx/-' → 追加到数组
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

/**
 * 不可变版 setByPath:沿路径浅拷贝每一层,返回新根对象。
 * 未变更的子树保持引用不变,配合 React/Zustand 减少不必要渲染。
 */
export function immutableSetByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return obj;

  // 特殊处理: '/xxx/-' → 追加到数组
  if (parts.length >= 2 && parts[parts.length - 1] === '-') {
    const arrKey = parts[parts.length - 2]!;
    if (parts.length === 2) {
      // 顶层: /log/-
      const arr = obj[arrKey];
      if (Array.isArray(arr) && Array.isArray(value)) {
        return { ...obj, [arrKey]: [...arr, ...value] };
      }
      return { ...obj, [arrKey]: value };
    }
    // 嵌套: /self/myClues/-
    const parent = immutableCloneToPath(obj, parts.slice(0, -2));
    const arr = (parent as Record<string, unknown>)[arrKey];
    if (Array.isArray(arr) && Array.isArray(value)) {
      (parent as Record<string, unknown>)[arrKey] = [...arr, ...value];
    } else {
      (parent as Record<string, unknown>)[arrKey] = value;
    }
    return obj;
  }

  // 普通路径:浅拷贝到目标层
  const newRoot = { ...obj };
  let cur: Record<string, unknown> = newRoot;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const child = cur[key];
    const clone = (child != null && typeof child === 'object') ? { ...(child as Record<string, unknown>) } : {};
    cur[key] = clone;
    cur = clone;
  }
  cur[parts[parts.length - 1]!] = value;
  return newRoot;
}

/** 浅拷贝路径上的每一层,返回最深一层的引用(供调用方就地修改)。 */
function immutableCloneToPath(obj: Record<string, unknown>, parts: string[]): Record<string, unknown> {
  let cur: Record<string, unknown> = obj;
  for (const key of parts) {
    const child = cur[key];
    const clone = (child != null && typeof child === 'object') ? { ...(child as Record<string, unknown>) } : {};
    cur[key] = clone;
    cur = clone;
  }
  return cur;
}

/**
 * 不可变版 deleteByPath:沿路径浅拷贝每一层,返回新根对象。
 */
export function immutableDeleteByPath(obj: Record<string, unknown>, path: string): Record<string, unknown> {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return obj;
  const newRoot = { ...obj };
  let cur: Record<string, unknown> = newRoot;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]!];
    if (next == null || typeof next !== 'object') return obj;
    const clone = { ...(next as Record<string, unknown>) };
    cur[parts[i]!] = clone;
    cur = clone;
  }
  delete cur[parts[parts.length - 1]!];
  return newRoot;
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
