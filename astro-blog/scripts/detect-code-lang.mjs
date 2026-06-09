/**
 * scripts/detect-code-lang.mjs
 *
 * 扫描笔记仓库中所有 .md 文件，查找未标注语言标签的围栏代码块，
 * 自动检测语言并补全标签。
 *
 * 规则：
 *   - 仅处理 ``` 风格围栏（不处理 ~~~）
 *   - 跳过非空代码行数 < 3 且 highlight.js 置信度(relavance) < 10 的块
 *   - 仅补全，不覆盖已有的语言标签
 *
 * 用法：
 *   node scripts/detect-code-lang.mjs                          # 正式执行
 *   node scripts/detect-code-lang.mjs --dry-run                # 预览模式
 *   NOTES_PATH=/other/path node scripts/detect-code-lang.mjs   # 指定路径
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import hljs from 'highlight.js';

// ============================================================
// 配置
// ============================================================

const DRY_RUN = process.argv.includes('--dry-run');

// 从 .env 文件读取 NOTES_PATH
function loadEnvPath() {
  const envFile = join(dirname(new URL(import.meta.url).pathname), '..', '.env');
  if (!existsSync(envFile)) return undefined;
  const content = readFileSync(envFile, 'utf-8');
  const match = content.match(/^NOTES_PATH=(.+)$/m);
  return match ? match[1].trim() : undefined;
}

const NOTES_PATH = process.env.NOTES_PATH || loadEnvPath();

if (!NOTES_PATH) {
  console.error('错误：请设置 NOTES_PATH 环境变量或在 .env 文件中配置');
  process.exit(1);
}

const EXCLUDE_DIRS = ['.git', '.idea', '文档'];

console.log(`笔记路径：${NOTES_PATH}`);
if (DRY_RUN) console.log('模式：预览（不写入文件）\n');

// ============================================================
// .buildignore 加载
// ============================================================

function loadBuildIgnore(rootDir) {
  const ignoreFile = join(rootDir, '.buildignore');
  if (!existsSync(ignoreFile)) return null;
  const lines = readFileSync(ignoreFile, 'utf-8').split('\n');
  const patterns = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    patterns.push(new RegExp(
      '^' + line.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    ));
  }
  if (patterns.length === 0) return null;
  return (relPath) => patterns.some((r) => r.test(relPath));
}

// ============================================================
// 收集 .md 文件
// ============================================================

function collectMdFiles(dir, excludeDirs, buildIgnore) {
  const results = [];
  function walk(currentDir) {
    let entries;
    try { entries = readdirSync(currentDir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || excludeDirs.includes(entry.name)) continue;
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const pathToCheck = relative(dir, fullPath).replace(/\\/g, '/');
        if (!buildIgnore?.(pathToCheck)) {
          results.push(fullPath);
        }
      }
    }
  }
  walk(dir);
  return results;
}

// ============================================================
// 代码块语言检测
// ============================================================

/** 最小置信度阈值 */
const MIN_RELEVANCE = 10;
/** 跳过短代码块的最小非空行数（行数少 + 低置信度 = 跳过） */
const MIN_LINES = 3;
/** 跳过 highlight.js 的这些检测结果（非编程语言） */
const SKIP_LANGUAGES = new Set(['clean', 'plaintext', 'text']);

/**
 * 统计代码中非空行数
 */
function countNonEmptyLines(code) {
  return code.split('\n').filter(line => line.trim().length > 0).length;
}

/**
 * 检测并替换文件中所有未标注语言的代码块。
 * 返回 { content: string, changes: Array<{ blockIndex, detectedLang, codeSnippet }> }
 */
function detectAndTagCodeBlocks(content) {
  // 匹配未标注语言的 ``` 围栏代码块
  // 规则：三个及以上反引号开始，紧跟可选空白后换行，然后任意内容直到闭合反引号
  const fenceRegex = /(```+)[ \t]*\n([\s\S]*?)\1/g;

  const changes = [];
  let blockIndex = 0;

  const newContent = content.replace(fenceRegex, (match, fence, code) => {
    blockIndex++;

    const nonEmptyLines = countNonEmptyLines(code);
    const result = hljs.highlightAuto(code);
    const detectedLang = result.language;
    const relevance = result.relevance;

    // 未检测出语言 / 非编程语言 → 跳过
    if (!detectedLang || SKIP_LANGUAGES.has(detectedLang)) {
      return match;
    }

    // 短代码 + 低置信度 → 跳过（可能是误判）
    // 长代码但低置信度 → 也跳过（可能是长篇文本被误判）
    if (relevance < MIN_RELEVANCE) {
      return match;
    }

    // 检测出语言 → 补全标签
    changes.push({
      blockIndex,
      detectedLang,
      relevance,
      nonEmptyLines,
      snippet: code.trim().split('\n').slice(0, 3).join('\n'),
    });

    return `${fence}${detectedLang}\n${code}${fence}`;
  });

  return { content: newContent, changes };
}

// ============================================================
// 主流程
// ============================================================

const buildIgnore = loadBuildIgnore(NOTES_PATH);
const mdFiles = collectMdFiles(NOTES_PATH, EXCLUDE_DIRS, buildIgnore);
console.log(`扫描到 ${mdFiles.length} 个 .md 文件\n`);

let stats = { updated: 0, skipped: 0, errors: 0 };
let totalBlocksTagged = 0;

for (const filePath of mdFiles) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const relPath = relative(NOTES_PATH, filePath).replace(/\\/g, '/');
    const { content: newContent, changes } = detectAndTagCodeBlocks(content);

    if (changes.length === 0) {
      stats.skipped++;
      continue;
    }

    // 写入文件
    if (!DRY_RUN) {
      writeFileSync(filePath, newContent, 'utf-8');
    }

    // 输出变更详情
    console.log(`  [${DRY_RUN ? '预览' : '更新'}] ${relPath}`);
    for (const c of changes) {
      const snippetPreview = c.snippet.length > 40
        ? c.snippet.slice(0, 40) + '…'
        : c.snippet;
      console.log(`      块 #${c.blockIndex}: \`\`\`${c.detectedLang}` +
        ` (置信度: ${c.relevance}, 行数: ${c.nonEmptyLines})` +
        `  "${snippetPreview}"`);
    }

    stats.updated++;
    totalBlocksTagged += changes.length;
  } catch (err) {
    console.error(`  [错误] ${filePath} — ${err.message}`);
    stats.errors++;
  }
}

console.log(`\n=== ${DRY_RUN ? '预览' : '完成'} ===`);
console.log(`扫描文件 ${mdFiles.length} 个`);
console.log(`修改文件 ${stats.updated} 个，跳过 ${stats.skipped} 个（无未标注代码块），失败 ${stats.errors} 个`);
console.log(`总计补全代码块标签 ${totalBlocksTagged} 个`);
if (DRY_RUN) {
  console.log('\n提示：使用 node scripts/detect-code-lang.mjs 正式执行');
} else if (totalBlocksTagged > 0) {
  console.log('\n提示：建议用 git diff 检查变更后再提交');
}
