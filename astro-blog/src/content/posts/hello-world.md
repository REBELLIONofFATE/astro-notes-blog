---
title: 你好，世界
slug: hello-world
date: 2026-01-15
draft: false
---

这是我的第一篇博客文章，欢迎来到我的个人博客！在这里，我将分享关于编程、技术和生活的思考。

## 为什么要写博客

写博客是一种很好的学习方式。通过将知识整理成文字，我们可以：

- 加深对技术概念的理解
- 建立个人知识库
- 与社区分享经验
- 锻炼表达能力

## 技术栈介绍

本博客使用 **Astro** 构建，这是一个现代化的静态站点生成器。以下是一个简单的 Astro 组件示例：

```astro
---
const greeting = "你好，世界！";
---

<h1>{greeting}</h1>
<p>欢迎来到我的博客。</p>
```

Astro 的核心理念是"发送更少的 JavaScript"，非常适合内容驱动的网站。

## 代码高亮示例

下面是一段 TypeScript 代码，展示了文章数据的类型定义：

```typescript
interface Article {
  title: string;
  slug: string;
  date: Date;
  draft: boolean;
}

function filterPublished(articles: Article[]): Article[] {
  return articles.filter(article => !article.draft);
}
```

还有一段 CSS 代码，展示了主题变量的使用：

```css
:root {
  --color-bg: #faf8f5;
  --color-text: #2d2d2d;
  --color-accent: #e07a5f;
}

.card {
  background: var(--color-bg);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
```

## 下一步计划

1. 完善博客的基础功能
2. 添加暗色模式支持
3. 实现 RSS 订阅
4. 优化移动端体验

> 千里之行，始于足下。让我们开始这段旅程吧！

感谢阅读，期待与你在这里相遇。
