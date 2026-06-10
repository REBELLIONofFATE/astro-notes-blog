# Loader 渲染管线标准化改造方案

## 一、背景

当前 loader 使用预渲染模式（在 loader 内部用 marked + Shiki 渲染 HTML），偏离了 Astro Loader 标准模式。

问题表现：
1. **主题耦合**：只有本项目主题能用，无法被其他 Astro 主题集成
2. **能力丧失**：`rendered.metadata.headings` 永远为空数组，TOC 组件失效
3. **生态隔离**：主题侧 `astro.config.mjs` 中配置的 remark/rehype 插件被完全绕开
4. **依赖膨胀**：loader 必须携带 marked、shiki 等渲染依赖

## 二、非标准行为分析

### 2.1 当前架构

```
外部 Vault
  └─ notesLoader.load()
       ├─ 解析 frontmatter
       ├─ 扫描资源 → 复制到 public/
       ├─ marked.parse(body)        ← 预渲染 HTML
       ├─ replaceAssetPaths(html)   ← 路径替换
       └─ store.set({ body, rendered.html })  ← 绕过了 Astro 的 render()
              ↓
       Astro 页面模板
         └─ 直接用 rendered.html  → TOC/metadata 全部失效
```

### 2.2 六项非标准行为

| # | 当前行为 | 标准行为 | 影响 |
|---|---|---|---|
| 1 | Loader 预渲染 HTML | 输出 body，Astro 调用 render() | TOC 组件失效 |
| 2 | Loader 推导 title/slug/category/date | 由 schema 或模板层推导 | 主题无法控制推导逻辑 |
| 3 | 日期三级降级（frontmatter→git→mtime） | frontmatter→文件 mtime | 降低了 loader 纯度 |
| 4 | Loader 内过滤 draft | 模板层 `filter(p => !p.draft)` | 不符合关注分离 |
| 5 | rendered.metadata 全是空值 | 应包含真实 headings/imagePaths | 所有依赖 metadata 的组件失效 |
| 6 | Shiki 主题 hardcode `github-dark` | 通过 `astro.config.mjs` 配置 | 浅色主题站点代码块全黑 |

### 2.3 根因

所有偏离都源于同一个起点：**路径替换必须在渲染完成后的 HTML 中执行**，迫使 loader 自己跑完整条渲染管线。

## 三、改造方案

### 3.1 目标架构

```
外部 Vault
  └─ notesLoader.load()
       ├─ 解析 frontmatter
       ├─ 扫描资源 → 复制到 public/
       ├─ 构建 assetMap → 写入 .astro/asset-map.json   ← 桥接文件
       └─ store.set({ body, data })   ← 只输出原始 Markdown
              ↓
       Astro render()  ← 标准管线
         ├─ remark 插件：读取 asset-map.json → 替换路径
         ├─ Shiki 代码高亮（astro.config.mjs 配置）
         └─ 自动填充 rendered.metadata.headings
              ↓
       最终 HTML（TOC 正常、插件可用、主题可配）
```

### 3.2 核心机制：remark 路径替换插件

新建 `src/utils/remark-asset-paths.ts`，在 Astro 渲染管线中作为 remark 插件运行：

```
remark 插件
   ├─ transform 阶段：遍历 MDAST
   │   ├─ 遇到 image 节点 → 检查 src 是否为相对路径
   │   │   → 读取 asset-map.json → 替换为 /{assetsPrefix}/{relPath}
   │   └─ 遇到 link 节点 → 同上处理 href
   └─ 等效于当前 replaceAssetPaths() 在 HTML 字符串上的替换
```

桥接机制：

```
loader.load() 末尾
  └─ writeFileSync('.astro/asset-map.json', JSON.stringify(assetMap))

remark 插件初始化
  └─ readFileSync('.astro/asset-map.json') → Map<string, AssetInfo>
```

时序安全：loader 的 `load()` 在 Astro 渲染前完成，无竞态问题。

