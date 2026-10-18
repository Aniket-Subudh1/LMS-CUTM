import 'server-only';
import { generateHTML } from '@tiptap/html/server';
import StarterKit from '@tiptap/starter-kit';
import type { RichTextDoc } from '@/lib/schemas/common';

// Matches the editor's configuration (components/rich-text-editor.tsx). Links open in a new tab and carry no referrer.
const EXTENSIONS = [
  StarterKit.configure({
    link: { openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
  }),
];

// Text is escaped and a `javascript:` link renders with an empty href (verified in rich-text.test.ts).
export function renderRichText(doc: RichTextDoc): string {
  return generateHTML(doc, EXTENSIONS);
}

// A question's words without formatting, for a one-line list row (the builder, the question bank).
export function plainText(doc: RichTextDoc | null): string {
  const out: string[] = [];
  const walk = (nodes: RichTextDoc['content']) => {
    for (const node of nodes ?? []) {
      if (node.text) out.push(node.text);
      walk(node.content);
    }
  };
  walk(doc?.content);
  return out.join(' ').trim();
}
