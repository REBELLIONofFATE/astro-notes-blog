// rss.ts - RSS 条目生成工具函数
// Requirements: 9.2

export interface RssItem {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
}

export interface RssPost {
  data: {
    title: string;
    slug: string;
    date: Date;
  };
  body?: string;
}

/** 生成单个 RSS 条目对象 */
export function generateRssItem(
  post: RssPost,
  extractExcerpt: (body: string) => string
): RssItem {
  return {
    title: post.data.title,
    link: `/posts/${post.data.slug}`,
    pubDate: post.data.date,
    description: extractExcerpt(post.body ?? ""),
  };
}
