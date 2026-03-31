import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { notesLoader } from './loaders/notes-loader';

const contentSchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: z.coerce.date(),
  draft: z.boolean().default(false),
  type: z.enum(['featured', 'note']).default('featured'),
  tags: z.array(z.string()).default([]),
  category: z.string().default('未分类'),
});

/** 精选博文集合：手动维护，存放在 src/content/posts/ */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: contentSchema,
});

/**
 * 笔记集合：从外部笔记仓库自动同步
 * 本地开发路径通过 NOTES_PATH 环境变量配置，fallback 到硬编码路径
 */
const NOTES_PATH = process.env['NOTES_PATH'] ?? 'D:\\MyProject\\my-note\\myNote';

const notes = defineCollection({
  loader: notesLoader({
    basePath: NOTES_PATH,
    excludeDirs: ['.git', '.idea', '文档'],
  }),
  schema: contentSchema.extend({
    type: z.enum(['featured', 'note']).default('note'),
  }),
});

export const collections = { posts, notes };
