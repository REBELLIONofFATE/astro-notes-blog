// config.ts - 全局共享配置
// content.config.ts 和 posts.ts 共用，保证 loader 与 URL 生成使用一致的 routePrefix / assetsPrefix

/** 笔记路由前缀，默认 '/notes' */
export const ROUTE_PREFIX = '/notes';

/** 资源路由前缀，默认 '/notes-assets' */
export const ASSETS_PREFIX = '/notes-assets';
