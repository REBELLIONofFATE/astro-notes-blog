/**
 * scripts/init-frontmatter.mjs
 *
 * 为笔记仓库中所有 .md 文件自动补全 frontmatter 字段：
 *   - date:     git 首次提交日期（--follow 追踪重命名）
 *   - title:    Markdown 正文第一个 # 标题
 *   - category: 从文件路径推导
 *
 * 已有字段绝不覆盖，仅补充缺失项。
 *
 * 用法：
 *   node scripts/init-frontmatter.mjs                          # 正式执行
 *   node scripts/init-frontmatter.mjs --dry-run                # 预览模式
 *   NOTES_PATH=/other/path node scripts/init-frontmatter.mjs   # 指定路径
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, basename, extname, dirname } from 'node:path';
import { execSync } from 'node:child_process';

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
// .buildignore 加载（与 asset-copier.ts 一致）
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
// 收集 .md 文件（与 notes-loader.ts 一致）
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
// 构建 git 日期 Map（与 notes-loader.ts buildDateMap 一致）
// ============================================================

function buildDateMap(basePath) {
  const map = new Map();
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
        const dateStr = lines[lines.length - 1];
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            map.set(fileRel, d);
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* git unavailable */ }
  return map;
}

// ============================================================
// Frontmatter 解析
// ============================================================

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content, hasFrontmatter: false };
  const yamlStr = match[1];
  const body = match[2];
  const frontmatter = {};
  let currentArrayKey = null;
  const currentArray = [];

  for (const line of yamlStr.split('\n')) {
    const trimmed = line.trim();

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

    if (val === '') {
      currentArrayKey = key;
      continue;
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      frontmatter[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else if (val === 'true') {
      frontmatter[key] = true;
    } else if (val === 'false') {
      frontmatter[key] = false;
    } else {
      frontmatter[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }

  if (currentArrayKey !== null && currentArray.length > 0) {
    frontmatter[currentArrayKey] = [...currentArray];
  }

  return { frontmatter, body, hasFrontmatter: true };
}

// ============================================================
// 字段推导
// ============================================================

function extractTitle(body) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function deriveCategory(relPath) {
  const parts = relPath.replace(/\.md$/i, '').split('/');
  if (parts.length === 1) return '未分类';
  return parts.slice(0, -1).join('/');
}

// ============================================================
// YAML 值格式化
// ============================================================

function yamlValue(val) {
  // 需要引号的情况：含冒号、#、特殊字符、首尾空格
  if (typeof val === 'string' && /[:#{}[\]&*!|>'%@`,\n]/.test(val)) {
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  return String(val);
}

// ============================================================
// 主流程
// ============================================================

const buildIgnore = loadBuildIgnore(NOTES_PATH);
const mdFiles = collectMdFiles(NOTES_PATH, EXCLUDE_DIRS, buildIgnore);
console.log(`扫描到 ${mdFiles.length} 个 .md 文件\n`);

const dateMap = buildDateMap(NOTES_PATH);
console.log(`git dateMap 包含 ${dateMap.size} 个文件的日期\n`);

let stats = { updated: 0, skipped: 0, errors: 0 };

for (const filePath of mdFiles) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const relPath = relative(NOTES_PATH, filePath).replace(/\\/g, '/');
    const { frontmatter, body, hasFrontmatter } = parseFrontmatter(content);

    const missing = [];

    // 检查缺失字段
    if (!frontmatter['date']) {
      const dateStr = dateMap.get(relPath);
      if (dateStr) {
        missing.push({ key: 'date', value: dateStr.toISOString().slice(0, 10) });
      } else {
        // git 也查不到，用文件 mtime
        const mtime = statSync(filePath).mtime;
        missing.push({ key: 'date', value: mtime.toISOString().slice(0, 10) });
      }
    }

    if (!frontmatter['title']) {
      const title = extractTitle(body);
      if (title) {
        missing.push({ key: 'title', value: title });
      }
    }

    if (!frontmatter['category']) {
      const cat = deriveCategory(relPath);
      if (cat !== '未分类') {
        missing.push({ key: 'category', value: cat });
      }
    }

    if (missing.length === 0) {
      stats.skipped++;
      continue;
    }

    // 构建新的 frontmatter
    let newContent;

    if (hasFrontmatter) {
      // 在 --- 前插入缺失字段
      const lines = content.split('\n');
      const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
      if (endIdx === -1) { stats.errors++; continue; }

      const newFields = missing.map(m => `${m.key}: ${yamlValue(m.value)}`);
      const before = lines.slice(0, endIdx).join('\n');
      const after = lines.slice(endIdx).join('\n');
      newContent = before + '\n' + newFields.join('\n') + '\n' + after;
    } else {
      // 完全没有 frontmatter，新建 --- 块
      const newFields = [
        '---',
        ...missing.map(m => `${m.key}: ${yamlValue(m.value)}`),
        '---',
        '',
        content.trim()
      ];
      newContent = newFields.join('\n') + '\n';
    }

    // 写入
    if (!DRY_RUN) {
      writeFileSync(filePath, newContent, 'utf-8');
    }

    const changes = missing.map(m => `${m.key}: ${m.value}`).join(', ');
    console.log(`  [${DRY_RUN ? '预览' : '更新'}] ${relPath}  → ${changes}`);
    stats.updated++;
  } catch (err) {
    console.error(`  [错误] ${filePath} — ${err.message}`);
    stats.errors++;
  }
}

console.log(`\n=== ${DRY_RUN ? '预览' : '完成'} ===`);
console.log(`更新 ${stats.updated} 个文件，跳过 ${stats.skipped} 个（已完整），失败 ${stats.errors} 个`);
if (DRY_RUN) {
  console.log('\n提示：使用 node scripts/init-frontmatter.mjs 正式执行');
}
