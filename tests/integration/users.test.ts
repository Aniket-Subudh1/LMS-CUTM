import { beforeAll, describe, expect, it } from 'vitest';
import {
  createUser,
  importUsers,
  revokeUserSessions,
  sendResetLink,
  setUserStatus,
  updateUserRoles,
} from '@/app/(app)/admin/users/actions';
import { db } from '@/lib/db';
import { getUserDetail, listUsers } from '@/lib/data/users';
import { AuditLog } from '@/lib/models/audit-log';
import { Batch } from '@/lib/models/batch';
import { Department } from '@/lib/models/department';
import { Program } from '@/lib/models/program';
import { User } from '@/lib/models/user';
import { mailQueue } from '@/lib/queue';
import { form, makeUser, newId, signInAs } from '../factories';
import { switchBrowser } from '../next-request';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const redirectsTo = (path: string) => ({ digest: expect.stringMatching(new RegExp(`;${path};`)) });
const USER_PAGE = { ok: true, data: { next: expect.stringMatching(/^\/admin\/users\/[a-f\d]{24}$/) } };

beforeAll(async () => {
  await db();
  await Promise.all([AuditLog, Batch, Department, Program, User].map((m) => m.createCollection()));
  await Promise.all([User, Batch].map((m) => m.syncIndexes()));
});

let seq = 0;
const next = () => ++seq;

// A department, a programme and a 2025 batch with sections A and B.
async function setup() {
  const n = next();
  const department = await Department.create({ code: `UD${n}`, name: `Dept ${n}` });
  const program = await Program.create({
    code: `UP${n}`,
    name: `Programme ${n}`,
    departmentId: department._id,
    durationSemesters: 8,
  });
  const batch = await Batch.create({
    programId: program._id,
    name: `Batch ${n}`,
    startYear: 2025,
    sections: ['A', 'B'],
  });
  return { n, department, program, batch };
}

const asAdmin = async () => {
  const admin = await makeUser({ roles: ['admin'] });
  await signInAs(admin);
  return admin;
};

// The ids named by invitation jobs still waiting in the queue.
async function invited(): Promise<string[]> {
  const jobs = await mailQueue().getJobs(['waiting', 'delayed', 'prioritized']);
  return jobs.flatMap((j) => ('kind' in j.data && j.data.kind === 'invitation' ? j.data.userIds : []));
}

describe('createUser', () => {
  it('is for admins only', async () => {
    const s = await setup();
    const fields = { name: 'New', email: `new${s.n}@cutm.test`, 'roles[]': ['support'] };
    switchBrowser(new Map());
    expect(await createUser(form(fields))).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    await signInAs(await makeUser({ roles: ['support'] }));
    expect(await createUser(form(fields))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await User.countDocuments({ email: fields.email })).toBe(0);
  });

  it('creates an invited student with the programme taken from the batch, audits and queues the invitation', async () => {
    const admin = await asAdmin();
    const s = await setup();
    const email = `student${s.n}@cutm.test`;
    expect(
      await createUser(
        form({
          name: 'Asha Mohanty',
          email: ` ${email.toUpperCase()} `,
          'roles[]': ['student'],
          rollNo: `R${s.n}`,
          batchId: String(s.batch._id),
          section: 'A',
        }),
      ),
    ).toMatchObject(USER_PAGE);
    const user = await User.findOne({ email });
    expect(user).toMatchObject({ status: 'invited', roles: ['student'], rollNo: `R${s.n}`, section: 'A' });
    expect(user?.programId).toEqual(s.program._id);
    expect(user?.batchId).toEqual(s.batch._id);
    const audit = await AuditLog.findOne({ action: 'user.created', entityId: user?._id });
    expect(audit).toMatchObject({ actorId: admin._id, after: { roles: ['student'], status: 'invited' } });
    expect(await invited()).toContain(String(user?._id));
  });

  it('creates faculty with a department', async () => {
    await asAdmin();
    const s = await setup();
    expect(
      await createUser(
        form({
          name: 'Dr Rao',
          email: `rao${s.n}@cutm.test`,
          'roles[]': ['faculty', 'hod'],
          employeeId: `E${s.n}`,
          departmentId: String(s.department._id),
        }),
      ),
    ).toMatchObject(USER_PAGE);
    expect(await User.findOne({ email: `rao${s.n}@cutm.test` })).toMatchObject({
      roles: ['faculty', 'hod'],
      employeeId: `E${s.n}`,
    });
  });

  it('reports what is missing for each role, and a section the batch does not have', async () => {
    await asAdmin();
    const s = await setup();
    const student = await createUser(form({ name: 'S', email: `a${s.n}@cutm.test`, 'roles[]': ['student'] }));
    expect(student).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { rollNo: expect.any(Array), batchId: expect.any(Array) },
    });
    const staff = await createUser(form({ name: 'S', email: `b${s.n}@cutm.test`, 'roles[]': ['faculty'] }));
    expect(staff).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { employeeId: expect.any(Array), departmentId: expect.any(Array) },
    });
    const section = await createUser(
      form({
        name: 'S',
        email: `c${s.n}@cutm.test`,
        'roles[]': ['student'],
        rollNo: `R${s.n}`,
        batchId: String(s.batch._id),
        section: 'Z',
      }),
    );
    expect(section).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { section: [expect.stringContaining('Z')] },
    });
    expect(
      await User.countDocuments({ email: { $in: [`a${s.n}@cutm.test`, `b${s.n}@cutm.test`, `c${s.n}@cutm.test`] } }),
    ).toBe(0);
  });

  it('refuses a repeated email, roll number or employee id', async () => {
    await asAdmin();
    const s = await setup();
    const fields = {
      name: 'Dup',
      'roles[]': ['student'],
      batchId: String(s.batch._id),
      section: 'A',
    };
    expect(await createUser(form({ ...fields, email: `dup${s.n}@cutm.test`, rollNo: `R${s.n}` }))).toMatchObject(
      USER_PAGE,
    );
    expect(await createUser(form({ ...fields, email: `dup${s.n}@cutm.test`, rollNo: `X${s.n}` }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      message: expect.stringContaining('email'),
    });
    expect(await createUser(form({ ...fields, email: `other${s.n}@cutm.test`, rollNo: `R${s.n}` }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      message: expect.stringContaining('roll number'),
    });
    expect(await User.countDocuments({ email: `other${s.n}@cutm.test` })).toBe(0);
  });
});

