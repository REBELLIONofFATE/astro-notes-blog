// posts.ts - 文章相关工具函数
// Requirements: 1.3, 2.1, 2.3

export interface Post {
  data: {
    title: string;
    slug: string;
    date: Date;
    draft?: boolean;
  };
  body?: string;
}

/** 过滤草稿文章，仅保留 draft !== true 的文章 */
export function filterPublished<T extends { data: { draft?: boolean } }>(posts: T[]): T[] {
  return posts.filter((post) => post.data.draft !== true);
}

/** 按日期降序排序 */
export function sortByDateDesc<T extends { data: { date: Date } }>(posts: T[]): T[] {
  return [...posts].sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** 从 Markdown body 提取纯文本摘要（去除 Markdown 标记，截取前 maxLength 字符） */
export function extractExcerpt(body: string, maxLength = 120): string {
  const plain = body
    .replace(/^---[\s\S]*?---\s*/m, "")   // 去除 frontmatter
    .replace(/```[\s\S]*?```/g, "")        // 去除代码块
    .replace(/`[^`]*`/g, "")               // 去除行内代码
    .replace(/!\[.*?\]\(.*?\)/g, "")       // 去除图片
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1") // 链接保留文字
    .replace(/#{1,6}\s+/g, "")             // 去除标题标记
    .replace(/[*_~]{1,3}/g, "")            // 去除加粗/斜体/删除线
    .replace(/>\s+/g, "")                  // 去除引用标记
    .replace(/[-*+]\s+/g, "")              // 去除无序列表标记
    .replace(/\d+\.\s+/g, "")             // 去除有序列表标记
    .replace(/\|.*?\|/g, "")               // 去除表格
    .replace(/\n{2,}/g, " ")               // 多换行变空格
    .replace(/\n/g, " ")                   // 换行变空格
    .replace(/\s+/g, " ")                  // 合并空格
    .trim();

  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength) + "…";
}

/** 生成文章 URL 路径 */
export function getPostUrl(slug: string): string {
  return `/posts/${slug}`;
}
