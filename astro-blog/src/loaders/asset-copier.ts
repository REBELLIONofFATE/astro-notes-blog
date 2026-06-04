import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';

// ============================================================
// 常量 & 工具
// ============================================================

/** 不参与复制的文件扩展名 */
const SKIP_EXTS = new Set(['.md']);

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

/** 收集目录下所有非 .md 文件，路径相对于 baseDir。maxDepth：-1 无限递归，0 仅当前层 */
function collectAssets(
  dir: string,
  baseDir: string,
  ignore?: ((relPath: string) => boolean) | null,
  maxDepth: number = -1,
): { absPath: string; relPath: string }[] {
  const results: { absPath: string; relPath: string }[] = [];
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const fullPath = join(dir, e.name);
      if (e.isDirectory()) {
        if (maxDepth !== 0) {
          results.push(...collectAssets(fullPath, baseDir, ignore, maxDepth > 0 ? maxDepth - 1 : maxDepth));
        }
      } else if (e.isFile() && !SKIP_EXTS.has(extname(e.name).toLowerCase())) {
        const relPath = relative(baseDir, fullPath);
        if (!ignore?.(relPath)) {
          results.push({ absPath: fullPath, relPath });
        }
      }
    }
  } catch {
    /* 忽略无法读取的目录 */
  }
  return results;
}

// ============================================================
// 状态导出
// ============================================================

/** 资源复制状态（按目标路径和源文件去重） */
export interface AssetCopyState {
  copiedDestinations: Set<string>;
  copiedSources: Set<string>;
}

export function createAssetCopyState(): AssetCopyState {
  return { copiedDestinations: new Set(), copiedSources: new Set() };
}

// ============================================================
// 主入口
// ============================================================

/**
 * 同步笔记目录下所有非 .md 资源到 public/notes-assets/ 并替换 HTML 中的引用路径。
 *
 * 策略：递归扫描 .md 所在目录，复制全部非 .md 文件（图片、PDF、压缩包等），
 * 按目标路径去重，避免同 category 内重复复制。
 *
 * @param noteFilePath  笔记 .md 文件的绝对路径
 * @param category      笔记所属分类
 * @param html          已渲染的 HTML 字符串
 * @param state         跨笔记资源复制状态（去重用）
 * @param buildIgnore   .buildignore 过滤函数，null 表示无规则
 * @param vaultRoot     vault 根目录。提供后可限制根目录笔记不递归扫描子目录
 * @param publicDir     项目 public/ 目录的绝对路径
 * @returns 替换后的 HTML
 */
export function syncAndReplaceAssets(
  noteFilePath: string,
  category: string,
  html: string,
  state: AssetCopyState,
  buildIgnore?: ((relPath: string) => boolean) | null,
  vaultRoot?: string,
  publicDir: string = join(process.cwd(), 'public'),
): string {
  const mdDir = dirname(noteFilePath);
  const categoryAssetsDir = join(publicDir, 'notes-assets', category);

  // 根目录笔记（vault 根下的 .md）不递归扫描子目录，避免拖入其他分类的资源
  const maxDepth = vaultRoot && mdDir === vaultRoot ? 0 : -1;
  const assets = collectAssets(mdDir, mdDir, buildIgnore, maxDepth);

  // --- 复制资源 ---
  for (const { absPath, relPath } of assets) {
    const dest = join(categoryAssetsDir, relPath);
    if (state.copiedSources.has(absPath)) continue;
    state.copiedSources.add(absPath);
    state.copiedDestinations.add(dest);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(absPath, dest);
  }

  // --- HTML 路径替换 ---
  for (const { relPath } of assets) {
    const encoded = encodeURI(relPath);
    const destPath = `/notes-assets/${category}/${encoded}`;

    // src="relPath"
    html = html.replace(
      new RegExp(`src="${escapeRegExp(relPath)}"`, 'g'),
      `src="${destPath}"`,
    );
    // src="./relPath"
    html = html.replace(
      new RegExp(`src="\./${escapeRegExp(relPath)}"`, 'g'),
      `src="${destPath}"`,
    );

    // 处理文件名含中文时 Obsidian 可能输出编码/未编码两种引用
    if (encoded !== relPath) {
      html = html.replace(
        new RegExp(`src="${escapeRegExp(encoded)}"`, 'g'),
        `src="${destPath}"`,
      );
      html = html.replace(
        new RegExp(`src="\./${escapeRegExp(encoded)}"`, 'g'),
        `src="${destPath}"`,
      );
    }
  }

  return html;
}
