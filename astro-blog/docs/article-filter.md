# 文章构建控制

笔记仓库中的文章并非全部需要发布到博客，本系统提供两层过滤机制控制构建范围。

## 目录级过滤：.buildignore

在笔记仓库的任意目录下放置一个空文件 `.buildignore`，该目录及其所有子目录下的 `.md` 文件都不会被构建。

### 用法

```
笔记仓库/
├── Java/                  ← 正常构建
├── 面试题/                ← 跳过整棵树
│   └── .buildignore       ← 放一个空文件
│   ├── 2023/
│   │   └── 晨考题.md
│   └── 面试总结.md
├── 算法/                  ← 构建
```

### 创建方式

```powershell
# Windows PowerShell
New-Item D:\MyProject\my-note\myNote\面试题\.buildignore

# macOS / Linux
touch /path/to/notes/面试题/.buildignore
```

> 文件内容为空即可，不需要写任何配置。

## 文件级过滤：draft 标记

在 Markdown 文件的 frontmatter 中设置 `draft: true`，该单篇文章跳过构建。

```yaml
---
title: 未完成的文章
slug: draft-post
date: 2026-06-03
draft: true     # ← 设为 true，跳过构建
---
```

### 效果对比

| 过滤方式 | 范围 | 优先级 |
|---------|------|--------|
| `.buildignore` | 整个目录（含子目录） | 高，遍历目录时就跳过 |
| `draft: true` | 单篇文章 | 低，仅在解析 frontmatter 时跳过 |

两种方式可同时使用，互不冲突。

## 验证

构建日志中会显示过滤结果：

```
notes-loader: 发现 162 篇笔记（路径：D:/MyProject/my-note/myNote）
notes-loader: 加载完成，成功 162 篇，跳过 0 篇
```

`发现` 的数量 = 扫描到的总文件数（已剔除 `.buildignore` 目录下的文件）
`成功` 的数量 = 最终入库的文章数（已剔除 `draft: true` 的文件）
