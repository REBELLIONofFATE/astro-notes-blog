# Frontmatter 初始化指南

## 概述

`scripts/init-frontmatter.mjs` 为笔记仓库中所有 `.md` 文件自动补全 frontmatter 元数据字段。

| 字段 | 来源 | 说明 |
|------|------|------|
| `date` | `git log --follow --diff-filter=A` | 首次提交日期；降级为文件 `mtime` |
| `title` | Markdown 第一个 `# 标题` | 无标题则不写入 |
| `category` | 文件路径推导 | 如 `java/HashMap原理.md` → `java` |

## 使用方式

```bash
# 预览模式（不写入文件）
npm run init -- --dry-run

# 正式执行
npm run init

# 指定笔记路径（覆盖 .env 配置）
NOTES_PATH=/other/path node scripts/init-frontmatter.mjs
```

## 修改边界

**仅修改 frontmatter 区域**（`---` 之间的内容），严格遵守以下规则：

- ✅ 仅补充**缺失**的字段（`date`、`title`、`category`）
- ✅ 已有字段**绝不覆盖**
- ✅ Markdown 正文**完全不动**
- ✅ 尊重 `.buildignore` 规则，与 `notes-loader` 行为一致

## 适用场景

| 场景 | 说明 |
|------|------|
| 首次使用 | `git clone` → `npm install` → `npm run init` 一次性补全 |
| 新增笔记 | 写完后重新跑 `npm run init`，仅处理无 frontmatter 的文件 |
| 路径变更 | 切换 `NOTES_PATH` 后，对新的笔记仓库执行初始化 |

## 工作原理

```
扫描 .md 文件
  ├─ 加载 .buildignore 过滤
  └─ 逐文件处理
       ├─ 解析已有 frontmatter
       ├─ 检查缺少哪些字段
       └─ 补全 → 写回
```

日期获取复用 `notes-loader` 同级降级策略：

```
frontmatter.date → git log --follow（首次提交）→ statSync().mtime
```

## 注意事项

- **空文件误判**：内容为空的文件可能被 `git log --follow` 错误关联到历史空文件，导致日期偏早。如发现日期异常，手动修正 frontmatter 中的 `date` 即可。
- **删除后重建**：文件被 delete 后重新 create 会被视为新文件，取重建日期。
- **`--follow` 依赖 git**：无 git 环境降级到 `mtime`，脚本不会报错。
