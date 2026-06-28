/**
 * 增量状态 diff 引擎。
 * 比较两个 ClientStateView 快照，输出变更路径映射（JSON Pointer）。
 * 特殊路径约定: '/log/-' 表示 log 数组追加（值为新增元素数组）。
 */

/** 浅比较两个值是否相等（引用相同或 JSON.stringify 相同） */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** 检测数组是否仅追加了新元素（prev 是 next 的前缀） */
function isArrayAppend(prev: unknown[], next: unknown[]): boolean {
  if (next.length < prev.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (!shallowEqual(prev[i], next[i])) return false;
  }
  return true;
}

/**
 * 比较两个 view 快照，返回变更路径 → 新值 的映射。
 * 只做顶层 + 二级字段 diff，不做深度递归（避免 CPU 开销）。
 *
 * 特殊处理: log 数组如果仅追加新元素，发送 '/log/-' 路径（值为新增元素数组），
 * 客户端据此 append 而非全量替换，大幅减少带宽。
 *
 * @returns patches: 变更路径映射（JSON Pointer 格式如 '/log/-', '/phaseProgress/actedCount'）
 * @returns removes: 需要删除的路径
 */
export function diffViews(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): { patches: Record<string, unknown>; removes: string[] } {
  const patches: Record<string, unknown> = {};
  const removes: string[] = [];

  for (const key of Object.keys(next)) {
    const nextVal = next[key];
    const prevVal = prev[key];

    if (prevVal === undefined && nextVal !== undefined) {
      patches[`/${key}`] = nextVal;
      continue;
    }

    if (nextVal === undefined || nextVal === null) {
      if (prevVal !== undefined && prevVal !== null) {
        removes.push(`/${key}`);
      }
      continue;
    }

    if (prevVal === undefined || prevVal === null) {
      patches[`/${key}`] = nextVal;
      continue;
    }

    // 对象字段:二级 diff
    if (
      typeof nextVal === 'object' && nextVal !== null && !Array.isArray(nextVal) &&
      typeof prevVal === 'object' && prevVal !== null && !Array.isArray(prevVal)
    ) {
      const subPatches = diffObjectFields(
        prevVal as Record<string, unknown>,
        nextVal as Record<string, unknown>,
        `/${key}`,
      );
      Object.assign(patches, subPatches.patches);
      removes.push(...subPatches.removes);
      continue;
    }

    // 数组字段:仅 log 数组走 append-only 优化,其他数组全量替换
    if (Array.isArray(nextVal) && Array.isArray(prevVal)) {
      if (key === 'log' && isArrayAppend(prevVal, nextVal) && nextVal.length > prevVal.length) {
        patches[`/${key}/-`] = nextVal.slice(prevVal.length);
        continue;
      }
    }

    // 其他类型:引用不同则全量替换
    if (!shallowEqual(prevVal, nextVal)) {
      patches[`/${key}`] = nextVal;
    }
  }

  // 检查 prev 中有但 next 中没有的字段
  for (const key of Object.keys(prev)) {
    if (!(key in next) && prev[key] !== undefined) {
      removes.push(`/${key}`);
    }
  }

  return { patches, removes };
}

/** 对象二级字段 diff */
function diffObjectFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  basePath: string,
): { patches: Record<string, unknown>; removes: string[] } {
  const patches: Record<string, unknown> = {};
  const removes: string[] = [];

  for (const key of Object.keys(next)) {
    const nextVal = next[key];
    const prevVal = prev[key];
    const path = `${basePath}/${key}`;

    if (nextVal === undefined || nextVal === null) {
      if (prevVal !== undefined && prevVal !== null) {
        removes.push(path);
      }
      continue;
    }

    if (prevVal === undefined || prevVal === null) {
      patches[path] = nextVal;
      continue;
    }

    if (!shallowEqual(prevVal, nextVal)) {
      patches[path] = nextVal;
    }
  }

  for (const key of Object.keys(prev)) {
    if (!(key in next) && prev[key] !== undefined) {
      removes.push(`${basePath}/${key}`);
    }
  }

  return { patches, removes };
}
