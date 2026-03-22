// sitemap.ts - Sitemap URL 生成工具函数
// Requirements: 8.4

export interface SitemapPost {
  data: {
    slug: string;
    draft?: boolean;
  };
}

/** 生成所有已发布文章的完整 URL 列表 */
export function generatePostUrls(posts: SitemapPost[], siteUrl: string): string[] {
  const base = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
  return posts
    .filter((post) => post.data.draft !== true)
    .map((post) => `${base}/posts/${post.data.slug}`);
}
