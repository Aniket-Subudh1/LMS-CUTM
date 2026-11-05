import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: () => ({
    S3_REGION: 'us-east-1',
    S3_ENDPOINT: 'http://storage.test',
    S3_FORCE_PATH_STYLE: true,
    S3_BUCKET: 'lms',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
    LOG_LEVEL: 'error',
  }),
}));

const { presignDownload } = await import('./storage');

async function dispositionOf(fileName: string) {
  const url = new URL(await presignDownload('lesson-video/a/b/c.mp4', fileName));
  return url.searchParams.get('response-content-disposition') ?? '';
}

describe('presignDownload', () => {
  // S3 answers 400 "Header value cannot be represented using ISO-8859-1" to anything else, so the file would not open.
  it.each([
    ['an accent kept as its own character (macOS)', 'Vide\u0301o 1-CEP.mp4', 'Video 1-CEP.mp4'],
    ['Odia', 'ପରୀକ୍ଷା.mp4', '.mp4'],
    ['an emoji and curly quotes', 'Unit 1 “intro” 🎓.mp4', 'Unit 1 intro .mp4'],
    ['half an emoji, cut by the length limit', 'cut \ud83c.mp4', 'cut .mp4'],
  ])('keeps the header ASCII for %s', async (_case, name, plain) => {
    const header = await dispositionOf(name);
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    expect(header.startsWith(`inline; filename="${plain}"; filename*=UTF-8''`)).toBe(true);
  });

  it('gives the browser the real name', async () => {
    const header = await dispositionOf('ପରୀକ୍ଷା (final).mp4');
    const exact = header.slice(header.indexOf("UTF-8''") + 7);
    expect(exact).not.toMatch(/[()]/);
    expect(decodeURIComponent(exact)).toBe('ପରୀକ୍ଷା (final).mp4');
  });

  it('cannot be broken out of with a quote or a backslash', async () => {
    expect(await dispositionOf('a"; evil=\\1.pdf')).toMatch(/^inline; filename="a; evil=1\.pdf"; filename\*=UTF-8''/);
  });

  it('names a file with nothing plain in it', async () => {
    expect(await dispositionOf('ପରୀକ୍ଷା')).toMatch(/^inline; filename="file"; filename\*=UTF-8''/);
  });
});
