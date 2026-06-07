# notesLoader 解耦与开源方案设计

## 一、背景

当前项目使用自定义 `notesLoader` 加载外部笔记仓库，现有方案存在以下问题：

1. **主题强耦合**：路由前缀 `/notes/`、资源前缀 `/notes-assets/` 硬编码在 loader 和页面模板中
2. **无法独立复用**：其他用户必须使用本项目主题才能使用这个 loader
3. **开源困难**：loader 与主题绑定，无法作为通用包发布

## 二、现状分析

### 2.1 硬编码耦合点

| 文件 | 耦合内容 | 影响 |
|------|---------|------|
| `asset-copier.ts:115` | `public/notes-assets` 复制目标路径 | 资源存放位置固定 |
| `asset-copier.ts:157` | `/notes-assets/` URL 前缀 | HTML 替换后的 URL 固定 |
| `notes-loader.ts:98` | `public/notes-assets` 清理目录 | 构建清理逻辑固定 |
| `posts.ts:81` | `getNoteUrl()` 返回 `/notes/{slug}` | 全局 URL 生成固定 |

### 2.2 当前项目架构

```
外部 Vault → notesLoader → 全局资源扫描 → 逐篇渲染 → 入库
     ↓                          ↓
  零侵入（264篇笔记无需修改）    完整资源管线（scan → copy → replace → ignore）
```

核心功能：
- ✅ 外部路径加载（NOTES_PATH 环境变量）
- ✅ 自定义代码高亮（Shiki + highlight.js 双引擎）
- ✅ 资源路径替换（`./images/arch.png` → `/notes-assets/redis/images/arch.png`）
- ✅ Git 日期追踪（`git log --follow`）
- ✅ 内容分级策略（featured/note/private）
- ✅ `.buildignore` 自定义忽略规则

## 三、竞品对比

### 3.1 astro-loader-obsidian 分析

| 维度 | 当前 notesLoader | astro-loader-obsidian |
|------|:---:|:---:|
| 外部路径加载 | ✅ NOTES_PATH 任意路径 | ❌ 必须在项目内 `src/content/` |
| 资源扫描 | ✅ 全局扫描 + 去重 | ⚠️ 基础 glob 匹配 |
| 跨目录资源引用 | ✅ `../` 相对路径自动解析 | ❌ 仅同目录 |
| Git 日期追踪 | ✅ `git log --follow` | ❌ 使用 mtime |
| 代码高亮定制 | ✅ Shiki + highlight.js 双引擎 | ❌ 依赖 Astro 默认 |
| 内容分级 | ✅ featured/note/private | ⚠️ 仅 `publish` 字段 |
| .buildignore | ✅ 自定义忽略规则 | ❌ 无 |
| Obsidian wikilink | ❌ 不支持（可增强） | ✅ 内置解析 |
| Obsidian 嵌入语法 | ❌ 不支持（可增强） | ✅ `![[image.png]]` |
| 资源路径替换 | ✅ src + href 均处理 | ⚠️ 仅 src |
| 发布时间 | 2025年初 | 2024年11月 |
| 数据输出 | ✅ 标准 StoreDocument | ✅ 标准 StoreDocument |

### 3.2 设计哲学差异

**astro-loader-obsidian**：
- 专注 Obsidian 生态（wikilink、嵌入图片）
- vault 在项目内
- 配套主题 `astro-theme-spaceship`
- 适合 Obsidian 重度用户

**notesLoader**（本项目）：
- 专注外部路径和资源管线
- 支持 Typora/Obsidian 等编辑器
- 零迁移成本（264篇笔记直接上线）
- 适合笔记在外部且使用标准 Markdown 的用户

### 3.3 为什么之前没有人做类似功能

1. **Content Layer API 2024年底才稳定**（Astro 5.0 发布时）
2. **此前 API 长期处于实验性状态**，不推荐生产使用
3. **大多数用户的 workaround**：symlink、手动复制、Git submodule
4. **资源处理是"深水区"**：跨目录解析、去重、编码处理等复杂度高
5. **astro-loader-obsidian 发布时间线**：
   - 2024年11月8日：首次发布（0.0.1）
   - 2025年4-9月：快速迭代至 0.10.0
   - 其设计目标与本项目不同，非 API 限制

