# Loader 纯数据架构与渲染职责分离方案

## 一、背景

上轮标准化改造（`Loader渲染管线标准化改造方案.md`）将 loader 从预渲染模式改为输出 `body`（raw Markdown），期望通过 Astro 的 `render()` 和 `<Content />` 完成渲染。但**实际验证发现**：`render()` 在无项目内 `filePath` 时无法触发 markdown 处理管线，`<Content />` 渲染为空。

需要重新审视方案，找到既符合 Loader 通用范式、又能实际工作的架构。

## 二、根因分析

### 2.1 验证过程

| 验证项 | 结果 |
|--------|------|
| `note.body` 是否有内容？ | ✅ 7928 字符，数据正确 |
| `render()` 是否抛错？ | ❌ 无错误，返回 Content 组件 |
| `<Content />` 是否输出 HTML？ | ❌ 输出为空 |
| 去掉 remark 插件后是否恢复？ | ❌ 依然为空 |
| `deferredRender: true` 是否有效？ | ❌ 无效 |
| 提供虚拟 `filePath` 是否可行？ | ❌ Astro 验证文件存在性，拒绝 |
| posts（glob loader）是否正常？ | ✅ 正常，因 glob 自动设 filePath |

### 2.2 结论

**Astro Content Layer 的 `render()` 依赖 `filePath` 判断内容类型并触发 markdown 管线。** 外部内容无法提供项目内有效路径，`render()` 不可用。

这是 Astro 架构约束，不是 loader 设计问题。

## 三、数据定位：Markdown 作为结构化数据源

### 3.1 与 CSV/JSON Loader 的等价性

```
CSV loader:
  .csv 文件 → 解析 → store.set({ data: { col1, col2, col3 } })

本 loader:
  .md 文件 → 解析 → store.set({ data: { title, slug, date, body, ... } })
                        ↑
                        body 是一个普通字符串字段
```

本质相同——都是"读取外部文件 → 解析为结构化数据 → 存入 Content Store"。`body` 字段恰好是 markdown 格式的文本，但 loader 不关心这个，它只负责把数据搬进来。

### 3.2 Loaders 光谱中的位置

```
纯 data（CSV/JSON/API）   ← 不关心渲染，不用 render()
    ↑
  【本 loader 在此】      ← 有 md 但无 filePath，走 data 路线
    ↓
标准 content（glob/obsidian） ← body + filePath → render() ✅
```

## 四、改造方案

### 4.1 核心改动：body 移入 data

```
当前（有问题）:
  store.set({
    data: { title, slug, date, category, tags, ... },
    body,   ← 独立参数，但 render() 用不了
  })

改造后:
  store.set({
    data: {
      title, slug, date, category, tags, ...,
      body,        ← 原始 markdown 作为 data 字段
      _filePath,   ← 内部字段：供 remark 插件定位文件
      _vaultRoot,  ← 内部字段：供 remark 插件解析路径
    },
  })
  // 不再传独立 body 参数，不再设 filePath
```

### 4.2 职责分离

```
┌─────────────────────────────────────────────┐
│  Loader（astro-loader-external）             │
│  定位：纯数据 loader，等同于 CSV/JSON loader  │
│                                              │
│  ✅ 读取外部 .md 文件                         │
│  ✅ 解析 frontmatter                          │
│  ✅ 推导元数据（title/slug/date/category）     │
│  ✅ 资产扫描 + 复制到 public/                  │
│  ✅ 写入 asset-map.json（供路径替换使用）       │
│  ✅ store.set({ data })                      │
│                                              │
│  ❌ 不预渲染 HTML                             │
│  ❌ 不依赖 marked/shiki                       │
│  ❌ 不调用 render()                           │
├─────────────────────────────────────────────┤
│  主题（astro.config.mjs + 页面组件）           │
│  定位：自由决定如何渲染                        │
│                                              │
│  ✅ 从 note.data.body 获取原始 markdown        │
│  ✅ 选择渲染引擎（marked / unified / 自定义）   │
│  ✅ 配置代码高亮（Shiki / highlight.js）        │
│  ✅ 配置 remark 插件（路径替换 / slug / ...）   │
│  ✅ 使用 <Content /> 或手动 innerHTML          │
└─────────────────────────────────────────────┘
```

### 4.3 数据流

