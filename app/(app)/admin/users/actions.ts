'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { queueResetLink } from '@/lib/auth/tokens';
import { db } from '@/lib/db';
import { formatCsvErrors, parseUsersCsv, type CsvError } from '@/lib/domain/csv';
import { AppError, csvRejected } from '@/lib/errors';
import { Batch } from '@/lib/models/batch';
import { Department } from '@/lib/models/department';
import { Program } from '@/lib/models/program';
import { User } from '@/lib/models/user';
import { mailQueue } from '@/lib/queue';
import { CreateUser, ImportUsers, SetUserStatus, UpdateUserRoles, UserIdInput } from '@/lib/schemas/structure';

const MINUTE = 60_000;
const INVITE_CHUNK = 500;

// Invitations go out through the worker, 500 users per job (06 §6).
async function enqueueInvitations(userIds: string[]): Promise<void> {
  const bucket = Math.floor(Date.now() / MINUTE);
  for (let i = 0; i < userIds.length; i += INVITE_CHUNK) {
    const chunk = userIds.slice(i, i + INVITE_CHUNK);
    await mailQueue().add(
      'fanout',
      { kind: 'invitation', userIds: chunk },
      { jobId: `invitation-${chunk[0]}-${bucket}` },
    );
  }
}

const invalid = (fieldErrors: Record<string, string[]>) =>
  new AppError('VALIDATION', 'Please correct the highlighted fields.', fieldErrors);

export const createUser = action({ input: CreateUser, roles: ['admin'] }, async (input, viewer) => {
  const { 'roles[]': roles, name, email, rollNo, employeeId, departmentId, batchId, section } = input;
  const isStudent = roles.includes('student');
  const isStaff = roles.includes('faculty') || roles.includes('hod');
  const problems: Record<string, string[]> = {};
  if (isStudent && !rollNo) problems.rollNo = ['Roll number is required for students.'];
  if (isStudent && !batchId) problems.batchId = ['Choose the student’s batch.'];
  if (isStaff && !employeeId) problems.employeeId = ['Employee id is required for faculty and HoD.'];
  if (isStaff && !departmentId) problems.departmentId = ['Choose the department.'];
  await db();
  const batch = isStudent && batchId ? await Batch.findById(batchId, { programId: 1, sections: 1 }).lean() : null;
  if (isStudent && batchId && !batch) problems.batchId = ['Choose an existing batch.'];
  if (batch && (!section || !batch.sections.includes(section))) {
    problems.section = [
      section
        ? `${section} is not a section of that batch. Add it to the batch first.`
        : 'Section is required for students.',
    ];
  }
  if (isStaff && departmentId && !(await Department.exists({ _id: departmentId }))) {
    problems.departmentId = ['Choose an existing department.'];
  }
  if (Object.keys(problems).length > 0) throw invalid(problems);

  const same = await User.findOne(
    {
      $or: [
        { email },
        ...(isStudent && rollNo ? [{ rollNo }] : []),
        ...(isStaff && employeeId ? [{ employeeId }] : []),
      ],
    },
    { email: 1, rollNo: 1, employeeId: 1 },
  ).lean();
  if (same) {
    const what =
      same.email === email
        ? `email ${email}`
        : same.rollNo === rollNo
          ? `roll number ${rollNo}`
          : `employee id ${employeeId}`;
    throw new AppError('CONFLICT', `A user with ${what} already exists.`);
  }

  const created = await mongoose.connection.transaction(async (session) => {
    const [user] = await User.create(
      [
        {
          name,
          email,
          roles,
          status: 'invited',
          ...(isStudent ? { rollNo, batchId, programId: batch?.programId, section } : {}),
          ...(isStaff ? { employeeId, departmentId } : {}),
        },
      ],
      { session },
    );
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'user.created',
        entity: 'user',
        entityId: String(user._id),
        after: { roles, status: 'invited' },
      },
      session,
    );
    return String(user._id);
  });
  await enqueueInvitations([created]);
  redirect(`/admin/users/${created}`);
});

