import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const page = z.coerce.number().int().min(1).max(10_000).default(1);
export const pageSize = 10;

// Rich text is Tiptap JSON from StarterKit (05 §1, ADR-11). Only these node and mark types are stored, so a document
// that passes this schema always renders with @tiptap/html (which throws on an unknown type).
const RICH_TEXT_NODES = [
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
] as const;
const RICH_TEXT_MARKS = ['bold', 'italic', 'underline', 'strike', 'code', 'link'] as const;
const MAX_RICH_TEXT_BYTES = 100 * 1024;
const unsupported = { error: 'Unsupported content.' };
const attrs = z.record(z.string(), z.json()).optional();

const RichTextNode = z.object({
  type: z.enum(RICH_TEXT_NODES, unsupported),
  attrs,
  text: z.string().optional(),
  marks: z.array(z.object({ type: z.enum(RICH_TEXT_MARKS, unsupported), attrs })).optional(),
  get content() {
    return z.array(RichTextNode).optional();
  },
});
type RichTextNode = z.infer<typeof RichTextNode>;

export const RichTextDoc = z.object(
  { type: z.literal('doc', unsupported), content: z.array(RichTextNode).optional() },
  unsupported,
);
export type RichTextDoc = z.infer<typeof RichTextDoc>;

const hasText = (node: RichTextNode): boolean => Boolean(node.text?.trim()) || (node.content ?? []).some(hasText);

// A rich-text form field: the editor's hidden input holds the JSON ('' when empty). A document with no text becomes
// null, so an untouched editor stores nothing and a required plan that is empty counts as missing.
export const richText = z
  .string()
  .default('')
  .refine((value) => new TextEncoder().encode(value).length <= MAX_RICH_TEXT_BYTES, 'Use 100 KB or less.')
  .transform((value, ctx) => {
    if (!value.trim()) return null;
    try {
      return JSON.parse(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Unsupported content.' });
      return z.NEVER;
    }
  })
  .pipe(RichTextDoc.nullable())
  .transform((doc) => (doc && (doc.content ?? []).some(hasText) ? doc : null));

// A calendar date typed into <input type="date">; the action turns it into 00:00 IST with istDateToDate (06 §2).
export const istDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date.')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Enter a real date.');

// A wall-clock time typed into <input type="time"> (HH:mm); the action reads it as IST with parseIstLocal (06 §2).
export const istTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time.');

// <input type="datetime-local"> sends no time zone; the action reads it as IST with parseIstLocal (06 §2). Two of these
// compare as strings in the same order as the times they name.
export const istDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a date and time.');

// Hand-entered marks (06 §2); the action rounds them to 2 decimals with roundHalfUp (07 §1).
export const marks = z.coerce
  .number({ error: 'Enter a number.' })
  .min(0, 'Marks cannot be negative.')
  .max(1000, 'Use at most 1000 marks.');

export const ROLES = ['admin', 'hod', 'faculty', 'student', 'support'] as const;
export type Role = (typeof ROLES)[number];
