import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { readFileSync, existsSync } from 'node:fs';
import { notesLoader } from './loaders/notes-loader';
import { contentSchema } from './frontmatter-schema';

/**
 * 从 .env 文件中读取变量（Astro 启动时不会自动为 content.config.ts 加载 .env）
 */
function loadEnvVar(key: string): string | undefined {
  // 优先使用已设置的环境变量
  if (process.env[key]) return process.env[key];

  // 尝试从 .env 文件读取
  const envFiles = ['.env', '.env.local', '.env.development'];
  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    try {
      const content = readFileSync(file, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const eqIdx = trimmed.indexOf('=');
        const k = trimmed.slice(0, eqIdx).trim();
        if (k === key) {
          return trimmed.slice(eqIdx + 1).trim();
        }
      }
    } catch { /* ignore */ }
  }
  return undefined;
}

/** 博文集合：手动维护，存放在 src/content/posts/ */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: contentSchema,
});

/**
 * 笔记集合：从外部笔记仓库自动同步
 * 本地开发路径通过 NOTES_PATH 环境变量配置，fallback 到 .env 文件，再 fallback 到硬编码路径
 */
const NOTES_PATH = loadEnvVar('NOTES_PATH') ?? 'D:/MyProject/my-note/myNote';

const notes = defineCollection({
  loader: notesLoader({
    basePath: NOTES_PATH,
    excludeDirs: ['.git', '.idea', '文档'],
  }),
  schema: contentSchema.extend({
    // 笔记默认 type 为 'note'
    type: contentSchema.shape.type.default('note'),
  }),
});

export const collections = { posts, notes };
