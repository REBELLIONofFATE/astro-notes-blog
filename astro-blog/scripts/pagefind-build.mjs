import { createIndex, close } from "pagefind";

async function build() {
  const { index } = await createIndex();

  if (!index) {
    throw new Error("Pagefind index creation failed");
  }

  // 索引笔记目录
  const notesResult = await index.addDirectory({ path: "dist/notes" });
  // 索引博文目录
  const postsResult = await index.addDirectory({ path: "dist/posts" });

  const totalPages = (notesResult.page_count ?? 0) + (postsResult.page_count ?? 0);
  console.log(`Indexed ${totalPages} pages (${notesResult.page_count} notes + ${postsResult.page_count} posts)`);

  const { errors } = await index.writeFiles({ outputPath: "dist/pagefind" });
  if (errors?.length) {
    console.error("Pagefind errors:", errors);
  }

  console.log("Pagefind index built successfully");
  await close();
}

build().catch((e) => {
  console.error("Pagefind failed:", e.message);
  process.exit(1);
});
