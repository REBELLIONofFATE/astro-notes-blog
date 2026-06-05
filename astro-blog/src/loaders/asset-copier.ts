import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, extname, dirname, relative, resolve } from 'node:path';

// ============================================================
// 常量 & 工具
// ============================================================

/** 不参与复制的文件扩展名 */
const SKIP_EXTS = new Set(['.md']);

/** 单个资源文件在 vault 下的描述 */
export interface AssetInfo {
  absPath: string;
  relPath: string;
}

/** 转义正则特殊字符 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 解析 .buildignore 内容，返回正则数组 */
export function parseBuildIgnore(content: string): RegExp[] {
  const patterns: RegExp[] = [];
  for (const line of content.split('\n')) {
    const pattern = line.trim();
    if (!pattern || pattern.startsWith('#')) continue;

    let regexStr: string;
    if (pattern.endsWith('/')) {
      // 目录匹配：drafts/ → 匹配路径中包含该目录名的所有文件
      const dirName = escapeRegExp(pattern.slice(0, -1));
      regexStr = `(^|/)${dirName}(/|$)`;
    } else if (pattern.includes('*') || pattern.includes('?')) {
      // glob 通配符：*.log → 匹配任意位置该模式结尾的路径
      regexStr = escapeRegExp(pattern).replace(/\\\*/g, '[^/]*').replace(/\\\?/g, '[^/]');
      regexStr = `(^|/)${regexStr}$`;
    } else {
      // 精确文件名匹配
      regexStr = `(^|/)${escapeRegExp(pattern)}$`;
    }
    patterns.push(new RegExp(regexStr));
  }
  return patterns;
}

/** 从 rootDir 读取 .buildignore（只在指定目录精确查找，不向上递归） */
export function loadBuildIgnore(rootDir: string): ((relPath: string) => boolean) | null {
  const ignoreFile = join(rootDir, '.buildignore');
  if (!existsSync(ignoreFile)) return null;

  const patterns = parseBuildIgnore(readFileSync(ignoreFile, 'utf-8'));
  if (patterns.length === 0) return null;

  return (relPath: string) => patterns.some((r) => r.test(relPath));
}

/** 全局遍历 vault 所有目录，收集全部非 .md 文件 */
export function scanAllAssets(
  vaultRoot: string,
  buildIgnore?: ((relPath: string) => boolean) | null,
): AssetInfo[] {
  const assets: AssetInfo[] = [];
  function walk(dir: string) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && !SKIP_EXTS.has(extname(entry.name).toLowerCase())) {
        const relPath = relative(vaultRoot, fullPath).replace(/\\/g, '/');
        if (buildIgnore?.(relPath)) continue;
        assets.push({ absPath: fullPath, relPath });
      }
    }
  }
  walk(vaultRoot);
  return assets;
}

// ============================================================
// 状态导出
// ============================================================

/** @deprecated 资源复制状态（按目标路径和源文件去重）。Task 3 后不再需要，保留以兼容旧引用。 */
export interface AssetCopyState {
  copiedDestinations: Set<string>;
  copiedSources: Set<string>;
}

export function createAssetCopyState(): AssetCopyState {
  return { copiedDestinations: new Set(), copiedSources: new Set() };
}

// ============================================================
// 资源管线
// ============================================================

/**
 * 将已扫描的全部资源复制到 public/notes-assets/ 下。
 * 按 absPath 去重（每个物理文件只复制一次）。
 */
export function copyAllAssets(
  allAssets: AssetInfo[],
  publicDir: string = join(process.cwd(), 'public'),
): void {
  const copied = new Set<string>();
  for (const { absPath, relPath } of allAssets) {
    if (copied.has(absPath)) continue;
    copied.add(absPath);
    const dest = join(publicDir, 'notes-assets', relPath);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(absPath, dest);
  }
}

/**
 * 替换 HTML 中指向 vault 本地文件的 src/href 引用为 public URL。
 * 通过 assetMap 查找文件归属，支持跨目录相对路径（../ 等）。
 *
 * @param html          已渲染的 HTML 字符串
 * @param noteFilePath  笔记 .md 文件绝对路径（用于解析相对引用）
 * @param assetMap      vaultRelPath → AssetInfo 的查找表
 * @param vaultRoot     vault 根目录
 * @returns 替换后的 HTML
 */
export function replaceAssetPaths(
  html: string,
  noteFilePath: string,
  assetMap: Map<string, AssetInfo>,
  vaultRoot: string,
): string {
  const mdDir = dirname(noteFilePath);

  return html.replace(/(src|href)="([^"]*)"/g, (fullMatch, attr: string, rawPath: string) => {
    // 跳过外部 URL、绝对路径、Data URI、锚点
    if (/^(https?:|data:|[\/#])/.test(rawPath)) return fullMatch;

    const attempts: string[] = [rawPath];
    if (rawPath.includes('%')) {
      try {
        const decoded = decodeURI(rawPath);
        if (decoded !== rawPath) attempts.push(decoded);
      } catch { /* 忽略无效 URI 编码 */ }
    }

    for (const attempt of attempts) {
      const resolved = resolve(mdDir, attempt);
      const vaultRelPath = relative(vaultRoot, resolved).replace(/\\/g, '/');
      const asset = assetMap.get(vaultRelPath);
      if (asset) {
        const encoded = encodeURI(asset.relPath);
        return `${attr}="/notes-assets/${encoded}"`;
      }
    }

    return fullMatch;
  });
}