describe('importUsers', () => {
  const file = (csv: string) => form({ file: new File([csv], 'users.csv', { type: 'text/csv' }) });

  it('is for admins only', async () => {
    await signInAs(await makeUser({ roles: ['support'] }));
    expect(await importUsers(file('role,name,email\nsupport,A,a@cutm.test'))).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('creates new users as invited, updates existing ones in place and writes one audit entry', async () => {
    await asAdmin();
    const s = await setup();
    const existing = await makeUser({
      email: `old${s.n}@cutm.test`,
      roles: ['faculty'],
      status: 'active',
      name: 'Old name',
      employeeId: `E${s.n}`,
      departmentId: s.department._id,
    });
    const csv = [
      'role,name,email,rollNo,program,batchStartYear,section,employeeId,department',
      `student,Asha,asha${s.n}@cutm.test,R${s.n},${s.program.code.toLowerCase()},2025,A,,`,
      `faculty,New name,old${s.n}@cutm.test,,,,,E${s.n},${s.department.code}`,
      `support,Help Desk,help${s.n}@cutm.test,,,,,,`,
    ].join('\n');

    expect(await importUsers(file(csv))).toMatchObject({ ok: true });

    const asha = await User.findOne({ email: `asha${s.n}@cutm.test` });
    expect(asha).toMatchObject({ status: 'invited', roles: ['student'], section: 'A', sessionVersion: 1 });
    expect(asha?.batchId).toEqual(s.batch._id);
    expect(asha?.programId).toEqual(s.program._id);
    expect(await User.findById(existing._id)).toMatchObject({ name: 'New name', status: 'active' });
    expect(await User.findOne({ email: `help${s.n}@cutm.test` })).toMatchObject({
      roles: ['support'],
      status: 'invited',
    });

    const queued = await invited();
    expect(queued).toContain(String(asha?._id));
    expect(queued).not.toContain(String(existing._id));
    const audit = await AuditLog.find({ action: 'user.imported', 'after.created': 2, 'after.updated': 1 });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity: 'user_import', after: { rows: 3 } });
  });

  it('saves nothing when any row is wrong and lists every problem', async () => {
    await asAdmin();
    const s = await setup();
    const taken = await makeUser({ email: `taken${s.n}@cutm.test`, rollNo: `T${s.n}` });
    const admin = await makeUser({ roles: ['admin'], email: `boss${s.n}@cutm.test` });
    const csv = [
      'role,name,email,rollNo,program,batchStartYear,section,employeeId,department',
      `student,Good,good${s.n}@cutm.test,G${s.n},${s.program.code},2025,A,,`,
      `student,Bad program,p${s.n}@cutm.test,P${s.n},NOPE,2025,A,,`,
      `student,Bad year,y${s.n}@cutm.test,Y${s.n},${s.program.code},2019,A,,`,
      `student,Bad section,s${s.n}@cutm.test,S${s.n},${s.program.code},2025,Q,,`,
      `student,Taken roll,t${s.n}@cutm.test,T${s.n},${s.program.code},2025,A,,`,
      `faculty,Bad dept,f${s.n}@cutm.test,,,,,F${s.n},NOPE`,
      `student,Admin,${admin.email},A${s.n},${s.program.code},2025,A,,`,
    ].join('\n');

    const result = await importUsers(file(csv));
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' });
    const rows = !result.ok ? (result.fieldErrors?.file ?? []) : [];
    expect(rows).toHaveLength(6);
    expect(rows[0]).toContain('Row 2');
    expect(rows.join('\n')).toMatch(/Row 4.*not a section/);
    expect(rows.join('\n')).toMatch(/Row 5.*belongs to another user/);
    expect(rows.join('\n')).toMatch(/Row 6.*no department/);
    expect(rows.join('\n')).toMatch(/Row 7.*Administrator/);
    expect(await User.countDocuments({ email: `good${s.n}@cutm.test` })).toBe(0);
    expect(await User.findById(taken._id)).toMatchObject({ rollNo: `T${s.n}` });
    expect(await AuditLog.countDocuments({ action: 'user.imported', 'after.rows': 7 })).toBe(0);
  });

  it('rejects a file with a missing column or no rows', async () => {
    await asAdmin();
    expect(await importUsers(file('role,name\nstudent,A'))).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await importUsers(file('role,name,email\n'))).toMatchObject({ ok: false, code: 'VALIDATION' });
  });
});

