# ============================================
# Rebellion's Blog — Docker 纯静态打包
# ============================================
#
# 使用方式：
#   1. 先本地执行 npm run build（确保笔记路径正确）
#   2. 再执行 docker build -t my-blog .
#
# 将前端构建产物 dist/ 打包到 Nginx 镜像中

FROM nginx:alpine

# 复制本地构建产物
COPY dist /usr/share/nginx/html

# 复制 Nginx 配置（启用缓存 + Gzip 压缩）
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
