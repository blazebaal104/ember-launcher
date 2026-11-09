/** Render Modrinth project descriptions safely: Markdown → HTML → DOMPurify allow-list. */
import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(md: string): string {
  const html = marked.parse(md ?? "", { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "p", "a", "ul", "ol", "li", "strong", "em", "b", "i", "code", "pre", "blockquote", "img", "br", "hr", "table", "thead", "tbody", "tr", "td", "th", "details", "summary", "center", "span", "div", "del", "sup", "sub"],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "width", "height", "align"],
    ALLOWED_URI_REGEXP: /^https:\/\//i,
  });
}
