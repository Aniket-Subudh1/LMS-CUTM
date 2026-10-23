import { beforeAll, describe, expect, it } from 'vitest';
import { offeringAccess, requireTeach } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { enroll, makeOffering, makeUser, newId, viewerOf } from '../factories';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

beforeAll(async () => {
  await db();
});

describe('offeringAccess', () => {
  it('lets an admin oversee any offering', async () => {
    const admin = viewerOf(await makeUser({ roles: ['admin'] }));
    const offering = await makeOffering();
    expect(await offeringAccess(admin, String(offering._id))).toBe('oversee');
  });

  it('lets a listed faculty member teach', async () => {
    const faculty = await makeUser({ roles: ['faculty'] });
    const offering = await makeOffering({ facultyIds: [faculty._id] });
    expect(await offeringAccess(viewerOf(faculty), String(offering._id))).toBe('teach');
    const other = viewerOf(await makeUser({ roles: ['faculty'] }));
    await expect(offeringAccess(other, String(offering._id))).rejects.toThrow(NOT_FOUND);
  });

  it('lets the HoD of the offering department oversee and hides other departments', async () => {
    const departmentId = newId();
    const hod = viewerOf(await makeUser({ roles: ['faculty', 'hod'], departmentId }));
    const own = await makeOffering({ departmentId });
    const foreign = await makeOffering();
    expect(await offeringAccess(hod, String(own._id))).toBe('oversee');
    await expect(offeringAccess(hod, String(foreign._id))).rejects.toThrow(NOT_FOUND);
  });

  it('lets an enrolled student learn from an active or completed offering', async () => {
    const student = await makeUser();
    for (const status of ['active', 'completed'] as const) {
      const offering = await makeOffering({ status });
      await enroll(offering._id, student._id);
      expect(await offeringAccess(viewerOf(student), String(offering._id))).toBe('learn');
    }
  });

  it('hides the offering from a dropped, an unenrolled and a draft-offering student', async () => {
    const student = await makeUser();
    const viewer = viewerOf(student);
    const dropped = await makeOffering();
    await enroll(dropped._id, student._id, 'dropped');
    const draft = await makeOffering({ status: 'draft' });
    await enroll(draft._id, student._id);
    const unenrolled = await makeOffering();
    for (const offering of [dropped, draft, unenrolled]) {
      await expect(offeringAccess(viewer, String(offering._id))).rejects.toThrow(NOT_FOUND);
    }
  });

  it('answers 404 for an invalid or unknown id', async () => {
    const admin = viewerOf(await makeUser({ roles: ['admin'] }));
    await expect(offeringAccess(admin, 'not-an-id')).rejects.toThrow(NOT_FOUND);
    await expect(offeringAccess(admin, String(newId()))).rejects.toThrow(NOT_FOUND);
  });
});

describe('requireTeach', () => {
  it('allows faculty of the offering and admins, and refuses HoD and students', async () => {
    const departmentId = newId();
    const faculty = await makeUser({ roles: ['faculty'] });
    const hod = viewerOf(await makeUser({ roles: ['faculty', 'hod'], departmentId }));
    const student = await makeUser();
    const offering = await makeOffering({ departmentId, facultyIds: [faculty._id] });
    await enroll(offering._id, student._id);
    const id = String(offering._id);

    await expect(requireTeach(viewerOf(faculty), id)).resolves.toBeUndefined();
    await expect(requireTeach(viewerOf(await makeUser({ roles: ['admin'] })), id)).resolves.toBeUndefined();
    await expect(requireTeach(hod, id)).rejects.toThrow(NOT_FOUND);
    await expect(requireTeach(viewerOf(student), id)).rejects.toThrow(NOT_FOUND);
  });
});
