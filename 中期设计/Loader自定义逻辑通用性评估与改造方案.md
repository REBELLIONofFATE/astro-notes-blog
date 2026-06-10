# Loader 自定义逻辑通用性评估与改造方案

## 一、背景

当前的 `loader.ts`（300+ 行）在"个人使用"层面表现优秀——零配置、开箱即用。但如果要作为独立 npm 包发布（`astro-loader-external`），存在大量硬编码约定，违反"只做 IO，不替用户做决定"的工具包设计原则。

## 二、现有问题：loader.ts 中的非标准逻辑

| # | 逻辑 | 位置 | 问题 |
|---|---|---|---|
| 1 | **slug 生成**（`redis/xx.md` → `redis-xx`） | `generateSlug()` L259-264 | 把目录层级压平拼进 slug，其他人可能只需要文件名 |
| 2 | **category 推导**（目录路径 → category） | `deriveCategory()` L271-275 | 不是所有人都按目录组织分类 |
| 3 | **date 推导**（frontmatter → git log → mtime） | L93-L96 + `buildDateMap()` L284-309 | 优雅的三级降级，但不是所有人都想跑 `git log` |
| 4 | **title 推导**（frontmatter → h1 → 文件名） | L86-L89 + `extractTitle()` | 优先级链合理，但不可关闭 |
| 5 | **draft 过滤** | L104-L109 | 应该交给 Astro schema 层（`getCollection` 时过滤），loader 只管入库 |
| 6 | **资产扫描/复制** | `asset-copier.ts` L56-L108 | ✅ 核心价值，是这个 loader 区别于 `glob()` 的卖点 |
| 7 | **asset-map.json 桥接** | L62-L71 | ✅ 必要桥接，remark 插件依赖它 |
| 8 | `_filePath` / `_vaultRoot` 注入 | L125-L127 | ✅ 必要桥接，但字段名 `_` 前缀暗示这是内部实现细节 |

## 三、逐项评估

### 3.1 slug 生成（❌ 高风险）

```
当前：redis/springboot整合redis.md → redis-springboot整合redis
问题：目录层级被压平拼入 slug，无法关闭
风险：其他用户可能用 Obsidian wikilink 的 [[xxx]] 格式引用文件，slug 不匹配会导致链接断裂
方案：默认行为可选，允许通过回调覆盖
```

### 3.2 category 推导（❌ 高风险）

```
当前：redis/springboot整合redis.md → category = redis
问题：按目录推导 category，但其他项目可能用 YAML tags 或 frontmatter 字段
风险：与用户自己的分类体系冲突，且无法关闭
方案：提供开关或回调，默认关闭（让用户通过 schema transform 自行处理）
```

### 3.3 date 推导（⚠️ 中等风险）

```
当前：frontmatter.date → git log --follow 首次提交 → mtime
问题：git log --follow 对 264 个文件跑 264 次，大型仓库可能很慢
风险：git 不可用时 fallback 到 mtime，但逻辑不可关闭
方案：保持三级降级，但增加 enabled 开关
```

### 3.4 title 推导（⚠️ 低风险）

```
当前：frontmatter.title → 正文第一个 # 标题 → 文件名
问题：优先级链合理，但不可关闭
方案：保持默认行为，可通过回调覆盖
```

### 3.5 draft 过滤（❌ 高风险）

```
当前：loader 内部 `if (draft) continue`，不入库
问题：破坏关注分离。Loader 应该只管"读取并入库"，过滤交给 schema/模板层
正确做法：
  - Loader：draft 数据照常入库
  - Schema/模板：const publishedNotes = await getCollection('notes', ({ data }) => !data.draft)
```

### 3.6 资产管线（✅ 无风险）

```
扫描 + 复制 + bridge 文件 = 这个 loader 的核心差异化能力
保持不变
```

### 3.7 内部字段（✅ 已解决）

```
_filePath / _vaultRoot 的必要性已经通过 remark 插件验证
_passthrough() 在 schema 中正确处理
字段名以 _ 开头，暗示"内部使用"
```

## 四、现有改造方案的覆盖情况

`Loader渲染管线标准化改造方案.md` 中已规划但尚未实施的项目：

| 任务 | 状态 | 说明 |
|------|:--:|------|
| title 推导 → schema transform | 🔲 未实施 | Zod `.transform()` |
| slug 推导 → schema transform | 🔲 未实施 | Zod `.transform()` |
| category 推导 → schema transform | 🔲 未实施 | Zod `.transform()` |
| date 回退 → schema transform | 🔲 未实施 | Zod `.transform()` |
| draft 过滤 → 模板层 | 🔲 未实施 | `filter(p => !p.draft)` |
| remark 路径替换插件 | ✅ 已完成 | `remark-asset-paths.ts` |
| Loader 去掉预渲染 | ✅ 已完成 | 输出 body 而非 rendered.html |
| Shiki → `astro.config.mjs` | ✅ 已完成 | 标准集成 |

## 五、补充改造建议（通用性增强）

### 5.1 增加可配置开关

```typescript
// types.ts 新增字段
export interface NotesLoaderOptions {
  basePath?: string;
  excludeDirs?: string[];
  routePrefix?: string;
  assetsPrefix?: string;

  // === 新增：约定层开关 ===
  /** slug 生成函数，默认压平路径；传 null 关闭则使用文件名 */
  generateSlug?: ((relPath: string) => string) | null;
  /** category 推导函数，默认取目录名；传 null 关闭 */
  deriveCategory?: ((relPath: string) => string) | null;
  /** 日期提取开关，默认 true（三级降级） */
  deriveDate?: boolean;
  /** 是否在 loader 内过滤 draft，默认 false（交给 schema） */
  filterDraft?: boolean;
}
```

### 5.2 schema transform 迁移（长期目标）

```typescript
// content.config.ts
const notes = defineCollection({
  loader: notesLoader({ basePath: NOTES_PATH, filterDraft: false }), // loader 不过滤
  schema: contentSchema
    .extend({
      type: contentSchema.shape.type.default('note'),
      rawTitle: z.string().optional(),
    })
    .transform(({ title, slug, date, category, draft, ...rest }) => ({
      ...rest,
      title: title ?? extractTitleFromBody(rest.body) ?? 'Untitled',
      slug: slug ?? generateSlug(rest._filePath),
      date: date ?? deriveDate(rest._filePath),
      category: category ?? deriveCategory(rest._filePath),
      draft: draft ?? false,
    })),
});
```

> 注意：schema transform 接收的是 loader 输出的 data，此时 `body` 可能不可用（取决于 Astro 版本）。目前将推导逻辑保留在 loader 中是务实选择。

## 六、TODO

- [ ] **P1** draft 过滤移到模板层（改动最小，收益最大）
- [ ] **P2** `NotesLoaderOptions` 增加 `generateSlug`、`deriveCategory`、`filterDraft` 开关
- [ ] **P3** date/deriveDate 增加 `enabled` 开关
- [ ] **P4** 评估 schema transform 可行性（依赖 Astro 版本是否支持 body 传递到 transform）
- [ ] **P4** 清理 `asset-copier.ts` 中的 `replaceAssetPaths()` 残留函数
