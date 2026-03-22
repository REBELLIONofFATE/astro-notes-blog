# 实施计划：Astro 静态博客（阶段 1）

## 概述

基于 Astro SSG 构建静态博客系统，使用 Markdown + Frontmatter 管理内容，原生 JS 实现客户端交互，Vitest + fast-check 进行测试。任务按依赖关系排序，确保每一步都在前一步基础上递增构建。

## Tasks

- [x] 1. 初始化项目结构与基础配置
  - [x] 1.1 创建 Astro 项目并安装依赖
    - 初始化 Astro 项目（`npm create astro@latest`）
    - 安装依赖：`@astrojs/sitemap`、`@astrojs/rss`、`vitest`、`fast-check`
    - 配置 `astro.config.mjs`，集成 sitemap
    - 配置 `tsconfig.json`
    - 配置 `vitest.config.ts`
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 1.2 创建全局样式与主题变量
    - 创建 `src/styles/global.css`
    - 定义 CSS 自定义属性（亮色/暗色模式变量）
    - 实现温暖色调、圆角、柔和阴影的基础样式
    - 实现响应式布局基础断点
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.3 定义 Content Collections Schema
    - 创建 `src/content/config.ts`
    - 使用 Zod 定义 posts 集合的 Frontmatter schema（title、slug、date、draft）
    - _Requirements: 1.1, 1.2_

  - [x] 1.4 创建示例 Markdown 文章
    - 在 `src/content/posts/` 下创建至少 2 篇示例文章（含不同日期）
    - 创建 1 篇草稿文章（`draft: true`）用于验证过滤逻辑
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. 实现布局与公共组件
  - [x] 2.1 实现 BaseLayout.astro
    - 创建 `src/layouts/BaseLayout.astro`
    - 接收 `title` 和 `description` props
    - 渲染完整 HTML 结构（html、head、body）
    - 注入 SEO 元标签（title、meta description、Open Graph）
    - 注入 RSS 自动发现标签 `<link rel="alternate" type="application/rss+xml">`
    - 在 `<head>` 中内联主题初始化脚本（防止 FOUC）
    - 加载全局样式
    - 包含 Navbar 和 Footer 组件
    - _Requirements: 8.1, 8.2, 8.3, 9.3_

  - [x] 2.2 实现 Navbar.astro
    - 创建 `src/components/Navbar.astro`
    - 渲染站名（链接到首页 `/`）
    - 包含 ThemeToggle 组件
    - 包含 RSS 图标链接
    - 固定在页面顶部
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.3 实现 ThemeToggle.astro
    - 创建 `src/components/ThemeToggle.astro`
    - 渲染太阳/月亮切换按钮
    - 内联 `<script>` 处理点击事件
    - 读写 localStorage 存储主题偏好（try-catch 容错）
    - 切换 `<html>` 的 `data-theme` 属性
    - 首次访问时检测 `prefers-color-scheme` 系统偏好
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.4 实现 Footer.astro
    - 创建 `src/components/Footer.astro`
    - 渲染版权信息（含动态年份）
    - 渲染社交媒体图标链接（GitHub 等）
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 2.5 实现 ArticleCard.astro
    - 创建 `src/components/ArticleCard.astro`
    - 接收 `title`、`date`、`slug`、`excerpt` props
    - 渲染卡片容器（圆角、阴影）
    - 展示标题、格式化日期、摘要
    - 渲染"阅读更多"链接指向 `/posts/{slug}`
    - _Requirements: 2.2, 2.4, 6.2, 6.3_

- [x] 3. 实现页面路由与数据获取
  - [x] 3.1 实现首页 index.astro（文章列表页）
    - 创建 `src/pages/index.astro`
    - 使用 `getCollection('posts')` 获取所有文章
    - 过滤 `draft !== true` 的文章
    - 按 `date` 降序排序
    - 实现摘要提取逻辑（从 Markdown body 提取前 120 字符纯文本）
    - 遍历渲染 ArticleCard 组件
    - 使用 BaseLayout 包裹
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.5_

  - [x] 3.2 实现文章详情页 [slug].astro
    - 创建 `src/pages/posts/[slug].astro`
    - `getStaticPaths()` 返回所有非草稿文章的 slug
    - 渲染文章标题和格式化日期
    - 渲染 `<Content />` 组件
    - 应用 prose 排版样式（行间距、段落间距、最大宽度）
    - 代码块语法高亮（Astro 内置 Shiki）
    - 使用 BaseLayout 包裹（传入文章标题和描述）
    - _Requirements: 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.3 实现 RSS Feed 端点
    - 创建 `src/pages/rss.xml.ts`
    - 使用 `@astrojs/rss` 生成 RSS feed
    - 包含所有非草稿文章的标题、链接、日期、摘要
    - _Requirements: 9.1, 9.2_

