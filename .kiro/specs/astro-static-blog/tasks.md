# 资源文件关联 - 三个待办任务实施方案

## Context

当前 `asset-copier.ts` 只处理 `src=` 属性替换不处理 `href=`，导致 `<a href="file.pdf">` 链接无法工作；`notes-loader.ts` 逐文件调用 `git log`（264次串行 ≈ 26s），且资源扫描是笔记处理的副作用（无 .md 目录的资源会丢失）。本方案解决这三个问题。

## 执行顺序

**Task 2（git log 批量）→ Task 3（资源扫描解耦 + 吸收 Task 1）**

Task 2 完全独立，先执行。Task 3 重构 asset-copier API 形态后，Task 1 的 href 替换被新 `replaceAssetPaths` 统一正则自然覆盖。

---

## Task 2：git log 改为纯批量模式

### 文件：`astro-blog/src/loaders/notes-loader.ts`

**新增 `buildDateMap` 函数**（在 `deriveCategory` 函数之后，约第 295 行）：

```typescript
function buildDateMap(basePath: string): Map<string, Date> {
  const map = new Map<string, Date>();
  try {
    const output = execSync(
      'git log --reverse --diff-filter=A --format="%aI" --name-only',
      { cwd: basePath, timeout: 10000, stdio: ['pipe', 'pipe', 'ignore'] }
    ).toString();

    let currentDate: Date | null = null;
    for (const line of output.trim().split('\n')) {
      if (!line) continue;
      const d = new Date(line);
      if (!isNaN(d.getTime())) {
        currentDate = d;
      } else if (currentDate) {
        const cleanPath = line.replace(/\\/g, '/');
        if (!map.has(cleanPath)) {
          map.set(cleanPath, currentDate);
        }
      }
    }
  } catch { /* git 不可用时返回空 Map，fallback 到 mtime */ }
  return map;
}
```

**修改 `load` 函数**（在 `store.clear()` 之后、`collectMdFiles` 之前新增）：

```typescript
const dateMap = buildDateMap(basePath);
```

**修改日期获取逻辑**（约第 119-120 行），将：
```typescript
const date = rawDate ? new Date(rawDate as string) : getFileDate(filePath, basePath);
```
改为：
```typescript
const date = rawDate
  ? new Date(rawDate as string)
  : (dateMap.get(relPath) ?? statSync(filePath).mtime);
```

**删除 `getFileDate` 函数**（原第 298-316 行）。

> 耗时从 ~26s 降至 ~1s，`--follow` 丢失可接受（重命名文件 ≤3 篇）。

---

## Task 3：资源扫描独立化（吸收 Task 1 的 href 替换）

### 文件 1：`astro-blog/src/loaders/asset-copier.ts`

**修改 import**（第 2 行），增加 `resolve`：
```typescript
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, extname, dirname, relative, resolve } from 'node:path';
```

**新增 `AssetInfo` 接口**（常量定义之后，约第 10 行）：
```typescript
export interface AssetInfo {
  absPath: string;
  relPath: string;
  category: string;
}
```

**新增 `scanAllAssets`**（全局遍历 vault，替代 `collectAssets`）：
```typescript
function deriveCategoryFromPath(relPath: string): string {
  const parts = relPath.split('/');
  if (parts.length <= 1) return '未分类';
  return parts.slice(0, -1).join('/');
}

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
        assets.push({ absPath: fullPath, relPath, category: deriveCategoryFromPath(relPath) });
      }
    }
  }
  walk(vaultRoot);
  return assets;
}
```

**新增 `copyAllAssets`**（按 absPath 去重复制）：
```typescript
export function copyAllAssets(
  allAssets: AssetInfo[],
  publicDir: string = join(process.cwd(), 'public'),
): void {
  const copied = new Set<string>();
  for (const { absPath, relPath, category } of allAssets) {
    if (copied.has(absPath)) continue;
    copied.add(absPath);
    const dest = join(publicDir, 'notes-assets', category, relPath);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(absPath, dest);
  }
}
```

