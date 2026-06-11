// types.ts - 公共类型导出

/** 单个资源文件在 vault 下的描述 */
export interface AssetInfo {
  absPath: string;
  relPath: string;
}

/** notesLoader 配置选项 */
export interface NotesLoaderOptions {
  /** 笔记仓库根目录的绝对路径。不设置时跳过笔记加载 */
  basePath?: string;
  /** 需要排除的目录名（精确匹配），默认排除 .git、.idea、文档 */
  excludeDirs?: string[];
  /** 笔记路由前缀，默认 '/notes' */
  routePrefix?: string;
  /** 资源路由前缀，默认 '/notes-assets' */
  assetsPrefix?: string;
}