export const importUsers = action({ input: ImportUsers, roles: ['admin'] }, async ({ file }, viewer) => {
  const parsed = parseUsersCsv(await file.text());
  if (!parsed.ok) throw csvRejected(formatCsvErrors(parsed.errors));
  await db();
  const { rows } = parsed;

  const students = rows.flatMap((r) => (r.role === 'student' ? [r] : []));
  const staff = rows.flatMap((r) => (r.role === 'faculty' || r.role === 'hod' ? [r] : []));
  const [departments, programs, existing, owners] = await Promise.all([
    Department.find({ code: { $in: staff.map((r) => r.department) } }, { code: 1 }).lean(),
    Program.find({ code: { $in: students.map((r) => r.program) } }, { code: 1 }).lean(),
    User.find({ email: { $in: rows.map((r) => r.email) } }, { email: 1, roles: 1 }).lean(),
    User.find(
      {
        $or: [
          { rollNo: { $in: students.map((r) => r.rollNo) } },
          { employeeId: { $in: staff.map((r) => r.employeeId) } },
        ],
      },
      { email: 1, rollNo: 1, employeeId: 1 },
    ).lean(),
  ]);
  const batches = await Batch.find(
    { programId: { $in: programs.map((p) => p._id) }, startYear: { $in: students.map((r) => r.batchStartYear) } },
    { programId: 1, startYear: 1, sections: 1 },
  ).lean();
  const departmentIds = new Map(departments.map((d) => [d.code, d._id]));
  const programIds = new Map(programs.map((p) => [p.code, p._id]));
  const batchOf = new Map(batches.map((b) => [`${b.programId}:${b.startYear}`, b]));
  const existingByEmail = new Map(existing.map((u) => [u.email, u]));
  const ownerOf = new Map(
    owners.flatMap((u) => [u.rollNo, u.employeeId].flatMap((key) => (key ? [[key, u.email] as const] : []))),
  );

  const errors: CsvError[] = [];
  const ops: Parameters<typeof User.bulkWrite>[0] = [];
  for (const r of rows) {
    const found = errors.length;
    const fail = (message: string) => errors.push({ row: r.row, message });
    if (existingByEmail.get(r.email)?.roles.includes('admin'))
      fail('Administrator accounts are not changed by import.');
    let set: Record<string, unknown> = { name: r.name };
    if (r.role === 'student') {
      const programId = programIds.get(r.program);
      const batch = programId ? batchOf.get(`${programId}:${r.batchStartYear}`) : undefined;
      if (!programId) fail(`There is no program with code ${r.program}.`);
      else if (!batch) fail(`Program ${r.program} has no batch starting in ${r.batchStartYear}.`);
      else if (!batch.sections.includes(r.section))
        fail(`${r.section} is not a section of that batch. Add it to the batch first.`);
      if (ownerOf.get(r.rollNo) !== undefined && ownerOf.get(r.rollNo) !== r.email)
        fail(`Roll number ${r.rollNo} belongs to another user.`);
      set = { ...set, roles: ['student'], rollNo: r.rollNo, programId, batchId: batch?._id, section: r.section };
    } else if (r.role === 'support') {
      set = { ...set, roles: ['support'] };
    } else {
      const departmentId = departmentIds.get(r.department);
      if (!departmentId) fail(`There is no department with code ${r.department}.`);
      if (ownerOf.get(r.employeeId) !== undefined && ownerOf.get(r.employeeId) !== r.email)
        fail(`Employee id ${r.employeeId} belongs to another user.`);
      set = {
        ...set,
        roles: r.role === 'hod' ? ['faculty', 'hod'] : ['faculty'],
        employeeId: r.employeeId,
        departmentId,
      };
    }
    if (errors.length === found) {
      // Existing users keep their status and password; only new ones start as invited.
      ops.push({
        updateOne: {
          filter: { email: r.email },
          update: { $set: set, $setOnInsert: { status: 'invited', sessionVersion: 1 } },
          upsert: true,
        },
      });
    }
  }
  if (errors.length > 0) throw csvRejected(formatCsvErrors(errors));

  const invited = await mongoose.connection.transaction(async (session) => {
    const written = await User.bulkWrite(ops, { session });
    const created = Object.values(written.upsertedIds).map(String);
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'user.imported',
        entity: 'user_import',
        entityId: String(new mongoose.Types.ObjectId()),
        after: { rows: rows.length, created: created.length, updated: rows.length - created.length },
      },
      session,
    );
    return created;
  });
  await enqueueInvitations(invited);
  refresh();
});

