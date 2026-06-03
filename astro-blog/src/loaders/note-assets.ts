import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';

// ============================================================
// 常量 & 工具函数
// ============================================================

/** 支持的图片文件扩展名 */
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);

/** 扫描目录下的非 .md 图片文件 */
function findSameDirImages(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && IMAGE_EXTS.has(extname(e.name).toLowerCase()))
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

/** 转义正则特殊字符 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// 类型定义
// ============================================================

/** 资源同步状态（跨笔记去重） */
export interface AssetSyncState {
  copiedDirs: Set<string>;
}

/** 创建资源同步状态（每个 load 周期调用一次） */
export function createAssetSyncState(): AssetSyncState {
  return { copiedDirs: new Set() };
}

/**
 * 资源处理策略名。
 * - `'auto'`：自动启用全部四种策略（默认）
 * - `'copy-all'`：预留，未来扫描 vault 全量图片（当前等同于 auto）
 * - 其他：只启用指定策略
 */
export type AssetStrategyName =
  | 'auto'
  | 'copy-all'
  | 'assets'
  | 'asserts'
  | 'filename-assets'
  | 'same-dir';

// ============================================================
// 策略内部类型
// ============================================================

interface StrategyContext {
  noteFilePath: string;
  mdDir: string;
  mdBasename: string;
  category: string;
  categoryAssetsDir: string;
  state: AssetSyncState;
}

interface StrategyResult {
  prefixes: string[];
  sameDirImages: string[];
}

type StrategyFn = (ctx: StrategyContext) => StrategyResult;

// ============================================================
// 策略实现
// ============================================================

/** 方案1: ./${filename}.assets/ 文件夹 */
const filenameAssetsStrategy: StrategyFn = ({ mdDir, mdBasename, categoryAssetsDir }) => {
  const srcDir = join(mdDir, `${mdBasename}.assets`);
  const prefixes: string[] = [];

  if (existsSync(srcDir)) {
    const encoded = encodeURI(mdBasename);
    cpSync(srcDir, join(categoryAssetsDir, `${encoded}.assets`), { recursive: true });
    prefixes.push(`${encoded}.assets/`);
    if (encoded !== mdBasename) {
      prefixes.push(`${mdBasename}.assets/`);
    }
  }

  return { prefixes, sameDirImages: [] };
};

/** 方案2/3 工厂: ./assets/ 或 ./asserts/ 共享目录（按 category 去重） */
function createSharedDirStrategy(dirName: string): StrategyFn {
  return ({ mdDir, category, categoryAssetsDir, state }) => {
    const srcDir = join(mdDir, dirName);
    const dedupKey = `${category}:${dirName}`;

    if (!state.copiedDirs.has(dedupKey) && existsSync(srcDir)) {
      cpSync(srcDir, join(categoryAssetsDir, dirName), { recursive: true });
      state.copiedDirs.add(dedupKey);
    }

    return {
      prefixes: existsSync(srcDir) ? [`${dirName}/`] : [],
      sameDirImages: [],
    };
  };
}

/** 方案4: 同目录散落图片 */
const sameDirStrategy: StrategyFn = ({ mdDir, categoryAssetsDir }) => {
  const images = findSameDirImages(mdDir);

  if (images.length > 0) {
    mkdirSync(categoryAssetsDir, { recursive: true });
    for (const img of images) {
      cpSync(img, join(categoryAssetsDir, basename(img)));
    }
  }

  return { prefixes: [], sameDirImages: images };
};

// ============================================================
// 策略注册表 & 调度
// ============================================================

type ConcreteStrategy = Exclude<AssetStrategyName, 'auto' | 'copy-all'>;

const STRATEGIES: Record<ConcreteStrategy, StrategyFn> = {
  'filename-assets': filenameAssetsStrategy,
  assets: createSharedDirStrategy('assets'),
  asserts: createSharedDirStrategy('asserts'),
  'same-dir': sameDirStrategy,
};

function resolveStrategyFns(name: AssetStrategyName): StrategyFn[] {
  if (name === 'auto' || name === 'copy-all') {
    return Object.values(STRATEGIES);
  }
  const fn = STRATEGIES[name];
  return fn ? [fn] : [];
}

// ============================================================
// 主入口
// ============================================================

/**
 * 同步笔记关联的资源文件到 public/notes-assets/ 并替换 HTML 中的图片路径。
 *
 * @param noteFilePath  笔记 .md 文件的绝对路径
 * @param category      笔记所属分类（作为资源子目录名）
 * @param html          已渲染的 HTML 字符串
 * @param state         跨笔记的资源同步状态（去重用）
 * @param publicDir     项目 public/ 目录的绝对路径
 * @param strategyName  启用的资源处理策略，默认 'auto'
 * @returns 替换后的 HTML
 */
export function syncAndReplaceAssets(
  noteFilePath: string,
  category: string,
  html: string,
  state: AssetSyncState,
  publicDir: string = join(process.cwd(), 'public'),
  strategyName: AssetStrategyName = 'auto',
): string {
  const mdDir = dirname(noteFilePath);
  const mdBasename = basename(noteFilePath, extname(noteFilePath));
  const categoryAssetsDir = join(publicDir, 'notes-assets', category);

  const ctx: StrategyContext = {
    noteFilePath,
    mdDir,
    mdBasename,
    category,
    categoryAssetsDir,
    state,
  };

  // 执行所有活跃策略，收集结果
  const allPrefixes: string[] = [];
  const allSameDirImages: string[] = [];

  for (const strategy of resolveStrategyFns(strategyName)) {
    const { prefixes, sameDirImages } = strategy(ctx);
    allPrefixes.push(...prefixes);
    allSameDirImages.push(...sameDirImages);
  }

  // --- HTML 路径替换 ---

  for (const prefix of allPrefixes) {
    html = html.replace(
      new RegExp(`src="${escapeRegExp(prefix)}`, 'g'),
      `src="/notes-assets/${category}/${prefix}`,
    );
  }

  for (const img of allSameDirImages) {
    const fname = basename(img);
    const encoded = encodeURI(fname);
    html = html.replace(
      new RegExp(`src="${escapeRegExp(encoded)}"`, 'g'),
      `src="/notes-assets/${category}/${encoded}"`,
    );
    if (encoded !== fname) {
      html = html.replace(
        new RegExp(`src="${escapeRegExp(fname)}"`, 'g'),
        `src="/notes-assets/${category}/${encoded}"`,
      );
    }
  }

  return html;
}
