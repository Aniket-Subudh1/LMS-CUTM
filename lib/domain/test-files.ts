// M04b (TP-12): the pure parts of the files made from a test's results (07 §20).

// A certificate's verification code (/v/<code>): 10 characters from 32 that cannot be misread (no I, O, 0 or 1), in
// two groups of five — 50 bits, too many to guess. Each random byte's low 5 bits pick one, so each is equally likely.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function codeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 10) throw new Error('A certificate code takes 10 random bytes.');
  const chars = Array.from(bytes.subarray(0, 10), (byte) => CODE_CHARS.charAt(byte & 31)).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

// The PDFs use the fonts every reader has built in (Helvetica, Times), which print Windows-1252 only: the symbols the
// LMS writes itself are spelled out, control characters dropped, and anything else becomes "?".
const SPELLED = new Map([
  ['→', '->'],
  ['←', '<-'],
  ['−', '-'],
  ['≤', '<='],
  ['≥', '>='],
  ['≠', '!='],
  [' ', ' '],
  ['\t', ' '],
]);
const WINDOWS_1252 = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

export function pdfSafe(text: string): string {
  return Array.from(text.normalize('NFC'), (char) => {
    const spelled = SPELLED.get(char);
    if (spelled !== undefined) return spelled;
    const code = char.codePointAt(0) ?? 0;
    if (char === '\n') return char;
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) return '';
    return code < 0x100 || WINDOWS_1252.has(char) ? char : '?';
  }).join('');
}

// A certificate goes to a counted attempt at or above the test's threshold; a test without one gives none.
export function earnsCertificate(pct: number, fromPct: number | null): boolean {
  return fromPct !== null && pct >= fromPct;
}
