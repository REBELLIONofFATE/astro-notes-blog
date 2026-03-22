// seo.ts - SEO 元标签生成工具函数
// Requirements: 8.2, 8.3

export interface MetaTags {
  title: string;
  description: string;
  "og:title": string;
  "og:description": string;
  "og:type": string;
}

/** 生成 SEO 元标签对象 */
export function generateMetaTags(title: string, description: string): MetaTags {
  return {
    title,
    description,
    "og:title": title,
    "og:description": description,
    "og:type": "website",
  };
}