### 3.3 功能迁移对照

| 功能 | 原来位置 | 新位置 | 方式 |
|------|---------|--------|------|
| 路径替换 | Loader `replaceAssetPaths()` | remark 插件 | MDAST 节点替换 |
| 代码高亮 | Loader 手动 Shiki | `astro.config.mjs` 配置 | Astro 内置集成 |
| LANG_ALIAS 别名 | Loader | Shiki 内置 | 标准机制 |
| 锚点 id | Loader `generateId()` | Astro 自动生成 | remark-slug/rehype-slug |
| draft 过滤 | Loader `if (draft) continue` | 模板层 | `filter(p => !p.draft)` |
| title 推导 | Loader `extractTitle()` | schema transform | Zod `.transform()` |
| slug 推导 | Loader `generateSlug()` | schema transform | Zod `.transform()` |
| category 推导 | Loader `deriveCategory()` | schema transform | Zod `.transform()` |
| date 回退 | Loader `dateMap / mtime` | schema transform | Zod `.transform()` |
| 资源扫描复制 | Loader | Loader | 不变 |
| git 日期提取 | Loader | Loader | 不变 |
| buildignore | Loader | Loader | 不变 |

## 四、实施计划

### 4.1 任务拆解

| # | 任务 | 难度 | 预估 | 新增 | 删除 |
|---|---|---|---|---|---|
| 1 | 编写 remark 路径替换插件 | ⭐⭐⭐ | 1-2h | ~60 行 | — |
| 2 | Loader 去掉渲染逻辑 | ⭐ | 20min | — | ~40 行 |
| 3 | Loader 末尾写入 asset-map.json | ⭐ | 10min | ~5 行 | — |
| 4 | `astro.config.mjs` 配置 Shiki | ⭐ | 10min | ~5 行 | — |
| 5 | 元数据推导移到 schema transform | ⭐⭐ | 30min | ~30 行 | ~20 行 |
| 6 | draft 过滤移到模板层 | ⭐ | 5min | — | ~5 行 |
| 7 | 清理 loader 依赖（marked, shiki） | ⭐ | 5min | — | 2 包 |
| 8 | 验证（TOC、高亮、路径、品类页、时间线） | ⭐⭐ | 30min | — | — |

### 4.2 总评估

| 维度 | 值 |
|------|-----|
| 总工作量 | **~3 小时** |
| 新增代码 | ~100 行（remark 插件 + schema transform） |
| 删减代码 | ~70 行（loader 渲染 + 内联推导逻辑） |
| 最大风险点 | remark 插件的路径替换正确性 |
| 核心难点 | 中（MDAST 操作，但语义清晰） |

## 五、风险与边界

### 5.1 确定可实现

- ✅ 路径替换：MDAST 的 image/link 节点替换等价于当前 HTML 字符串替换
- ✅ 代码高亮：Astro 内置 Shiki 集成，自带别名映射和主题配置
- ✅ 锚点 id：Astro 自动生成 heading id，标准行为
- ✅ 元数据推导：Zod schema transform 可完全承载现有逻辑

### 5.2 需要注意

- **多代码块路径替换正确性**：remark 插件按 MDAST 节点逐一处理，比正则替换更安全
- **性能**：去掉 marked/shiki 依赖后 loader 初始化更快，remark 插件在 Astro 渲染阶段零额外开销
- **向后兼容**：接口不变（`content.config.ts` 无需修改），内部行为改变

## 六、收益总结

| 收益 | 说明 |
|------|------|
| 主题可替换 | 任何 Astro 主题均可使用此 loader |
| TOC 可用 | `rendered.metadata.headings` 自动填充 |
| Shiki 可配置 | 通过 `astro.config.mjs` 即可切换主题 |
| remark 生态兼容 | 所有 remark/rehype 插件零成本工作 |
| 依赖精简 | loader 不再依赖 marked、shiki |
| 关注分离 | Loader 只负责数据加载，渲染交给 Astro |
