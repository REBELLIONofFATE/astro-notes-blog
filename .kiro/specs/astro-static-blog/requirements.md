# 需求文档

## 简介

本文档定义个人内容系统阶段 1（内容最小闭环）的需求。目标是使用 Astro SSG 构建一个静态博客，实现文章的稳定发布与阅读。设计风格参考 joshwcomeau.com，强调温暖色调、圆角设计、柔和阴影与舒适的阅读体验。当前阶段不包含标签、分类、评论、搜索、数据库或后端功能。

## 术语表

- **Blog_System**：基于 Astro SSG 构建的静态博客系统，负责将 Markdown 内容构建为可访问的 HTML 页面
- **Article_List_Page**：文章列表页面（即首页），以卡片形式展示所有已发布文章的摘要信息
- **Article_Detail_Page**：文章详情页面，展示单篇文章的完整 Markdown 渲染内容
- **Navigation_Bar**：页面顶部导航栏，包含站名/Logo、暗色模式切换按钮和 RSS 链接
- **Theme_Switcher**：暗色/亮色模式切换组件，允许用户在两种主题间切换
- **Footer**：页面底部区域，展示站点信息和社交链接
- **Frontmatter**：Markdown 文件头部的 YAML 元数据块，声明文章的标题、slug、日期和草稿状态
- **Content_Directory**：存放 Markdown 文章文件的目录，路径为 `content/posts/`
- **Code_Block**：文章中的代码片段区域，需要语法高亮显示
- **RSS_Feed**：RSS 订阅源文件，允许读者通过 RSS 阅读器订阅博客内容

## 需求

### 需求 1：Markdown 内容管理

**用户故事：** 作为博客作者，我希望使用 Markdown + Frontmatter 编写文章，以便内容管理简单且可追溯。

#### 验收标准

1. THE Blog_System SHALL 从 `content/posts/` 目录读取所有 Markdown 文件作为文章来源
2. THE Blog_System SHALL 解析每篇文章的 Frontmatter，提取 `title`、`slug`、`date`、`draft` 四个字段
3. WHEN Frontmatter 中 `draft` 字段值为 `true` 时，THE Blog_System SHALL 在构建产物中排除该文章
4. WHEN 新增一篇 Markdown 文件并执行构建后，THE Blog_System SHALL 生成对应的文章页面
5. WHEN 删除一篇 Markdown 文件并执行构建后，THE Blog_System SHALL 移除对应的文章页面

### 需求 2：文章列表页（首页）

**用户故事：** 作为读者，我希望在首页看到所有已发布文章的列表，以便快速浏览和选择感兴趣的内容。

#### 验收标准

1. THE Article_List_Page SHALL 以卡片形式展示所有已发布（非草稿）文章
2. THE Article_List_Page SHALL 在每张文章卡片中展示文章标题、发布日期、摘要文本和"阅读更多"链接
3. THE Article_List_Page SHALL 按发布日期降序排列文章卡片（最新文章在前）
4. WHEN 用户点击文章卡片或"阅读更多"链接时，THE Article_List_Page SHALL 导航至对应的 Article_Detail_Page
5. THE Article_List_Page SHALL 作为博客的首页（根路径 `/`）提供访问

### 需求 3：文章详情页

**用户故事：** 作为读者，我希望在文章详情页阅读完整的文章内容，并获得舒适的阅读体验。

#### 验收标准

1. THE Article_Detail_Page SHALL 渲染 Markdown 文件的完整内容为 HTML
2. THE Article_Detail_Page SHALL 在页面顶部展示文章标题和发布日期
3. THE Article_Detail_Page SHALL 使用 `slug` 字段值作为页面 URL 路径（格式：`/posts/{slug}`）
4. THE Article_Detail_Page SHALL 设置舒适的排版样式，包括合理的行间距、段落间距和最大内容宽度
5. WHEN 文章内容包含代码块时，THE Article_Detail_Page SHALL 对代码块应用语法高亮显示