```
外部 Vault
  └─ notesLoader.load()
       ├─ 解析 frontmatter
       ├─ 扫描资源 → 复制到 public/
       ├─ 构建 assetMap → 写入 .astro/asset-map.json
       └─ store.set({
            data: {
              title, slug, date, category, tags, draft, type,
              body,          ← 原始 markdown
              _filePath,     ← 内部桥接
              _vaultRoot,    ← 内部桥接
            }
          })
              ↓
       .astro/data-store.json  ← Astro 自动持久化
              ↓
       SSR 时加载到内存
              ↓
       页面组件
         ├─ note.data.body  → 主题自行渲染为 HTML
         ├─ 路径替换：通过 remark 插件或手动调用
         └─ 代码高亮：主题自行配置
```

### 4.4 Schema 适配

```typescript
// content.config.ts
const notes = defineCollection({
  loader: notesLoader({ basePath: NOTES_PATH }),
  schema: contentSchema.extend({
    type: contentSchema.shape.type.default('note'),
    rawTitle: z.string().optional(),
    body: z.string().optional(),  // ← 新增：raw markdown 正文
  }).passthrough(),  // _filePath, _vaultRoot 等内部字段透传
});
```

### 4.5 页面组件改造

```astro
---
// [slug].astro
const { note } = Astro.props;
// 不再使用 render() 和 <Content />
// 主题自行选择渲染方式：
//   - marked / unified / remark-rehype 管线
//   - 或自行拼接 frontmatter 后调用 Astro markdown 处理
---

<BaseLayout>
  <article class="prose">
    <!-- 元数据展示（不变） -->
    <header>...</header>

    <!-- 正文：由主题决定渲染方式 -->
    <div class="prose-content">
      <!-- 方案 A: 用 marked 渲染 -->
      <Fragment set:html={marked.parse(note.data.body ?? '')} />

      <!-- 方案 B: 用 unified + remark 插件 -->
      <!-- 方案 C: 自行拼接完整 md 后调用 Astro render() -->
    </div>
  </article>
</BaseLayout>
```

## 五、现有资产管线影响评估

| 组件 | 影响 | 说明 |
|------|:--:|------|
| remark 路径替换插件 | ⚠️ 不再自动运行 | 需在页面组件中手动调用管线时引入 |
| asset-map.json 桥接 | ✅ 不变 | loader 继续写入，主题按需读取 |
| TOC 提取 | ⚠️ 改为手动 | 从 `note.data.body` 提取 headings |
| 代码高亮 | ✅ 解除耦合 | 主题自由选择 Shiki / highlight.js |
| 资产扫描复制 | ✅ 不变 | 纯 loader 职责 |

## 六、实施计划

### 6.1 任务拆解

| # | 任务 | 难度 | 预估 | 涉及文件 |
|---|------|:--:|------|------|
| 1 | `body` 从独立参数移入 `data` | ⭐ | 10min | `loader.ts` |
| 2 | Schema 新增 `body` 字段 | ⭐ | 5min | `content.config.ts`, `frontmatter-schema.ts` |
| 3 | 页面组件移除 `render()`，改为手动渲染 | ⭐⭐ | 30min | `pages/notes/[slug].astro` |
| 4 | TOC 提取适配 `note.data.body` | ⭐ | 10min | `pages/notes/[slug].astro` |
| 5 | 路径替换逻辑迁移到页面组件 | ⭐⭐ | 20min | `pages/notes/[slug].astro` 或工具函数 |
| 6 | 清理 `asset-copier.ts` 中 `replaceAssetPaths()` 残留 | ⭐ | 5min | `asset-copier.ts`, `index.ts` |
| 7 | 验证（内容渲染、路径替换、TOC、高亮） | ⭐⭐ | 30min | — |

### 6.2 总评估

| 维度 | 值 |
|------|-----|
| 总工作量 | **~2 小时** |
| 新增代码 | ~40 行（页面组件渲染逻辑） |
| 删减代码 | ~15 行（移除 render() 调用、依赖声明） |
| 最大风险点 | 页面组件渲染正确性 |
| 核心难点 | 低（标准字符串处理 + markdown 解析） |

## 七、主题兼容性分析

### 7.1 主流 Astro 主题的渲染模式

几乎所有 Astro 内容主题都使用 `render()` + `<Content />` 的渲染链路：