**结论：正是现在发布的好时机**——API 稳定、需求增长、竞争少。

## 四、解耦方案设计

### 4.1 核心思路

将硬编码字符串提取为可配置参数，保持向后兼容的默认值：

```typescript
export interface NotesLoaderOptions {
  basePath?: string;
  excludeDirs?: string[];

  // === 新增：可配置项 ===
  /** 笔记路由前缀，默认 '/notes' */
  routePrefix?: string;
  /** 资源路由前缀，默认 '/notes-assets' */
  assetsPrefix?: string;
  /** 渲染模式 */
  renderMode?: 'prerender' | 'lazy';
  /** 代码高亮配置 */
  syntaxHighlight?: {
    enabled: boolean;
    engine?: 'shiki' | 'highlightjs';
    theme?: string;
    autoDetect?: boolean;
  };
}
```

### 4.2 资源配置化

```typescript
// asset-copier.ts 改造

export interface AssetCopierConfig {
  assetsPrefix: string;    // 如 '/notes-assets'
  publicDir?: string;
}

export function copyAllAssets(allAssets: AssetInfo[], config: AssetCopierConfig): void {
  const assetsDir = config.assetsPrefix.replace(/^\//, '');
  // ... 使用 assetsDir 替代硬编码
}

export function replaceAssetPaths(
  html: string,
  noteFilePath: string,
  assetMap: Map<string, AssetInfo>,
  vaultRoot: string,
  assetsPrefix: string,  // 新增参数
): string {
  // ... 使用 assetsPrefix 替代硬编码的 '/notes-assets/'
}
```

### 4.3 URL 生成配置化

```typescript
// posts.ts 改造
export function getNoteUrl(slug: string, routePrefix = '/notes'): string {
  return `${routePrefix}/${slug}`;
}
```

### 4.4 使用示例

```typescript
// 场景 1：当前博客（默认配置，无需修改）
const notes = defineCollection({
  loader: notesLoader({ basePath: NOTES_PATH }),
});

// 场景 2：用户自定义
const notes = defineCollection({
  loader: notesLoader({
    basePath: '/path/to/vault',
    routePrefix: '/wiki',
    assetsPrefix: '/wiki-assets',
    syntaxHighlight: { engine: 'shiki', theme: 'nord' },
  }),
});
```

## 五、资源文件处理方案

### 5.1 Loader 职责边界

```
Loader 职责：
├─ ✅ 加载原始数据（frontmatter、Markdown body）
├─ ✅ 处理资源文件（扫描、复制、路径替换）
├─ ✅ 预渲染 HTML（可选）
└─ ✅ 存入 Astro store（不是生成文件）

主题职责：
├─ ✅ 定义页面模板（[slug].astro）
├─ ✅ 使用 getCollection() 获取数据
├─ ✅ 使用 render() 或 rendered.html 生成最终 HTML
└─ ✅ 控制布局、样式、SEO
```

### 5.2 数据流转

```
外部 Vault
  └─ notesLoader() 执行
       ├─ 1. 解析 frontmatter
       ├─ 2. 扫描资源 → 复制到 public/{assetsPrefix}/
       ├─ 3. 渲染 Markdown → 替换资源路径
       └─ 4. store.set({ id, data, body, rendered })
              ↓
       Astro 页面模板
         └─ getCollection() → render() 或 rendered.html
              ↓
         dist/{routePrefix}/{slug}/index.html
```

### 5.3 预渲染模式（保持当前行为）

```typescript
// 默认 renderMode: 'prerender'
store.set({
  id: slug,
  data: { title, slug, date, category, tags, type, draft },
  body,              // 原始 Markdown
  rendered: {
    html,            // ✅ 预渲染 HTML（含资源路径替换、代码高亮）
    metadata: { headings, imagePaths, frontmatter },
  },
});
```

### 5.4 懒渲染模式（可选）

