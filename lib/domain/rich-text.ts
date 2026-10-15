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