**新增 `replaceAssetPaths`**（统一处理 `src` 和 `href`，吸收 Task 1）：
```typescript
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
      } catch { /* 忽略无效编码 */ }
    }

    for (const attempt of attempts) {
      const resolved = resolve(mdDir, attempt);
      const vaultRelPath = relative(vaultRoot, resolved).replace(/\\/g, '/');
      const asset = assetMap.get(vaultRelPath);
      if (asset) {
        const encoded = encodeURI(asset.relPath);
        return `${attr}="/notes-assets/${asset.category}/${encoded}"`;
      }
    }

    return fullMatch;
  });
}
```

**删除**：`collectAssets`（第 53-79 行）、`syncAndReplaceAssets`（第 114-170 行）。
**保留但标记 `@deprecated`**：`AssetCopyState`、`createAssetCopyState`。
**保留不变**：`escapeRegExp`、`parseBuildIgnore`、`loadBuildIgnore`。

### 文件 2：`astro-blog/src/loaders/notes-loader.ts`

**修改 import**（第 9 行），替换为：
```typescript
import { loadBuildIgnore, scanAllAssets, copyAllAssets, replaceAssetPaths, type AssetInfo } from './asset-copier';
```

**修改 `load` 函数**，重写流程为三个阶段：

```typescript
async load({ store, logger }) {
  store.clear();

  const notesAssetsDir = join(process.cwd(), 'public', 'notes-assets');
  rmSync(notesAssetsDir, { recursive: true, force: true });

  const buildIgnore = loadBuildIgnore(basePath);
  const mdFiles = await collectMdFiles(basePath, excludeDirs, buildIgnore);
  logger.info(`notes-loader: 发现 ${mdFiles.length} 篇笔记（路径：${basePath}）`);

  // === 阶段 0：批量获取 git 日期（Task 2 产物） ===
  const dateMap = buildDateMap(basePath);

  // === 阶段 1：全局资源扫描与复制 ===
  const allAssets = scanAllAssets(basePath, buildIgnore);
  copyAllAssets(allAssets);
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

      const title =
        (frontmatter['title'] as string | undefined) ??
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

      if (draft) { skipped++; continue; }

      const type = (frontmatter['type'] as string | undefined) ?? 'note';
      let html = await md.parse(body);
      html = replaceAssetPaths(html, filePath, assetMap, basePath);

      store.set({
        id: slug,
        data: { title, slug, date, category, tags, draft, type },
        body,
        rendered: { html, metadata: { headings: [], imagePaths: [], frontmatter: {} } },
      });

      loaded++;
    } catch (err) {
      logger.warn(`notes-loader: 跳过 ${filePath} — ${err}`);
      skipped++;
    }
  }
  logger.info(`notes-loader: 加载完成，成功 ${loaded} 篇，跳过 ${skipped} 篇`);
},
```

**删除**：`const assetState = createAssetCopyState()`、`getFileDate` 函数。

---

## Task 1：href 路径替换

Task 1 已被 Task 3 的 `replaceAssetPaths` 自然吸收——统一正则 `/(src|href)="([^"]*)"/g` 一次性覆盖 `src=` 和 `href=` 的所有情况（含跨目录 `../`、中文编码/未编码）。

---

## 验证方法

```bash
cd /Users/wuyuxiang/Myproject/my-blog/astro-blog
npm run build

# 1. 验证 git log 耗时：观察日志中 notes-loader 阶段耗时变化（~26s → ~1s）
# 2. 验证资源文件全部被复制：ls public/notes-assets/
# 3. 验证 href 替换：grep -r 'href="/notes-assets/' dist/
# 4. 验证外部链接未被错误替换：grep -r 'href="https\?://' dist/
# 5. 验证跨目录引用：在 vault 中创建 A/note.md 引用 ../B/image.png，检查构建产物
# 6. 验证无 .md 目录的资源不丢失：在 vault 创建纯资源目录，构建后检查
```
