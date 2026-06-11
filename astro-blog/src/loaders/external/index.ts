// index.ts - astro-loader-notes 公共入口

export { notesLoader } from './loader';
export type { NotesLoaderOptions, AssetInfo } from './types';
export {
  escapeRegExp,
  parseBuildIgnore,
  loadBuildIgnore,
  scanAllAssets,
  copyAllAssets,
  replaceAssetPaths,
} from './asset-copier';
