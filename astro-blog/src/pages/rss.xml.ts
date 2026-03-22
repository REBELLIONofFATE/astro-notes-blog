// rss.xml.ts - RSS Feed 端点
// Requirements: 9.1, 9.2
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";
import { filterPublished, sortByDateDesc, extractExcerpt } from "../utils/posts";
import { generateRssItem } from "../utils/rss";

export async function GET(context: APIContext) {
  const allPosts = await getCollection("posts");
  const posts = sortByDateDesc(filterPublished(allPosts));

  return rss({
    title: "我的博客",
    description: "一个使用 Astro 构建的个人博客",
    site: context.site!.toString(),
    items: posts.map((post) => generateRssItem(post, extractExcerpt)),
  });
}
