import { describe, expect, it } from 'vitest';
import { buildKey, derivedKey, extFor, fileUuid, frameAtSec, parseKey, sanitizeFileName } from './uploads';

const ctx = '507f1f77bcf86cd799439011';
const uid = '507f191e810c19729de860ea';

describe('uploads', () => {
  it('takes the extension from the content type', () => {
    expect(extFor('video/mp4')).toBe('mp4');
    expect(extFor('application/pdf')).toBe('pdf');
    expect(() => extFor('text/html')).toThrow();
  });

  it('builds <purpose>/<context>/<user>/<uuid>.<ext>', () => {
    expect(buildKey('lesson-video', ctx, uid, 'abc-123', 'video/mp4')).toBe(`lesson-video/${ctx}/${uid}/abc-123.mp4`);
  });

  it('parses a key and its data-saver copy back into purpose, context and user', () => {
    const owner = { purpose: 'lesson-video', contextId: ctx, userId: uid };
    expect(parseKey(`lesson-video/${ctx}/${uid}/abc-123.mp4`)).toEqual(owner);
    expect(parseKey(`lesson-video/${ctx}/${uid}/abc-123-480p.mp4`)).toEqual(owner);
    expect(parseKey(`lesson-video/${ctx}/${uid}/abc-123-frame.jpg`)).toEqual(owner);
    expect(parseKey(`lesson-thumb/${ctx}/${uid}/abc-123.jpg`)).toEqual({ ...owner, purpose: 'lesson-thumb' });
  });

  it('names the worker files beside the original and finds the upload id', () => {
    const key = `lesson-video/${ctx}/${uid}/abc-123.webm`;
    expect(derivedKey(key, '-480p.mp4')).toBe(`lesson-video/${ctx}/${uid}/abc-123-480p.mp4`);
    expect(derivedKey(key, '-frame.jpg')).toBe(`lesson-video/${ctx}/${uid}/abc-123-frame.jpg`);
    expect(fileUuid(key)).toBe('abc-123');
    expect(extFor('image/webp')).toBe('webp');
  });

  it.each([
    [1, 0],
    [2, 1],
    [5, 1],
    [60, 6],
    [7200, 720],
  ])('takes the frame of a %i s video at %i s', (duration, at) => {
    expect(frameAtSec(duration)).toBe(at);
  });

  it.each([
    'not-a-key',
    `unknown/${ctx}/${uid}/a.pdf`,
    `lesson-doc/${ctx}/${uid}/../a.pdf`,
    `lesson-doc/${ctx}/${uid}/a/b.pdf`,
    `lesson-doc/${ctx}/${uid}`,
  ])('rejects %s', (key) => {
    expect(parseKey(key)).toBeNull();
  });

  it('removes traversal and reserved characters from a file name', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizeFileName('Week\t1:  "intro"?.pdf')).toBe('Week 1 intro.pdf');
  });

  it('keeps the extension when shortening a 300-character name to 120', () => {
    const sanitized = sanitizeFileName(`${'a'.repeat(300)}.pdf`);
    expect(sanitized).toHaveLength(120);
    expect(sanitized.endsWith('.pdf')).toBe(true);
  });
});