- [x] 4. 检查点 - 核心功能验证
  - 确保项目可成功构建（`npm run build`）
  - 确保 dist 目录包含首页、文章详情页、rss.xml、sitemap.xml
  - 确保草稿文章未出现在构建产物中
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. 提取工具函数并编写测试
  - [x] 5.1 提取可测试的工具函数
    - 创建 `src/utils/frontmatter.ts`：Frontmatter 解析/序列化辅助函数
    - 创建 `src/utils/posts.ts`：文章过滤（草稿排除）、排序（日期降序）、摘要提取函数
    - 创建 `src/utils/theme.ts`：主题切换逻辑（toggle、读写 localStorage）
    - 创建 `src/utils/seo.ts`：SEO 元标签生成函数
    - 创建 `src/utils/rss.ts`：RSS 条目生成辅助函数
    - 创建 `src/utils/sitemap.ts`：Sitemap URL 生成辅助函数
    - _Requirements: 1.2, 1.3, 2.3, 5.2, 5.3, 8.2, 8.3, 9.2, 8.4_

  - [x] 5.2 将页面和组件中的逻辑替换为工具函数调用
    - 更新 `index.astro` 使用 `posts.ts` 中的过滤和排序函数
    - 更新 `[slug].astro` 使用 slug 路由生成函数
    - 更新 `ThemeToggle.astro` 使用 `theme.ts` 中的逻辑
    - 更新 `BaseLayout.astro` 使用 `seo.ts` 中的元标签生成函数
    - 更新 `rss.xml.ts` 使用 `rss.ts` 中的辅助函数
    - _Requirements: 1.3, 2.3, 5.2, 8.2, 9.2_

  - [ ]* 5.3 编写属性测试：Frontmatter 解析往返
    - **Property 1: Frontmatter 解析往返**
    - 使用 fast-check 生成随机 title、slug、date、draft 值
    - 验证序列化为 YAML 后再解析回来与原始对象等价
    - **Validates: Requirements 1.2**

  - [ ]* 5.4 编写属性测试：草稿文章过滤
    - **Property 2: 草稿文章过滤**
    - 使用 fast-check 生成随机文章集合（混合 draft 状态）
    - 验证过滤后仅包含 `draft !== true` 的文章，且无遗漏
    - **Validates: Requirements 1.3, 2.1**

  - [ ]* 5.5 编写属性测试：文章按日期降序排列
    - **Property 4: 文章按日期降序排列**
    - 使用 fast-check 生成随机日期列表
    - 验证排序后每篇文章日期 >= 后一篇文章日期
    - **Validates: Requirements 2.3**

  - [ ]* 5.6 编写属性测试：文章卡片包含必要信息
    - **Property 3: 文章卡片包含必要信息**
    - 使用 fast-check 生成随机文章元数据
    - 验证渲染后的卡片 HTML 包含标题、日期、摘要和正确链接
    - **Validates: Requirements 2.2, 2.4**

  - [ ]* 5.7 编写属性测试：Slug 决定 URL 路径
    - **Property 5: Slug 决定 URL 路径**
    - 使用 fast-check 生成随机合法 slug 字符串
    - 验证生成的 URL 路径为 `/posts/{slug}`
    - **Validates: Requirements 3.3, 2.4**

  - [ ]* 5.8 编写属性测试：主题切换为对合操作
    - **Property 6: 主题切换为对合操作**
    - 验证对任意初始主题，切换两次后恢复原状
    - **Validates: Requirements 5.2**

  - [ ]* 5.9 编写属性测试：主题偏好持久化往返
    - **Property 7: 主题偏好持久化往返**
    - 模拟 localStorage，验证存储后读取一致
    - **Validates: Requirements 5.3, 5.4**

  - [ ]* 5.10 编写属性测试：SEO 元标签完整性
    - **Property 8: SEO 元标签完整性**
    - 使用 fast-check 生成随机 title 和 description
    - 验证生成的 HTML head 包含 title、meta description、OG 标签
    - **Validates: Requirements 8.2, 8.3**

  - [ ]* 5.11 编写属性测试：Sitemap 包含所有已发布页面
    - **Property 9: Sitemap 包含所有已发布页面**
    - 使用 fast-check 生成随机文章集合
    - 验证 sitemap 包含所有已发布文章 URL，不包含草稿
    - **Validates: Requirements 8.4**

  - [ ]* 5.12 编写属性测试：RSS Feed 包含所有已发布文章
    - **Property 10: RSS Feed 包含所有已发布文章**
    - 使用 fast-check 生成随机文章集合
    - 验证 RSS 条目包含标题、链接、日期、摘要，数量正确
    - **Validates: Requirements 9.2**

  - [ ]* 5.13 编写单元测试
    - 测试 Frontmatter 解析的具体示例和边界情况（空标题、特殊字符 slug、无效日期）
    - 测试空文章列表的过滤和排序
    - 测试摘要提取（含 Markdown 标记的文本、极短文本、空文本）
    - 测试主题切换 localStorage 不可用时的降级行为
    - _Requirements: 1.2, 1.3, 2.3, 5.2, 5.3_

- [x] 6. 最终检查点 - 全面验证
  - 确保所有测试通过（`npx vitest --run`）
  - 确保构建成功且产物完整
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点任务确保增量验证，及时发现问题
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 工具函数提取到独立模块后，既方便页面/组件复用，也方便独立测试
