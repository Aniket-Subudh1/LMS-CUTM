import { renderRichText } from '@/lib/domain/rich-text';
import type { RichTextDoc } from '@/lib/schemas/common';

// Safe to inject: the HTML is generated from a schema-checked document, which escapes text and empties unsafe links.
export function RichTextView({ doc }: { doc: RichTextDoc }) {
  return <div className="prose-lms" dangerouslySetInnerHTML={{ __html: renderRichText(doc) }} />;
}
