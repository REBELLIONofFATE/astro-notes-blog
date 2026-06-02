// frontmatter-schema.ts - Markdown frontmatter Schema 定义
// 统一管理 Markdown 文档 frontmatter 字段定义

import { z } from 'astro/zod';

/**
 * Markdown frontmatter 基础 Schema
 * 用于 posts 和 notes 集合
 */
export const contentSchema = z.object({
  /** 文章标题（必填） */
  title: z.string(),
  
  /** URL slug（必填） */
  slug: z.string(),
  
  /** 发布日期（必填，支持日期字符串自动转换） */
  date: z.coerce.date(),
  
  /** 是否为草稿（可选，默认 false） */
  draft: z.boolean().default(false),
  
  /** 内容类型（可选，featured 或 note） */
  type: z.enum(['featured', 'note']).default('featured'),
  
  /** 标签数组（可选） */
  tags: z.array(z.string()).default([]),
  
  /** 分类（可选，默认 "未分类"） */
  category: z.string().default('未分类'),
  
  // ========== SEO 相关字段 ==========
  
  /** 文章描述（可选，用于 SEO meta description） */
  description: z.string().optional(),
  
  /** 封面图 URL（可选，用于 og:image） */
  image: z.string().optional(),
  
  /** 关键词数组（可选，用于 SEO keywords） */
  keywords: z.array(z.string()).default([]),
});
