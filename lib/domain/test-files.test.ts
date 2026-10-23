import { describe, expect, it } from 'vitest';
import { codeFromBytes, earnsCertificate, pdfSafe } from './test-files';

describe('codeFromBytes (07 §20)', () => {
  it.each([
    [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'ABCDE-FGHJK'],
    [[31, 30, 29, 28, 27, 26, 25, 24, 23, 22], '98765-432ZY'],
    // Only the low 5 bits count: 32, 224 and 64 are 0; 255 and 63 are 31; 33 is 1.
    [[32, 255, 224, 63, 64, 96, 128, 160, 192, 33], 'A9A9A-AAAAB'],
  ])('%j → %s', (bytes, code) => {
    expect(codeFromBytes(Uint8Array.from(bytes))).toBe(code);
  });

  it('reads only the first 10 bytes and refuses fewer', () => {
    expect(codeFromBytes(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6]))).toBe('AAAAA-AAAAA');
    expect(() => codeFromBytes(Uint8Array.from([1, 2, 3]))).toThrow();
  });

  it('never uses a character that reads as another', () => {
    const all = Array.from({ length: 32 }, (_, i) => codeFromBytes(Uint8Array.from({ length: 10 }, () => i))[0]);
    expect(new Set(all).size).toBe(32);
    expect(all.join('')).not.toMatch(/[IO01]/);
  });
});

describe('pdfSafe (07 §20)', () => {
  it.each([
    ['Riya Patnaik', 'Riya Patnaik'],
    ['José Müller · 78%', 'José Müller · 78%'],
    ['“Quoted” – en dash … €5', '“Quoted” – en dash … €5'],
    ['Inorder → sorted', 'Inorder -> sorted'],
    ['−0.5 ≤ x ≥ 2', '-0.5 <= x >= 2'],
    ['ପ୍ରିୟା', '??????'],
    ['tab\there\u0007bell\nline', 'tab herebell\nline'],
    ['😀 ok', '? ok'],
  ])('%s → %s', (text, safe) => {
    expect(pdfSafe(text)).toBe(safe);
  });
});

describe('earnsCertificate (07 §20)', () => {
  it.each([
    [78, 60, true],
    [60, 60, true],
    [59.99, 60, false],
    [100, null, false],
    [0, 0, true],
  ])('%d %% with a threshold of %s → %s', (pct, from, earns) => {
    expect(earnsCertificate(pct, from)).toBe(earns);
  });
});
