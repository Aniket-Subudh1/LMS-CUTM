import type { MailSend } from '@/lib/schemas/jobs';

type Recipient = { to: string; name: string; link: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function compose(to: string, subject: string, paragraphs: string[], action: { label: string; href: string }): MailSend {
  return {
    to,
    subject,
    text: `${paragraphs.join('\n\n')}\n\n${action.label}: ${action.href}\n`,
    html:
      paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('') +
      `<p><a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a></p>`,
  };
}

export function invitationEmail({ to, name, link }: Recipient): MailSend {
  return compose(
    to,
    'Your CUTM LMS account',
    [
      `Hello ${name},`,
      'An account has been created for you on the CUTM LMS. Set your password to sign in. This link is valid for 7 days.',
    ],
    { label: 'Set your password', href: link },
  );
}

export function resetEmail({ to, name, link }: Recipient): MailSend {
  return compose(
    to,
    'Reset your CUTM LMS password',
    [
      `Hello ${name},`,
      'We received a request to reset your password. This link is valid for 30 minutes and works once.',
      'If you did not ask for this, ignore this email; your password stays the same.',
    ],
    { label: 'Reset your password', href: link },
  );
}

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

// TP-03: the one-time code a guest confirms. It is in the subject too, so a phone's notification shows it.
export function guestCodeEmail(mail: { to: string; name: string; code: string; test: string; link: string }): MailSend {
  return compose(
    mail.to,
    `${mail.code} is your code for ${mail.test}`,
    [
      `Hello ${mail.name},`,
      `Your code is ${mail.code}. Enter it on the test's page to continue. It works for 10 minutes.`,
      'If you did not ask for this, ignore this email.',
    ],
    { label: 'Back to the test', href: mail.link },
  );
}

// TP-01: an invitation to a test, sent by its owner to a list of addresses.
export function testInvitationEmail(mail: {
  to: string;
  test: string;
  from: string;
  opensAt: Date;
  closesAt: Date;
  link: string;
}): MailSend {
  return compose(
    mail.to,
    `You are invited: ${mail.test}`,
    [
      'Hello,',
      `${mail.from} has invited you to take “${mail.test}” on the CUTM LMS.`,
      `It opens on ${dateTimeFormat.format(mail.opensAt)} and closes on ${dateTimeFormat.format(mail.closesAt)} (Indian Standard Time).`,
      'Open the link to sign in or register with this email address.',
    ],
    { label: 'Open the test', href: mail.link },
  );
}

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const clockFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
const meetingWhen = (start: Date, end: Date) =>
  `${dayFormat.format(start)}, ${clockFormat.format(start)}–${clockFormat.format(end)}`;

// M03c T4: a meeting's invitation, its update or its cancellation, with the calendar file (06 §8.7). A guest's link is
// theirs alone and leads to the lobby; a member's opens the meeting after sign-in.
export function meetingEmail(mail: {
  to: string;
  name: string | null;
  method: 'REQUEST' | 'CANCEL';
  changed: boolean;
  title: string;
  start: Date;
  end: Date;
  hosts: string[];
  invitedBy: string;
  link: string;
  guest: boolean;
  ics: string;
}): MailSend {
  const when = meetingWhen(mail.start, mail.end);
  const hello = mail.name ? `Hello ${mail.name},` : 'Hello,';
  const message =
    mail.method === 'CANCEL'
      ? compose(
          mail.to,
          `Cancelled: ${mail.title}`,
          [hello, `“${mail.title}” on ${when} (Indian Standard Time) is cancelled or you are no longer invited.`],
          { label: 'Open the CUTM LMS', href: mail.link },
        )
      : compose(
          mail.to,
          `${mail.changed ? 'Updated invitation' : 'Invitation'}: ${mail.title}`,
          [
            hello,
            mail.changed
              ? `${mail.invitedBy} changed the meeting “${mail.title}”.`
              : `${mail.invitedBy} invited you to the meeting “${mail.title}” on the CUTM LMS.`,
            `When: ${when} (Indian Standard Time).`,
            `Hosts: ${mail.hosts.join(', ')}.`,
            mail.guest
              ? 'This link is yours alone. When you open it, you type your name and ask to join; a host lets you in. It works while the meeting runs.'
              : 'The link opens the meeting after you sign in to the LMS.',
          ],
          { label: 'Join the meeting', href: mail.link },
        );
  return { ...message, calendar: { method: mail.method, content: mail.ics } };
}

export type CoursePlanMail = {
  to: string;
  name: string;
  courseHref: string;
  courseCode: string;
  courseTitle: string;
  // T-P-Pj, as CUTM prints it ("3-0-1").
  credits: string;
  calendar: { date: Date; topic: string; cos: string[] }[];
  modules: { title: string; hours: string | null; topics: string; practicals: string[] }[];
  projects: string[];
  textbooks: string[];
  references: string[];
  syllabusPdfHref: string | null;
  objectives: string[];
  cos: { code: string; statement: string; bloomLevels: string[] }[];
  // The offering programme's titled outcomes (PO1–PO12, PSO1–PSO3).
  outcomes: { code: string; title: string }[];
};

// Inline styles only: mail clients drop <style> blocks.
const H2 = 'font-size:16px;margin:28px 0 10px;color:#1f2430';
const H3 = 'font-size:14px;margin:16px 0 4px;color:#1f2430';
const MUTED = 'color:#646a7a';
const CELL = 'padding:8px 10px;border-bottom:1px solid #e6e8ee;text-align:left;vertical-align:top;font-size:14px';
const HEAD = `${CELL};color:#646a7a;font-weight:600;font-size:12px`;

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return `<p style="${MUTED}">None yet.</p>`;
  const tr = (cells: string[], style: string, tag: string) =>
    `<tr>${cells.map((cell) => `<${tag} style="${style}">${escapeHtml(cell)}</${tag}>`).join('')}</tr>`;
  return (
    '<table role="presentation" style="width:100%;border-collapse:collapse">' +
    `<thead>${tr(headers, HEAD, 'th')}</thead><tbody>${rows.map((row) => tr(row, CELL, 'td')).join('')}</tbody></table>`
  );
}

