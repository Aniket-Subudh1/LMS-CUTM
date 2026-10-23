import { describe, expect, it } from 'vitest';
import { RichTextDoc, richText } from '@/lib/schemas/common';
import { plainText, renderRichText } from './rich-text';

const paragraph = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const field = (doc: unknown) => richText.safeParse(JSON.stringify(doc));
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('renderRichText', () => {
  it('escapes script tags in text', () => {
    const html = renderRichText(RichTextDoc.parse(paragraph('Hello <script>alert(1)</script>')));
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders a javascript: link with an empty href', () => {
    const doc = RichTextDoc.parse({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Open me', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
          ],
        },
      ],
    });
    const html = renderRichText(doc);
    expect(html).toContain('href=""');
    expect(html).not.toContain('javascript:');
  });

  it('opens other links in a new tab without a referrer', () => {
    const doc = RichTextDoc.parse({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Docs', marks: [{ type: 'link', attrs: { href: 'https://cutm.ac.in' } }] }],
        },
      ],
    });
    expect(renderRichText(doc)).toContain(
      '<a target="_blank" rel="noopener noreferrer nofollow" href="https://cutm.ac.in">',
    );
  });
});

describe('richText', () => {
  it('accepts every StarterKit mark the editor can produce, underline included', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Week 1' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Read', marks: [{ type: 'underline' }, { type: 'bold' }] }],
        },
      ],
    };
    expect(field(doc)).toMatchObject({ success: true, data: doc });
  });

  it('rejects an image node', () => {
    const result = field({ type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.test/x.png' } }] });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('Unsupported content.');
  });

  it('rejects text that is not JSON', () => {
    expect(messages(richText.safeParse('<p>Hello</p>'))).toContain('Unsupported content.');
  });

  it('rejects a document larger than 100 KB', () => {
    const result = field(paragraph('x'.repeat(101 * 1024)));
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('Use 100 KB or less.');
  });

  it('turns an empty editor and a document without text into null', () => {
    expect(richText.safeParse('')).toMatchObject({ success: true, data: null });
    expect(field({ type: 'doc', content: [{ type: 'paragraph' }] })).toMatchObject({ success: true, data: null });
    expect(field(paragraph('   '))).toMatchObject({ success: true, data: null });
  });
});

describe('plainText', () => {
  it('joins the words of every text node', () => {
    expect(
      plainText({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Pick' },
              { type: 'text', text: 'one.' },
            ],
          },
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] }],
          },
        ],
      }),
    ).toBe('Pick one. A');
    expect(plainText(null)).toBe('');
  });
});