```typescript
// renderMode: 'lazy'
store.set({
  id: slug,
  data: { title, slug, date, category, tags },
  body,     // 只提供 Markdown
  // 不提供 rendered.html，由 Astro 渲染
});
```

## 六、开源发布方案

### 6.1 包结构

```
astro-loader-notes/           # 独立 npm 包
├── src/
│   ├── loader.ts             # 核心 loader（与主题无关）
│   ├── asset-copier.ts       # 资源处理引擎
│   ├── types.ts              # 标准数据结构
│   └── schemas.ts            # Zod schema
├── package.json
└── README.md

astro-blog/                   # 当前项目（作为使用示例）
├── src/
│   └── content.config.ts
│       └── import { notesLoader } from 'astro-loader-notes'
└── ...
```

### 6.2 包名建议

| 候选 | 评价 |
|------|------|
| `astro-loader-notes` | ✅ 简洁、通用 |
| `astro-loader-vault` | ✅ 强调 vault 概念 |
| `astro-loader-external-md` | ⚠️ 过长 |

### 6.3 核心卖点

```markdown
# astro-loader-notes

> 从任意路径加载 Markdown 笔记，自动处理资源文件，零迁移成本

## ✨ 特性

- 🌍 **外部路径支持**：加载项目外任意目录的笔记
- 🖼️ **智能资源处理**：自动扫描、复制、路径替换
- 🔗 **跨目录兼容**：支持 `../` 相对路径引用
- 📅 **Git 日期追踪**：`git log --follow` 获取准确日期
- ⚡ **零迁移成本**：现有笔记无需修改即可使用
- 🎨 **自定义高亮**：Shiki + highlight.js 双引擎
- 📝 **内容分级**：featured/note/private 三级可见性
- 🔧 **高度可配置**：路由前缀、资源前缀、主题等
```

## 七、待办事项

### 7.1 解耦改造

- [ ] **task1**：将 `notes-loader.ts` 中的硬编码路径改为配置项
  - 新增 `routePrefix`、`assetsPrefix` 参数
  - 默认值保持 `/notes`、`/notes-assets`
  - 涉及文件：`src/loaders/notes-loader.ts`

- [ ] **task2**：将 `asset-copier.ts` 中的 `/notes-assets/` 改为可配置前缀
  - `copyAllAssets()` 接收 `AssetCopierConfig` 参数
  - `replaceAssetPaths()` 接收 `assetsPrefix` 参数
  - 涉及文件：`src/loaders/asset-copier.ts`

- [ ] **task3**：将 `posts.ts` 中的 URL 生成函数改为从配置读取
  - `getNoteUrl()` 接收 `routePrefix` 参数
  - 涉及文件：`src/utils/posts.ts`

### 7.2 测试与验证

- [ ] **task4**：验证默认配置下功能不变（向后兼容）
- [ ] **task5**：测试自定义路由前缀场景
- [ ] **task6**：测试多集合共存场景

### 7.3 打包发布

- [ ] **task7**：创建独立包结构
- [ ] **task8**：编写 README 文档
- [ ] **task9**：添加单元测试
- [ ] **task10**：发布到 npm

### 7.4 远期规划

- [ ] 增加 Obsidian wikilink 解析（渐进增强，可关闭）
- [ ] 增加 `![[image.png]]` 嵌入语法支持
- [ ] 支持图片优化（sharp 集成，可选）
- [ ] 支持 i18n 路由

## 八、结论

1. **不应使用 astro-loader-obsidian**：因为它不支持外部路径加载，这是项目的核心需求

2. **当前方案需要解耦**：将硬编码路径配置化，使其成为通用包

3. **解耦成本低、收益高**：仅涉及 3-4 个硬编码字符串改造，向后兼容

4. **现在是最佳发布时机**：
   - Content Layer API 已稳定（Astro 5.0+）
   - 市场存在空白（无支持外部路径的 loader）
   - 竞争少（仅 astro-loader-obsidian，且设计目标不同）

5. **输出格式完全通用**：遵循 Astro Content Layer API 标准，适用于任何主题
