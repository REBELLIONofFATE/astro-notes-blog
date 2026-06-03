// rss.xml.ts - RSS Feed 端点
// Requirements: 9.1, 9.2
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";
import { filterPublished, sortByDateDesc, extractExcerpt } from "../utils/posts";
import { generateRssItem } from "../utils/rss";

export async function GET(context: APIContext) {
  const [allPosts, allNotes] = await Promise.all([
    getCollection("posts"),
    getCollection("notes"),
  ]);

  const allContent = sortByDateDesc(
    filterPublished([...allPosts, ...allNotes])
  );

  return rss({
    title: "我的博客",
    description: "一个使用 Astro 构建的个人博客，分享编程、技术与生活的思考",
    site: context.site!.toString(),
    items: allContent.map((item) => generateRssItem(item, extractExcerpt)),
  });
}