| 主题 | 渲染方式 | 纯 data 兼容？ |
|------|----------|:--:|
| **Fuwari** (⭐6.4k) | `entry.render()` + `<Content />` | ❌ |
| **astro-paper** (⭐3.9k) | `entry.render()` + `<Content />` | ❌ |
| **astro-theme-spaceship** | `entry.render()` + `<Content />` | ❌ |
| **Starlight**（文档主题） | `entry.render()` + `<Content />` | ❌ |
| 几乎所有 Astro 内容主题 | `entry.render()` + `<Content />` | ❌ |

### 7.2 Fuwari 案例分析

Fuwari 的帖子页模板核心链路：

```astro
// src/pages/posts/[...slug].astro
const { entry } = Astro.props;
const { Content, headings } = await entry.render();  // ← 依赖 render()
---
<Markdown>
  <Content />   // ← 渲染正文
</Markdown>
// headings → TOC
```

**每一步都离不开 `render()`**，纯 data 方案无法零改动集成。

### 7.3 路径替换职责归属

纯 data 方案要求主题配置 remark 路径替换插件，但主题不应关心 loader 的内部逻辑：

| | remark 插件方案 | loader 内替换方案 |
|---|---|---|
| 路径替换位置 | Astro 渲染阶段 | loader 写文件前 |
| 主题需要配置？ | ✅ 需要 | ❌ 零配置 |
| Fuwari 集成 | ❌ 需改主题 | ✅ 零改动 |
| 职责边界 | 模糊（泄露到主题） | 清晰（loader 全权负责） |

**结论**: 路径替换是 loader 的领域知识，应在 loader 内完成，不应泄露给主题。

## 八、与临时 .md 方案对比

### 8.1 纯 data 方案

```
loader → store.set({ data: { body, ... } })  →  data-store.json
                                                      ↓
                                              页面组件手动渲染
                                              ❌ render() 不可用
                                              ❌ 主题需要改造
```

### 8.2 临时 .md 方案（推荐）

```
loader:
  1. 读取外部 .md
  2. 解析 frontmatter
  3. 资产扫描 + 复制到 public/
  4. 替换路径：./images/x.png → /notes-assets/cat/images/x.png
  5. 写入 src/content/.notes-sync/{slug}.md
  6. store.set({ filePath, data })
              ↓
  Astro render() → 标准管线
    ├─ Markdown → HTML
    ├─ Shiki 代码高亮
    └─ headings / TOC
              ↓
  Fuwari 等主题零改动集成 ✅
```

### 8.3 对比总结

| 维度 | 纯 data 方案 | 临时 .md 方案 |
|------|:--:|:--:|
| `render()` + `<Content />` 兼容 | ❌ | ✅ |
| Fuwari 零改动集成 | ❌ | ✅ |
| 路径替换零配置 | ❌（需 remark 插件） | ✅（loader 内完成） |
| TOC 自动生成 | ❌（手动提取） | ✅（rendered.metadata） |
| 代码高亮 | 手动 | Shiki 自动 |
| Loader 复杂度 | 低 | 中（写入 + 清理） |
| 主题自由度 | 高（任意渲染引擎） | 中（绑定 Astro markdown 管线） |
| IO 开销 | 零 | 164 次 writeFile |

## 九、最终结论

**推荐采用临时 .md 方案。** 理由：

1. **主题兼容性是第一优先级**——纯 data 方案会导致所有主流 Astro 主题（Fuwari、astro-paper 等）无法集成
2. **路径替换职责属于 loader**——不应让主题配置 remark 插件来理解 loader 的内部逻辑
3. **IO 开销可接受**——164 次 writeFile（每次 <10KB）在 dev 启动时完成，不影响热更新性能
4. **`.notes-sync/` 目录可 .gitignore**——无版本控制污染

纯 data 方案在范式上更纯粹，但在 Astro 生态的实际约束下，牺牲 `render()` 的代价过高。

## 十、TODO

- [ ] 实施临时 .md 方案（路径预替换 + 写入 + store.set(filePath)）
- [ ] 移除 remark 路径替换插件（路径替换回归 loader）
- [ ] 从 `.astro/data-store.json` 中移除 `body` 字段以减少文件体积
- [ ] 验证 Fuwari 主题集成可行性
- [ ] 更新 `astro-loader-external/README` 说明临时 .md 同步机制