const list = (items: readonly string[]) =>
  `<ul style="margin:4px 0;padding-left:20px">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
const lines = (rows: string[][]) => rows.map((row) => `- ${row.join(' · ')}`).join('\n') || '- None yet.';
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const moduleHeading = (m: CoursePlanMail['modules'][number]) => `${m.title}${m.hours ? ` (${m.hours} hours)` : ''}`;

// COM-01: calendar, syllabus, objectives, course outcomes and programme outcomes, emailed to each student. Since
// M01b the syllabus is the catalogue course's modules, projects and books.
export function coursePlanEmail(mail: CoursePlanMail): MailSend {
  const course = `${mail.courseCode} ${mail.courseTitle}`;
  const calendar = mail.calendar.map((row) => [dateFormat.format(row.date), row.topic, row.cos.join(', ') || '–']);
  const cos = mail.cos.map((co) => [co.code, co.statement, co.bloomLevels.map(capital).join(', ') || '–']);
  const outcomes = mail.outcomes.map((o) => [o.code, o.title]);
  const objectives = mail.objectives.map((objective, i) => [String(i + 1), objective]);
  const intro = `Your teacher has published the course plan for ${course} (credits ${mail.credits}). It lists every session in order, the syllabus and what you will be able to do by the end of the course.`;
  const hasSyllabus = mail.modules.length > 0 || mail.projects.length > 0;

  const syllabusText = [
    ...mail.modules.map((m) =>
      [moduleHeading(m), m.topics, ...m.practicals.map((p) => `  Practical: ${p}`)].filter(Boolean).join('\n'),
    ),
    ...(mail.projects.length ? [`Projects:\n${mail.projects.map((p) => `  - ${p}`).join('\n')}`] : []),
    ...(mail.textbooks.length ? [`Textbooks:\n${mail.textbooks.map((b) => `  - ${b}`).join('\n')}`] : []),
    ...(mail.references.length ? [`References:\n${mail.references.map((b) => `  - ${b}`).join('\n')}`] : []),
  ].join('\n\n');
  const syllabusHtml =
    mail.modules
      .map(
        (m) =>
          `<h3 style="${H3}">${escapeHtml(moduleHeading(m))}</h3>` +
          (m.topics ? `<p style="margin:0;white-space:pre-line">${escapeHtml(m.topics)}</p>` : '') +
          (m.practicals.length ? `<p style="margin:8px 0 0;${MUTED}">Practicals</p>${list(m.practicals)}` : ''),
      )
      .join('') +
    (mail.projects.length ? `<h3 style="${H3}">Projects</h3>${list(mail.projects)}` : '') +
    (mail.textbooks.length ? `<h3 style="${H3}">Textbooks</h3>${list(mail.textbooks)}` : '') +
    (mail.references.length ? `<h3 style="${H3}">References</h3>${list(mail.references)}` : '');

  const text = [
    `Hello ${mail.name},`,
    intro,
    `COURSE CALENDAR\n${lines(calendar)}`,
    `SYLLABUS\n${syllabusText || 'Not added yet.'}${mail.syllabusPdfHref ? `\nPDF: ${mail.syllabusPdfHref}` : ''}`,
    `COURSE OBJECTIVES\n${lines(objectives)}`,
    `COURSE OUTCOMES\n${lines(cos)}`,
    `PROGRAM OUTCOMES\n${lines(outcomes)}`,
    `Open the course: ${mail.courseHref}`,
  ].join('\n\n');

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2430;max-width:640px;margin:0 auto;line-height:1.5">' +
    `<p style="font-size:12px;${MUTED};margin:0">Course plan</p>` +
    `<h1 style="font-size:20px;margin:4px 0 16px">${escapeHtml(course)}</h1>` +
    `<p>Hello ${escapeHtml(mail.name)},</p><p>${escapeHtml(intro)}</p>` +
    `<p><a href="${escapeHtml(mail.courseHref)}" style="display:inline-block;background:#1c59e4;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open the course</a></p>` +
    `<h2 style="${H2}">Course calendar</h2>${table(['Date', 'Topic', 'Outcomes'], calendar)}` +
    `<h2 style="${H2}">Syllabus</h2>${hasSyllabus || mail.textbooks.length || mail.references.length ? syllabusHtml : `<p style="${MUTED}">Not added yet.</p>`}` +
    (mail.syllabusPdfHref
      ? `<p><a href="${escapeHtml(mail.syllabusPdfHref)}">Download the syllabus (PDF)</a></p>`
      : '') +
    `<h2 style="${H2}">Course objectives</h2>${table(['#', 'Objective'], objectives)}` +
    `<h2 style="${H2}">Course outcomes</h2>${table(['Code', 'By the end you can', 'Bloom level'], cos)}` +
    `<h2 style="${H2}">Program outcomes</h2>${table(['Code', 'Outcome'], outcomes)}` +
    '</div>';

  return { to: mail.to, subject: `Course plan: ${course}`, text, html };
}
