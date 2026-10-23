import { describe, expect, it } from 'vitest';
import { LinkRepository, SaveProject } from './projects';

const id = (n: number) => String(n).padStart(24, 'a');

describe('LinkRepository', () => {
  it.each([
    ['cutm-cse/attendance', 'cutm-cse/attendance'],
    ['https://github.com/cutm-cse/attendance', 'cutm-cse/attendance'],
    ['https://github.com/cutm-cse/attendance.git', 'cutm-cse/attendance'],
  ])('reads %s as %s', (repo, expected) => {
    expect(LinkRepository.parse({ projectId: id(1), repo }).repo).toBe(expected);
  });
  it('refuses something that is not owner/name', () => {
    expect(LinkRepository.safeParse({ projectId: id(1), repo: 'attendance' }).success).toBe(false);
  });
});

describe('SaveProject', () => {
  const base = {
    offeringId: id(1),
    title: 'Smart attendance',
    guideId: id(2),
    startsOn: '2026-08-01',
    dueOn: '2026-11-30',
  };
  it('needs a student and a due date after the start', () => {
    expect(SaveProject.safeParse({ ...base, 'member[]': [] }).success).toBe(false);
    expect(SaveProject.safeParse({ ...base, 'member[]': id(3), dueOn: '2026-07-01' }).success).toBe(false);
    expect(SaveProject.parse({ ...base, 'member[]': id(3) })['member[]']).toEqual([id(3)]);
  });
});