### 需求 4：导航栏

**用户故事：** 作为读者，我希望页面顶部有一个导航栏，以便快速访问站点核心功能。

#### 验收标准

1. THE Navigation_Bar SHALL 在所有页面顶部固定显示
2. THE Navigation_Bar SHALL 包含站名或 Logo，点击后导航至首页
3. THE Navigation_Bar SHALL 包含 Theme_Switcher 组件
4. THE Navigation_Bar SHALL 包含 RSS 订阅链接图标

### 需求 5：暗色/亮色模式切换

**用户故事：** 作为读者，我希望能在暗色和亮色模式之间切换，以便在不同环境下获得舒适的阅读体验。

#### 验收标准

1. THE Theme_Switcher SHALL 提供一个可点击的切换按钮，在暗色模式和亮色模式之间切换
2. WHEN 用户点击 Theme_Switcher 时，THE Blog_System SHALL 立即切换页面的整体配色方案
3. THE Blog_System SHALL 将用户的主题偏好存储在浏览器 localStorage 中
4. WHEN 用户再次访问博客时，THE Blog_System SHALL 恢复用户上次选择的主题偏好
5. WHEN 用户未曾设置主题偏好时，THE Blog_System SHALL 使用浏览器系统的配色偏好作为默认主题

### 需求 6：视觉设计风格

**用户故事：** 作为读者，我希望博客界面美观现代，以便获得愉悦的浏览体验。

#### 验收标准

1. THE Blog_System SHALL 使用温暖色调作为整体配色基础
2. THE Blog_System SHALL 对卡片、按钮等 UI 元素应用圆角设计
3. THE Blog_System SHALL 对卡片等浮动元素应用柔和阴影效果
4. THE Blog_System SHALL 在暗色模式和亮色模式下分别提供协调一致的配色方案
5. THE Blog_System SHALL 实现响应式布局，在桌面端和移动端均提供良好的浏览体验

### 需求 7：页脚

**用户故事：** 作为读者，我希望页面底部有页脚信息，以便了解站点信息和找到社交链接。

#### 验收标准

1. THE Footer SHALL 在所有页面底部显示
2. THE Footer SHALL 展示站点版权信息
3. THE Footer SHALL 包含社交媒体链接（以图标形式展示）

### 需求 8：SEO 优化

**用户故事：** 作为博客作者，我希望博客对搜索引擎友好，以便文章能被搜索引擎正确索引。

#### 验收标准

1. THE Blog_System SHALL 为每个页面生成语义化的 HTML 结构
2. THE Blog_System SHALL 为每个页面设置合适的 `<title>` 和 `<meta description>` 标签
3. THE Blog_System SHALL 为文章详情页生成 Open Graph 元标签（og:title、og:description、og:type）
4. THE Blog_System SHALL 生成 `sitemap.xml` 文件，包含所有已发布页面的 URL

### 需求 9：RSS 订阅

**用户故事：** 作为读者，我希望通过 RSS 订阅博客更新，以便在 RSS 阅读器中获取新文章通知。

#### 验收标准

1. THE Blog_System SHALL 在构建时生成符合 RSS 2.0 或 Atom 规范的 RSS_Feed 文件
2. THE RSS_Feed SHALL 包含每篇已发布文章的标题、链接、发布日期和摘要
3. THE Blog_System SHALL 在 HTML `<head>` 中包含 RSS 自动发现标签

### 需求 10：构建与部署

**用户故事：** 作为博客作者，我希望通过简单的命令完成构建和部署，以便快速发布内容。

#### 验收标准

1. THE Blog_System SHALL 通过单条命令（`npm run build` 或等效命令）完成全站静态构建
2. THE Blog_System SHALL 将构建产物输出到独立的目录中，可直接部署到任意静态托管服务
3. THE Blog_System SHALL 在构建过程中不依赖任何外部 API 或数据库
