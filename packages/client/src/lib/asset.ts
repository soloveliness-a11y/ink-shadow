/**
 * 拼接剧本素材的 HTTP 路径。
 * server 把 content/<scriptId>/ 暴露在 /content/<scriptId>/。
 * view 里的 path 形如 "assets/avatar_c_victim.png"。
 */
export function assetUrl(scriptId: string | undefined, path: string | undefined | null): string | undefined {
  if (!scriptId || !path) return undefined;
  return `/content/${encodeURIComponent(scriptId)}/${path}`;
}
