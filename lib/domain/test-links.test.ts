import { describe, expect, it } from 'vitest';
import { assessmentPath, emailAllowed, linkState, maskEmail } from './test-links';

const now = new Date('2026-10-24T10:00:00+05:30');
const link = { active: true, expiresAt: null, maxUses: null, uses: 0 };

describe('linkState', () => {
  it.each([
    ['an open link', link, 'open'],
    ['turned off', { ...link, active: false }, 'off'],
    ['past its expiry', { ...link, expiresAt: new Date('2026-10-24T09:59:59+05:30') }, 'expired'],
    ['at its expiry', { ...link, expiresAt: now }, 'expired'],
    ['before its expiry', { ...link, expiresAt: new Date('2026-10-24T10:00:01+05:30') }, 'open'],
    ['at its use limit', { ...link, maxUses: 100, uses: 100 }, 'full'],
    ['under its use limit', { ...link, maxUses: 100, uses: 99 }, 'open'],
  ] as const)('%s → %s', (_, value, expected) => {
    expect(linkState(value, now)).toBe(expected);
  });
});

describe('emailAllowed', () => {
  it.each([
    ['riya@gmail.com', [], true],
    ['riya@gmail.com', ['gmail.com', 'cutm.ac.in'], true],
    ['Riya@CUTM.AC.IN', ['cutm.ac.in'], true],
    ['riya@mail.gmail.com', ['gmail.com'], false],
    ['riya@yahoo.com', ['gmail.com'], false],
  ] as const)('%s with %o → %s', (email, domains, expected) => {
    expect(emailAllowed(email, domains)).toBe(expected);
  });
});

describe('maskEmail', () => {
  it.each([
    ['riya.p@gmail.com', 'ri••••@gmail.com'],
    ['ab@cutm.ac.in', 'a••••@cutm.ac.in'],
    ['a@x.io', 'a••••@x.io'],
  ])('%s → %s', (email, expected) => {
    expect(maskEmail(email)).toBe(expected);
  });
});

describe('assessmentPath', () => {
  it('puts a course assessment under its course and a standalone test under Tests', () => {
    expect(assessmentPath('a'.repeat(24), 'b'.repeat(24))).toBe(
      `/courses/${'a'.repeat(24)}/assessments/${'b'.repeat(24)}`,
    );
    expect(assessmentPath(null, 'b'.repeat(24))).toBe(`/tests/${'b'.repeat(24)}`);
  });
});