// Counts the other active administrators; the last one cannot lose the role or be disabled.
async function requireAnotherAdmin(userId: string): Promise<void> {
  if (!(await User.exists({ roles: 'admin', status: 'active', _id: { $ne: userId } }))) {
    throw new AppError('CONFLICT', 'This is the last active administrator. Make another administrator first.');
  }
}

export const updateUserRoles = action({ input: UpdateUserRoles, roles: ['admin'] }, async (input, viewer) => {
  const { userId, 'roles[]': roles } = input;
  await db();
  const user = await User.findById(userId, { roles: 1, status: 1, batchId: 1, departmentId: 1 }).lean();
  if (!user) throw new AppError('NOT_FOUND', 'User not found.');
  if (roles.includes('student') && !user.batchId) {
    throw new AppError('VALIDATION', 'A student needs a batch, and this user has none.');
  }
  if (roles.includes('hod') && !user.departmentId) {
    throw new AppError('VALIDATION', 'A head of department needs a department, and this user has none.');
  }
  if (user.roles.includes('admin') && !roles.includes('admin') && user.status === 'active')
    await requireAnotherAdmin(userId);
  await mongoose.connection.transaction(async (session) => {
    await User.updateOne({ _id: userId }, { $set: { roles } }, { session });
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'user.roles_changed',
        entity: 'user',
        entityId: userId,
        before: { roles: user.roles },
        after: { roles },
      },
      session,
    );
  });
  refresh();
});

export const setUserStatus = action({ input: SetUserStatus, roles: ['admin'] }, async ({ userId, status }, viewer) => {
  await db();
  const user = await User.findById(userId).select('status roles +passwordHash').lean();
  if (!user) throw new AppError('NOT_FOUND', 'User not found.');
  if (status === 'disabled') {
    if (user.status === 'disabled') throw new AppError('CONFLICT', 'This account is already disabled.');
    if (user.roles.includes('admin') && user.status === 'active') await requireAnotherAdmin(userId);
  } else if (user.status !== 'disabled') {
    throw new AppError('CONFLICT', 'Only a disabled account can be enabled.');
  }
  // Someone who never set a password goes back to waiting for their invitation.
  const next = status === 'disabled' ? 'disabled' : user.passwordHash ? 'active' : 'invited';
  await mongoose.connection.transaction(async (session) => {
    await User.updateOne(
      { _id: userId },
      { $set: { status: next }, ...(next === 'disabled' ? { $inc: { sessionVersion: 1 } } : {}) },
      { session },
    );
    await writeAudit(
      {
        actorId: viewer.id,
        action: next === 'disabled' ? 'user.disabled' : 'user.enabled',
        entity: 'user',
        entityId: userId,
        before: { status: user.status },
        after: { status: next },
      },
      session,
    );
  });
  refresh();
});

// Bumping sessionVersion signs the user out everywhere; it also retires any reset or invitation link already sent.
export const revokeUserSessions = action({ input: UserIdInput, roles: ['admin'] }, async ({ userId }, viewer) => {
  await db();
  await mongoose.connection.transaction(async (session) => {
    const updated = await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } }, { session });
    if (updated.matchedCount === 0) throw new AppError('NOT_FOUND', 'User not found.');
    await writeAudit(
      { actorId: viewer.id, action: 'user.sessions_revoked', entity: 'user', entityId: userId },
      session,
    );
  });
  refresh();
});

// Staff may send a reset link without the rate limit of the public form (a person is asking, not a script).
export const sendResetLink = action({ input: UserIdInput, roles: ['admin', 'support'] }, async ({ userId }) => {
  await db();
  const user = await User.findById(userId, { name: 1, email: 1, status: 1, sessionVersion: 1 }).lean();
  if (!user) throw new AppError('NOT_FOUND', 'User not found.');
  if (user.status === 'disabled') throw new AppError('CONFLICT', 'This account is disabled. Enable it first.');
  await queueResetLink({ id: userId, name: user.name, email: user.email, sessionVersion: user.sessionVersion });
});
