---
title: Astro 静态站点生成入门指南
slug: astro-guide
date: 2026-02-10
draft: false
type: featured
---

Astro 是一个专为内容驱动网站设计的 Web 框架。本文将介绍 Astro 的核心概念和基本用法。

## 什么是 Astro

Astro 是一个**全栈 Web 框架**，它的独特之处在于：

- 默认零 JavaScript 输出
- 支持多种 UI 框架（React、Vue、Svelte 等）
- 内置 Markdown 和 MDX 支持
- 基于文件的路由系统

## 项目结构

一个典型的 Astro 项目结构如下：

```
my-blog/
├── src/
│   ├── content/
│   │   └── posts/        # Markdown 文章
│   ├── layouts/
│   │   └── Base.astro    # 布局模板
│   ├── pages/
│   │   └── index.astro   # 页面路由
│   └── components/
│       └── Card.astro    # 可复用组件
├── public/               # 静态资源
└── astro.config.mjs      # 配置文件
```

## Content Collections

Astro 的 Content Collections 是管理内容的强大工具。通过定义 Schema，我们可以确保每篇文章的 Frontmatter 格式正确：

```typescript
import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
```

### 查询文章

获取所有已发布文章并按日期排序：

```typescript
import { getCollection } from 'astro:content';

const posts = await getCollection('posts');
const published = posts
  .filter(post => !post.data.draft)
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
```

## 样式处理

Astro 支持多种样式方案。推荐使用 CSS 自定义属性实现主题系统：

```css
/* 定义主题变量 */
html[data-theme="light"] {
  --bg: #faf8f5;
  --text: #2d2d2d;
}

html[data-theme="dark"] {
  --bg: #1a1a2e;
  --text: #e0e0e0;
}
```

## 部署

Astro 构建产物是纯静态文件，可以部署到任何静态托管服务：

```bash
# 构建项目
npm run build

# 预览构建结果
npm run preview
```

| 托管平台 | 特点 |
|---------|------|
| Vercel | 零配置部署 |
| Netlify | 自动 CI/CD |
| Cloudflare Pages | 全球 CDN |

## 总结

Astro 非常适合构建博客、文档站点等内容驱动的网站。它的"岛屿架构"让我们在需要交互时才加载 JavaScript，保持了出色的性能表现。

> 最好的框架是适合你项目需求的框架。
