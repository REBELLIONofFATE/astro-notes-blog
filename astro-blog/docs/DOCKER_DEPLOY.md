# Rebellion's Blog — Docker 部署文档

## 目录结构

```
astro-blog/
├── Dockerfile              # 纯静态 Docker 打包
├── docker-compose.yml      # 一键部署配置
├── .dockerignore           # 构建排除规则
├── nginx.conf              # Nginx 配置（缓存 + Gzip）
├── DOCKER_DEPLOY.md        # 本文档
└── dist/                   ← 本地构建产物（需先 npm run build）
```

## 前置条件

- 本地已安装 **Docker** 和 **Docker Compose**
- 服务器已安装 **Docker** 和 **Docker Compose**
- 本地可以正常执行 `npm run build`（笔记路径正确）

## 快速部署

### 1. 配置站点域名

修改 `astro.config.mjs` 中的 `site` 字段（构建前修改，否则需重新构建）：

```js
// astro.config.mjs
export default defineConfig({
  site: 'https://your-domain.com',   // ← 改为实际域名
  // ...
});
```

### 2. 本地构建前端

```bash
cd astro-blog
npm run build
```

构建产物输出到 `dist/` 目录（包含笔记内容、搜索索引等）。

### 3. 将项目传输到服务器

```bash
# 方案一：Git 推送后服务器拉取
# 方案二：直接复制整个 astro-blog/ 到服务器
# 方案三：在本地构建 Docker 镜像并推送到镜像仓库
```

### 4. 在服务器上构建并启动

```bash
cd astro-blog
docker compose up -d
```

构建仅需 1~2 秒（仅打包静态文件），完成后通过 `http://服务器IP:8080` 访问。

## 构建原理

Dockerfile 采用**纯静态打包**：

```
1. 本地执行 npm run build（读取本地笔记，生成 dist/）
2. docker build 仅将 dist/ 复制到 Nginx 镜像
3. Nginx 提供静态文件服务（带缓存 + Gzip 压缩）
```

> 不再在 Docker 内执行前端构建，避免笔记路径依赖和构建依赖安装问题。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 本地构建前端（生成 dist/）|
| `docker compose up -d` | 后台启动 |
| `docker compose down` | 停止并移除容器 |
| `docker compose logs -f` | 查看实时日志 |
| `docker compose build --no-cache` | 强制重新构建（无缓存） |

## 笔记更新后重建

```bash
# 1. 先本地重新构建前端
cd astro-blog
npm run build

# 2. 重新打包 Docker 镜像并启动
docker compose down
docker compose build
docker compose up -d
```

## 环境变量

本项目 Docker 容器**不依赖环境变量**。

前端构建所需的 `NOTES_PATH` 在本地 `npm run build` 时通过 `.env` 文件或系统环境变量提供，与 Docker 无关。

## 端口映射

默认将宿主机的 `8080` 端口映射到容器的 `80` 端口。如需修改，编辑 `docker-compose.yml`：

```yaml
ports:
  - "8080:80"   # 改为  "你要的端口:80"
```

## 日志查看

```bash
# 查看实时日志
docker compose logs -f

# 查看构建日志
docker compose build
```
