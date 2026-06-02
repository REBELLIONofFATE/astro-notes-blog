// categories.ts - 分类树构建工具函数

export interface CategoryNode {
  /** 显示名称，如 "Docker" */
  name: string;
  /** 完整路径，如 "文档/pdfs" */
  path: string;
  /** 该分类下文章总数（含子分类） */
  count: number;
  /** 子分类 */
  children: CategoryNode[];
}

interface PostLike {
  data: {
    category?: string;
    draft?: boolean;
  };
}

/**
 * 从文章集合构建分类树（纯函数）
 * 仅统计已发布（draft !== true）的文章
 */
export function buildCategoryTree(posts: PostLike[]): CategoryNode[] {
  const published = posts.filter((p) => p.data.draft !== true);

  // 统计每个分类路径的直接文章数
  const directCount: Record<string, number> = {};
  for (const post of published) {
    const cat = post.data.category ?? '未分类';
    directCount[cat] = (directCount[cat] ?? 0) + 1;
  }

  // 收集所有出现过的分类路径（含中间节点）
  const allPaths = new Set<string>();
  for (const cat of Object.keys(directCount)) {
    const parts = cat.split('/');
    for (let i = 1; i <= parts.length; i++) {
      allPaths.add(parts.slice(0, i).join('/'));
    }
  }

  // 计算每个节点的总数（含子分类）
  function countForPath(path: string): number {
    let total = directCount[path] ?? 0;
    for (const [cat, cnt] of Object.entries(directCount)) {
      if (cat !== path && cat.startsWith(path + '/')) {
        total += cnt;
      }
    }
    return total;
  }

  // 递归构建树
  function buildNodes(parentPath: string | null): CategoryNode[] {
    const nodes: CategoryNode[] = [];

    for (const path of allPaths) {
      const parts = path.split('/');
      const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : null;

      if (parent !== parentPath) continue;

      const count = countForPath(path);
      if (count === 0) continue;

      nodes.push({
        name: parts[parts.length - 1],
        path,
        count,
        children: buildNodes(path),
      });
    }

    return nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  return buildNodes(null);
}

/**
 * 获取所有分类的扁平列表（去重，按文章数降序）
 * 包含中间节点路径（即使没有笔记直接归属该路径）
 */
export function getAllCategories(posts: PostLike[]): { path: string; count: number }[] {
  const directCount: Record<string, number> = {};
  const published = posts.filter((p) => p.data.draft !== true);

  for (const post of published) {
    const cat = post.data.category ?? '未分类';
    directCount[cat] = (directCount[cat] ?? 0) + 1;
  }

  // 收集所有出现过的分类路径（含中间节点）
  const allPaths = new Set<string>();
  for (const cat of Object.keys(directCount)) {
    const parts = cat.split('/');
    for (let i = 1; i <= parts.length; i++) {
      allPaths.add(parts.slice(0, i).join('/'));
    }
  }

  // 计算每个路径的总文章数（含子分类）
  function totalForPath(path: string): number {
    let total = directCount[path] ?? 0;
    for (const [cat, cnt] of Object.entries(directCount)) {
      if (cat !== path && cat.startsWith(path + '/')) {
        total += cnt;
      }
    }
    return total;
  }

  return Array.from(allPaths)
    .map((path) => ({ path, count: totalForPath(path) }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);
}

interface TagPostLike {
  data: {
    tags?: string[];
    draft?: boolean;
  };
}

/**
 * 获取所有标签及其文章数（按文章数降序）
 */
export function getAllTags(posts: TagPostLike[]): { tag: string; count: number }[] {
  const count: Record<string, number> = {};
  const published = posts.filter((p) => p.data.draft !== true);

  for (const post of published) {
    for (const tag of post.data.tags ?? []) {
      count[tag] = (count[tag] ?? 0) + 1;
    }
  }

  return Object.entries(count)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
