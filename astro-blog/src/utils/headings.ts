/** 去除 Markdown 行内格式标记（**加粗**、*斜体*、`代码`、~~删除线~~、[链接]） */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **加粗**
    .replace(/\*(.+?)\*/g, '$1')         // *斜体*
    .replace(/`(.+?)`/g, '$1')            // `代码`
    .replace(/~~(.+?)~~/g, '$1')          // ~~删除线~~
    .replace(/\[(.+?)\]\(.*?\)/g, '$1') // [链接](url)
    .trim();
}

/** 从纯文本生成 URL 安全的 slug，与 marked renderer 中的 ID 逻辑保持一致 */
export function generateId(text: string): string {
  return text
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff\-]/g, '')
    .toLowerCase();
}

export interface Heading {
  text: string;
  level: number;
  id: string;
}

/** 从 Markdown 正文提取 h2-h4 标题 */
export function extractHeadings(body: string): Heading[] {
  const regex = /^(#{2,4})\s+(.+)$/gm;
  const headings: Heading[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    const rawText = match[2].trim();
    const text = stripMarkdown(rawText);
    headings.push({ text, level: match[1].length, id: generateId(text) });
  }
  return headings;
}
