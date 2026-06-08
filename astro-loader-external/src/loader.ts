// loader.ts - 核心 loader：从外部目录加载 Markdown 笔记

import type { Loader } from 'astro/loaders';
import { readFileSync, rmSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { Marked, Renderer } from 'marked';
import { createHighlighter, bundledLanguages, type Highlighter } from 'shiki';
import hljs from 'highlight.js';
import { loadBuildIgnore, scanAllAssets, copyAllAssets, replaceAssetPaths } from './asset-copier';
import type { NotesLoaderOptions, AssetInfo } from './types';

// ============================================================
// 标题 ID 生成（与 marked renderer 保持一致）
// ============================================================

/** 从纯文本生成 URL 安全的 slug */
function generateId(text: string): string {
  return text
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff\-]/g, '')
    .toLowerCase();
}

// ============================================================
// 代码高亮引擎
// ============================================================

// Shiki highlighter 单例
let _highlighter: Highlighter | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!_highlighter) {
    _highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: Object.keys(bundledLanguages),
    });
  }
  return _highlighter;
}

// highlight.js 语言名 → Shiki 语言名的别名映射
const LANG_ALIAS: Record<string, string> = {
  shell: 'bash',
  sh: 'bash',
  zsh: 'bash',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  md: 'markdown',
  yml: 'yaml',
};

function resolveLang(hl: Highlighter, lang: string): string {
  const normalized = LANG_ALIAS[lang] ?? lang;
  return hl.getLoadedLanguages().includes(normalized as never) ? normalized : 'text';
}

function buildMarked(hl: Highlighter): Marked {
  const renderer = new Renderer();
  renderer.heading = function ({ tokens, depth }: { tokens: any[]; depth: number }): string {
    const text = this.parser.parseInline(tokens);
    const plainText = text.replace(/<[^>]+>/g, '').trim();
    const id = generateId(plainText);
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };
  renderer.code = ({ text, lang }) => {
    let resolvedLang: string;

    if (lang) {
      // 有标签：别名修正后交给 Shiki
      resolvedLang = resolveLang(hl, lang);
    } else {
      // 无标签：用 highlight.js 自动检测语言，再交给 Shiki 渲染
      const detected = hljs.highlightAuto(text);
      resolvedLang = detected.language ? resolveLang(hl, detected.language) : 'text';
    }

    try {
      return hl.codeToHtml(text, { lang: resolvedLang, theme: 'github-dark' });
    } catch {
      return `<pre><code>${text}</code></pre>`;
    }
  };
  return new Marked({ renderer });
}

// ============================================================
// 主入口
// ============================================================

export function notesLoader(options: NotesLoaderOptions): Loader {
  const {
    basePath,
    excludeDirs = ['.git', '.idea', '文档'],
    routePrefix = '/notes',
    assetsPrefix = '/notes-assets',
  } = options;

  if (!basePath) {
    return {
      name: 'notes-loader',
      async load({ store }) {
        store.clear();
      },
    };
  }

  return {
    name: 'notes-loader',
    async load({ store, logger }) {
      store.clear();

      // 清理上次构建的资源产物，避免残留文件
      const assetsDir = assetsPrefix.replace(/^\//, '');
      const notesAssetsDir = join(process.cwd(), 'public', assetsDir);
      rmSync(notesAssetsDir, { recursive: true, force: true });

      const buildIgnore = loadBuildIgnore(basePath);
      const mdFiles = await collectMdFiles(basePath, excludeDirs, buildIgnore);
      logger.info(`notes-loader: 发现 ${mdFiles.length} 篇笔记（路径：${basePath}）`);

      // === 阶段 0：获取 git 日期 ===
      const dateMap = buildDateMap(basePath);
      logger.info(`notes-loader: dateMap 包含 ${dateMap.size} 个文件的 git 日期`);

      // === 阶段 1：全局资源扫描与复制 ===
      const allAssets = scanAllAssets(basePath, buildIgnore);
      copyAllAssets(allAssets, assetsPrefix);
      const assetMap = new Map<string, AssetInfo>();
      for (const a of allAssets) {
        if (!assetMap.has(a.relPath)) {
          assetMap.set(a.relPath, a);
        }
      }
      logger.info(`notes-loader: 复制 ${allAssets.length} 个资源文件`);

      // === 阶段 2：逐篇笔记处理（渲染 + 路径替换 + 入库） ===
      const hl = await getHighlighter();
      const md = buildMarked(hl);
      let loaded = 0;
      let skipped = 0;

      for (const filePath of mdFiles) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const relPath = relative(basePath, filePath).replace(/\\/g, '/');

          const { frontmatter, body } = parseFrontmatter(content);

          const rawTitle = frontmatter['title'] as string | undefined;

          const title =
            rawTitle ??
            extractTitle(body) ??
            basename(filePath, extname(filePath));

          const slug = generateSlug(relPath);

          const rawDate = frontmatter['date'];
          const date = rawDate
            ? new Date(rawDate as string)
            : (dateMap.get(relPath) ?? statSync(filePath).mtime);

          const category =
            (frontmatter['category'] as string | undefined) ?? deriveCategory(relPath);

          const rawTags = frontmatter['tags'];
          const tags: string[] = Array.isArray(rawTags) ? rawTags : [];

          const draft = (frontmatter['draft'] as boolean | undefined) ?? false;

          if (draft) {
            skipped++;
            continue;
          }

          const type = (frontmatter['type'] as string | undefined) ?? 'note';

          let html = await md.parse(body);
          html = replaceAssetPaths(html, filePath, assetMap, basePath, assetsPrefix);

          store.set({
            id: slug,
            data: { title, slug, date, category, tags, draft, type, rawTitle },
            body,
            rendered: {
              html,
              metadata: { headings: [], imagePaths: [], frontmatter: {} },
            },
          });

          loaded++;
        } catch (err) {
          logger.warn(`notes-loader: 跳过 ${filePath} — ${err}`);
          skipped++;
        }
      }

      logger.info(`notes-loader: 加载完成，成功 ${loaded} 篇，跳过 ${skipped} 篇`);
    },
  };
}

