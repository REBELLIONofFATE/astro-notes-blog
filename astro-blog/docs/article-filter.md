# 文章构建控制

笔记仓库中的文章并非全部需要发布到博客，本系统提供两层过滤机制控制构建范围。

## 目录级过滤：.buildignore

在笔记仓库的**根目录**（`NOTES_PATH` 对应目录）下放置一个 `.buildignore` 文件，写入匹配规则来控制哪些文件不参与构建。

### 匹配规则

一行一条规则，支持三种格式：

| 格式 | 示例 | 说明 |
|------|------|------|
| 目录名 + `/` | `面试题/` | 排除该目录及所有子目录下的文章和资源 |
| glob 通配符 | `draft-*`、`*.private.md` | 通配符 `*` 匹配任意非 `/` 字符 |
| 精确文件名 | `README.md` | 排除任意目录下匹配该名称的文件 |

以 `#` 开头的行为注释，空行会被忽略。

> `.buildignore` 文件**仅在根目录生效**，不会递归扫描子目录中的同名文件。

### 示例

```
# .buildignore（放在笔记仓库根目录）
面试题/              # 排除 面试题/ 整棵目录树
draft-*              # 排除所有 draft- 开头的文件
*.private.md         # 排除所有 .private.md 后缀的文件
```

```
笔记仓库/
├── .buildignore             ← 放在根目录，这是唯一生效的位置
├── Java/                    ← 正常构建
├── 面试题/                  ← 被排除（匹配 面试题/）
│   ├── 2023/
│   │   └── 晨考题.md
│   └── 面试总结.md
├── draft-outline.md         ← 被排除（匹配 draft-*）
├── 算法/                    ← 正常构建
```

### 创建方式

```powershell
# Windows PowerShell
New-Item D:\path\to\notes\.buildignore

# macOS / Linux
touch /path/to/notes/.buildignore
```

创建后编辑该文件，按需写入匹配规则。

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
