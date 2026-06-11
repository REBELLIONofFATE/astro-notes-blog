import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { notesLoader } from './loaders/external';
import { contentSchema } from './frontmatter-schema';
import { ROUTE_PREFIX, ASSETS_PREFIX } from './config';

/** 博文集合：手动维护，存放在 src/content/posts/ */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: contentSchema,
});

/**
 * 笔记集合：从外部笔记仓库自动同步
 * 本地开发路径通过 NOTES_PATH 环境变量配置，不设置时跳过笔记加载
 */

const NOTES_PATH = import.meta.env['NOTES_PATH'] as string | undefined;

const notes = defineCollection({
  loader: notesLoader({
    basePath: NOTES_PATH,
    excludeDirs: ['.git', '.idea', '文档'],
    routePrefix: ROUTE_PREFIX,
    assetsPrefix: ASSETS_PREFIX,
  }),
  schema: contentSchema.extend({
    // 笔记默认 type 为 'note'
    type: contentSchema.shape.type.default('note'),
    // frontmatter 中的原始 title（仅当 frontmatter 写了 title 时有值）
    rawTitle: z.string().optional(),
  }),
});

export const collections = { posts, notes };