// ============================================================
// 内部工具函数
// ============================================================

/** 递归收集目录下所有 .md 文件，自动排除隐藏目录和 excludeDirs */
async function collectMdFiles(
  dir: string,
  excludeDirs: string[],
  buildIgnore?: ((relPath: string) => boolean) | null,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || excludeDirs.includes(entry.name)) continue;

      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const pathToCheck = relative(dir, fullPath).replace(/\\/g, '/');
        if (!buildIgnore?.(pathToCheck)) {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return results;
}

/** 解析 YAML frontmatter，无 frontmatter 时返回空对象 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const yamlStr = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;
  const currentArray: string[] = [];

  for (const line of yamlStr.split('\n')) {
    const trimmed = line.trim();

    // 处理 YAML 数组项（- value）
    if (currentArrayKey !== null) {
      if (trimmed.startsWith('- ')) {
        currentArray.push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ''));
        continue;
      } else {
        frontmatter[currentArrayKey] = [...currentArray];
        currentArray.length = 0;
        currentArrayKey = null;
      }
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (!key) continue;

    // 多行数组：tags:\n  - a\n  - b
    if (val === '') {
      currentArrayKey = key;
      continue;
    }

    // 行内数组：tags: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      frontmatter[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else if (val === 'true') {
      frontmatter[key] = true;
    } else if (val === 'false') {
      frontmatter[key] = false;
    } else {
      frontmatter[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }

  // 最后一个数组未关闭时落盘
  if (currentArrayKey !== null && currentArray.length > 0) {
    frontmatter[currentArrayKey] = [...currentArray];
  }

  return { frontmatter, body };
}

/** 提取 Markdown 正文第一个 # 标题 */
function extractTitle(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * 从相对路径生成 URL 安全的 slug
 * redis/springboot整合redis.md → redis-springboot整合redis
 */
function generateSlug(relPath: string): string {
  return relPath
    .replace(/\.md$/i, '')
    .replace(/[/\\]/g, '-')
    .replace(/\s+/g, '-');
}

/**
 * 从文件相对路径推导分类
 * redis/springboot整合redis.md → redis
 * 根目录文件 → 未分类
 */
function deriveCategory(relPath: string): string {
  const parts = relPath.replace(/\.md$/i, '').split('/');
  if (parts.length === 1) return '未分类';
  return parts.slice(0, -1).join('/');
}

/**
 * 逐文件调用 git log --follow 获取首次提交日期。
 * --follow 追踪重命名/移动历史，保证日期准确。
 * 仅依赖 git 命令，macOS / Linux / Windows（Git Bash）均可运行。
 *
 * @returns Map<gitRelPath, Date>，git 不可用时返回空 Map
 */
function buildDateMap(basePath: string): Map<string, Date> {
  const map = new Map<string, Date>();
  try {
    const files = execSync(
      `git -c core.quotepath=false -C "${basePath}" ls-files -- '*.md'`,
      { timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }
    ).toString().trim().split('\n').filter(Boolean);

    for (const fileRel of files) {
      try {
        const lines = execSync(
          `git -c core.quotepath=false -C "${basePath}" log --follow --format=%aI --diff-filter=A -- "${fileRel}"`,
          { timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
        ).toString().trim().split('\n');
        const dateStr = lines[lines.length - 1]; // 最后一行 = 最早的提交
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            map.set(fileRel, d);
          }
        }
      } catch { /* 单个文件 git log 失败，跳过 */ }
    }
  } catch { /* git 不可用时返回空 Map，fallback 到 mtime */ }
  return map;
}
