# 构建与运行指南

## 命令说明

| 命令 | 用途 | 搜索功能 |
|------|------|----------|
| `npm run dev` | 开发模式，热更新 | ❌ 不可用 |
| `npm run build` | 生产构建 | ✅ 可用 |
| `npm run preview` | 预览构建产物 | ✅ 可用 |

---

## 开发模式

```bash
npm run dev
```

- 启动开发服务器（默认 `http://localhost:4321`）
- 代码修改后自动热更新
- **搜索功能不可用**（Pagefind 仅在 build 时构建索引）

---

## 生产构建

```bash
npm run build
```

构建流程：
1. `astro build` — 生成静态页面到 `dist/`
2. `node scripts/pagefind-build.mjs` — 构建搜索索引到 `dist/pagefind/`

输出目录：`dist/`（包含所有静态资源和 Pagefind 搜索索引）

> ⚠️ **Windows 注意**：构建前若 `dist/` 存在且被占用，需先清理：
> ```powershell
> Remove-Item -Recurse -Force dist
> ```

---

## 预览构建产物

```bash
npm run preview
```

启动本地服务器预览 `dist/` 目录，可以完整测试包括搜索在内的所有功能。

---

## 搜索功能说明

项目使用 [Pagefind](https://pagefind.app/) 实现静态搜索：

- 搜索页面：`/search`
- 索引范围：所有笔记（notes）和博文（posts）
- 构建脚本：`scripts/pagefind-build.mjs`（Node.js API）

> 为什么用 Node.js API 而非 CLI？
>
> Pagefind Rust CLI 在 Windows 上处理中文路径时会报 `os error 5`（拒绝访问），改用 Node.js API 可完美兼容。

---

## 常见问题

### 构建报 `拒绝访问 (os error 5)`

**原因**：之前运行的进程占用了 `dist/` 目录中的文件。

**解决**：
```powershell
taskkill /F /IM node.exe
Remove-Item -Recurse -Force dist
npm run build
```

### 开发模式下搜索不可用

这是预期行为。Pagefind 仅在生产构建时生成索引。如需测试搜索，请使用 `npm run build` + `npm run preview`。

### Docker 部署

项目包含 `Dockerfile` 和 `docker-compose.yml`，使用多阶段构建：
```bash
docker compose up --build
```