describe('updateUserRoles', () => {
  it('changes roles and audits the before and after', async () => {
    const admin = await asAdmin();
    const s = await setup();
    const user = await makeUser({ roles: ['faculty'], employeeId: `E${s.n}`, departmentId: s.department._id });
    expect(await updateUserRoles(form({ userId: String(user._id), 'roles[]': ['faculty', 'hod'] }))).toMatchObject({
      ok: true,
    });
    expect(await User.findById(user._id)).toMatchObject({ roles: ['faculty', 'hod'] });
    expect(await AuditLog.findOne({ action: 'user.roles_changed', entityId: user._id })).toMatchObject({
      actorId: admin._id,
      before: { roles: ['faculty'] },
      after: { roles: ['faculty', 'hod'] },
    });
  });

  it('needs at least one role, a batch for a student and a department for a head of department', async () => {
    await asAdmin();
    const user = await makeUser({ roles: ['support'] });
    expect(await updateUserRoles(form({ userId: String(user._id) }))).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await updateUserRoles(form({ userId: String(user._id), 'roles[]': ['student'] }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await updateUserRoles(form({ userId: String(user._id), 'roles[]': ['hod'] }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await User.findById(user._id)).toMatchObject({ roles: ['support'] });
  });

  it('keeps the last active administrator', async () => {
    await User.updateMany({ roles: 'admin' }, { $set: { status: 'disabled' } });
    const only = await makeUser({ roles: ['admin'] });
    await signInAs(only);
    expect(await updateUserRoles(form({ userId: String(only._id), 'roles[]': ['support'] }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(await User.findById(only._id)).toMatchObject({ roles: ['admin'] });
    const second = await makeUser({ roles: ['admin'] });
    expect(await updateUserRoles(form({ userId: String(second._id), 'roles[]': ['support'] }))).toMatchObject({
      ok: true,
    });
  });

  it('is NOT_FOUND for an unknown user', async () => {
    await asAdmin();
    expect(await updateUserRoles(form({ userId: String(newId()), 'roles[]': ['support'] }))).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });
});

describe('setUserStatus', () => {
  it('disables, signing the user out everywhere, and enables again', async () => {
    await asAdmin();
    const user = await makeUser({ roles: ['support'] });
    await User.updateOne({ _id: user._id }, { $set: { passwordHash: 'x' } });
    expect(await setUserStatus(form({ userId: String(user._id), status: 'disabled' }))).toMatchObject({ ok: true });
    expect(await User.findById(user._id)).toMatchObject({
      status: 'disabled',
      sessionVersion: user.sessionVersion + 1,
    });
    expect(await setUserStatus(form({ userId: String(user._id), status: 'disabled' }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(await setUserStatus(form({ userId: String(user._id), status: 'active' }))).toMatchObject({ ok: true });
    expect(await User.findById(user._id)).toMatchObject({ status: 'active' });
    expect(
      await AuditLog.find({ entityId: user._id, action: { $in: ['user.disabled', 'user.enabled'] } }),
    ).toHaveLength(2);
    expect(await setUserStatus(form({ userId: String(user._id), status: 'active' }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
  });

  it('returns someone who never set a password to invited', async () => {
    await asAdmin();
    const user = await makeUser({ roles: ['support'], status: 'invited' });
    await setUserStatus(form({ userId: String(user._id), status: 'disabled' }));
    await setUserStatus(form({ userId: String(user._id), status: 'active' }));
    expect(await User.findById(user._id)).toMatchObject({ status: 'invited' });
  });

  it('will not disable the last active administrator', async () => {
    await User.updateMany({ roles: 'admin' }, { $set: { status: 'disabled' } });
    const only = await makeUser({ roles: ['admin'] });
    await signInAs(only);
    expect(await setUserStatus(form({ userId: String(only._id), status: 'disabled' }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(await User.findById(only._id)).toMatchObject({ status: 'active' });
  });
});

describe('revokeUserSessions', () => {
  it('bumps the session version and audits it', async () => {
    await asAdmin();
    const user = await makeUser({ roles: ['support'] });
    expect(await revokeUserSessions(form({ userId: String(user._id) }))).toMatchObject({ ok: true });
    expect(await User.findById(user._id)).toMatchObject({ sessionVersion: user.sessionVersion + 1 });
    expect(await AuditLog.countDocuments({ action: 'user.sessions_revoked', entityId: user._id })).toBe(1);
    expect(await revokeUserSessions(form({ userId: String(newId()) }))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('is not available to support', async () => {
    const user = await makeUser({ roles: ['student'] });
    await signInAs(await makeUser({ roles: ['support'] }));
    expect(await revokeUserSessions(form({ userId: String(user._id) }))).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(await User.findById(user._id)).toMatchObject({ sessionVersion: user.sessionVersion });
  });
});

describe('sendResetLink', () => {
  async function queuedFor(to: string) {
    const jobs = await mailQueue().getJobs(['waiting', 'delayed', 'prioritized']);
    return jobs.map((j) => j.data).filter((d) => 'to' in d && d.to === to);
  }

  it('lets support queue a reset email for an active user', async () => {
    await signInAs(await makeUser({ roles: ['support'] }));
    const user = await makeUser({ roles: ['student'], email: 'reset-me@cutm.test' });
    expect(await sendResetLink(form({ userId: String(user._id) }))).toMatchObject({ ok: true });
    expect(await queuedFor('reset-me@cutm.test')).toHaveLength(1);
  });

  it('refuses a disabled account and other roles', async () => {
    const user = await makeUser({ roles: ['student'], status: 'disabled', email: 'off@cutm.test' });
    await signInAs(await makeUser({ roles: ['admin'] }));
    expect(await sendResetLink(form({ userId: String(user._id) }))).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await queuedFor('off@cutm.test')).toHaveLength(0);
    await signInAs(await makeUser({ roles: ['faculty'] }));
    expect(await sendResetLink(form({ userId: String(user._id) }))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('reads', () => {
  it('lists users for admin and support only, and filters by role, status and search', async () => {
    const s = await setup();
    const student = await makeUser({
      name: 'Ipsita Quillfeather',
      email: `ipsita${s.n}@cutm.test`,
      rollNo: `IQ${s.n}`,
      status: 'invited',
    });
    await makeUser({ name: 'Ipsita Other', roles: ['faculty'], email: `other-ipsita${s.n}@cutm.test` });

    await signInAs(await makeUser({ roles: ['support'] }));
    const byName = await listUsers(1, { q: 'Quillfeather' });
    expect(byName.rows.map((r) => r.id)).toEqual([String(student._id)]);
    expect((await listUsers(1, { q: `IPSITA${s.n}@cutm.test` })).rows.map((r) => r.id)).toEqual([String(student._id)]);
    expect((await listUsers(1, { q: 'Ipsita', role: 'faculty' })).rows).toHaveLength(1);
    expect((await listUsers(1, { q: 'Quillfeather', status: 'active' })).rows).toHaveLength(0);
    expect(byName.rows[0]).toMatchObject({ identifier: `IQ${s.n}`, status: 'invited' });

    await signInAs(await makeUser({ roles: ['faculty'] }));
    await expect(listUsers(1, {})).rejects.toMatchObject(redirectsTo('/home'));
    await expect(getUserDetail(String(student._id))).rejects.toMatchObject(redirectsTo('/home'));
  });

  it('shows a user with department, batch and enrolments, and 404s an unknown or malformed id', async () => {
    const s = await setup();
    const student = await makeUser({
      roles: ['student'],
      departmentId: s.department._id,
      programId: s.program._id,
      batchId: s.batch._id,
      section: 'A',
      rollNo: `D${s.n}`,
    });
    await signInAs(await makeUser({ roles: ['support'] }));
    expect(await getUserDetail(String(student._id))).toMatchObject({
      rollNo: `D${s.n}`,
      department: s.department.name,
      batch: s.batch.name,
      section: 'A',
      enrollments: [],
    });
    await expect(getUserDetail(String(newId()))).rejects.toMatchObject({ digest: NOT_FOUND });
    await expect(getUserDetail('nope')).rejects.toMatchObject({ digest: NOT_FOUND });
  });
});
