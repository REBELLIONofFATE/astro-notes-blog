import type { Loader } from 'astro/loaders';
import { readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { Marked, Renderer } from 'marked';
import { createHighlighter, bundledLanguages, type Highlighter } from 'shiki';
import hljs from 'highlight.js';

// Shiki highlighter 单例，主题与 astro.config.mjs 保持一致（github-dark）
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

export interface NotesLoaderOptions {
  /** 笔记仓库根目录的绝对路径 */
  basePath: string;
  /** 需要排除的目录名（精确匹配），默认排除 .git、.idea、文档 */
  excludeDirs?: string[];
}

export function notesLoader(options: NotesLoaderOptions): Loader {
  const { basePath, excludeDirs = ['.git', '.idea', '文档'] } = options;

  return {
    name: 'notes-loader',
    async load({ store, logger }) {
      store.clear();

      const mdFiles = await collectMdFiles(basePath, excludeDirs);
      logger.info(`notes-loader: 发现 ${mdFiles.length} 篇笔记（路径：${basePath}）`);

      const hl = await getHighlighter();
      const md = buildMarked(hl);

      let loaded = 0;
      let skipped = 0;

      for (const filePath of mdFiles) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const relPath = relative(basePath, filePath).replace(/\\/g, '/');

          const { frontmatter, body } = parseFrontmatter(content);

          const title =
            (frontmatter['title'] as string | undefined) ??
            extractTitle(body) ??
            basename(filePath, extname(filePath));

          const slug = generateSlug(relPath);

          const rawDate = frontmatter['date'];
          const date = rawDate ? new Date(rawDate as string) : getFileDate(filePath, basePath);

          const category =
            (frontmatter['category'] as string | undefined) ?? deriveCategory(relPath);

          const rawTags = frontmatter['tags'];
          const tags: string[] = Array.isArray(rawTags) ? rawTags : [];

          const draft = (frontmatter['draft'] as boolean | undefined) ?? false;

          // draft 文章直接跳过，不上 store，避免生成页面路由
          if (draft) {
            skipped++;
            continue;
          }

          const type = (frontmatter['type'] as string | undefined) ?? 'note';

          const html = await md.parse(body);

          store.set({
            id: slug,
            data: { title, slug, date, category, tags, draft, type },
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

/** 递归收集目录下所有 .md 文件，自动排除隐藏目录和 excludeDirs */
async function collectMdFiles(dir: string, excludeDirs: string[]): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // 检查 .buildignore 标记文件：存在则跳过整个目录
    if (entries.some((e) => e.isFile() && e.name === '.buildignore')) {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || excludeDirs.includes(entry.name)) continue;

      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push(fullPath);
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
 * 获取文件日期：优先 git 首次提交时间，fallback 到文件 mtime
 */
function getFileDate(filePath: string, basePath: string): Date {
  try {
    const output = execSync(
      `git log --follow --format=%aI --diff-filter=A -- "${filePath}"`,
      { cwd: basePath, stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 }
    )
      .toString()
      .trim();

    if (output) {
      const firstLine = output.split('\n')[0].trim();
      const d = new Date(firstLine);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    // ignore, fallback to mtime
  }
  return statSync(filePath).mtime;
}
