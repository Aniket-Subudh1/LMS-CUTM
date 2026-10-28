import type { MailSend } from '@/lib/schemas/jobs';

type Recipient = { to: string; name: string; link: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The LMS's own look, "B · Crisp editorial" (08 §4): Inter, the tokens of app/globals.css as hex, a white hairline card
// with small corners on the grey page, a near-black main button, small uppercase labels over hairlines. Inline styles
// and tables only: mail clients drop <style> blocks, and Outlook ignores flexbox, grid and max-width on divs.
const PRIMARY = '#1c59e4';
const INK = '#1c1c1f';
const MUTED = 'color:#5d6069';
const PAGE = '#f3f4f7';
const HAIRLINE = '#ebecee';
const DESTRUCTIVE = '#b91b25';
const FONT = "font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const LABEL = `font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase`;
const TABLE = 'role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"';
const SIGN_OFF = '\n\n—\nCenturion LMS · Centurion University of Technology and Management\n';

// `origin` is the LMS's address, taken from the email's own link, for the university lockup beside the wordmark (as on
// the sign-in screens); a client that blocks images still shows the wordmark.
function layout(mail: { origin: string; preview: string; label: string; heading: string; body: string }): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet"></head>' +
    `<body style="margin:0;padding:0;background:${PAGE};${FONT};color:${INK};-webkit-font-smoothing:antialiased">` +
    // The line an inbox shows after the subject.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(mail.preview)}</div>` +
    `<table ${TABLE} style="background:${PAGE}"><tr><td align="center" style="padding:28px 12px 36px">` +
    `<table ${TABLE} style="max-width:560px">` +
    '<tr><td style="padding:0 2px 16px"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>' +
    `<td style="padding-right:10px;vertical-align:middle"><img src="${escapeHtml(mail.origin)}/brand/logo-email.png" width="30" height="47" alt="" style="display:block;border:0"></td>` +
    '<td style="vertical-align:middle;line-height:1.3">' +
    `<div style="font-size:15px;font-weight:600;letter-spacing:-0.01em;color:${INK}">Centurion <span style="color:${PRIMARY};font-weight:700">LMS</span></div>` +
    `<div style="font-size:12px;${MUTED}">Learning Management System</div>` +
    '</td></tr></table></td></tr>' +
    `<tr><td style="background:#ffffff;border:1px solid ${HAIRLINE};border-radius:4px;padding:28px 28px 26px;font-size:14px;line-height:1.6">` +
    `<p style="margin:0 0 6px;${LABEL};${MUTED}">${escapeHtml(mail.label)}</p>` +
    `<h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:${INK}">${escapeHtml(mail.heading)}</h1>` +
    mail.body +
    '</td></tr>' +
    `<tr><td style="padding:18px 12px 0;font-size:12px;line-height:1.6;${MUTED};text-align:center">` +
    'Centurion University of Technology and Management<br>Sent by Centurion LMS</td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

const origin = (href: string) => new URL(href).origin;
const paragraph = (text: string, style = '') => `<p style="margin:0 0 14px;${style}">${escapeHtml(text)}</p>`;
const note = (text: string) => paragraph(text, `font-size:13px;${MUTED}`);

// The LMS's main button (`bg-foreground`, `rounded-md`), centred, at a size a thumb can tap.
function button(label: string, href: string): string {
  return (
    '<table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" style="margin:22px auto"><tr>' +
    `<td align="center" style="border-radius:4px;background:${INK}">` +
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 32px;font-size:14px;font-weight:500;line-height:20px;color:#ffffff;text-decoration:none;border-radius:4px">${escapeHtml(label)}</a>` +
    '</td></tr></table>'
  );
}

const fallbackLink = (href: string) =>
  `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${HAIRLINE};font-size:12px;line-height:1.5;${MUTED}">` +
  `If the button doesn't work, copy this link into your browser:<br>` +
  `<a href="${escapeHtml(href)}" style="color:${PRIMARY};text-decoration:underline;word-break:break-all">${escapeHtml(href)}</a></p>`;

// A code the reader types somewhere else, in the primary tint (`--accent`) so it is found at a glance.
// `user-select:all` makes one tap select the whole code where the client honours it; the letter spacing is styling,
// so a copy has no spaces.
function codeBox(label: string, code: string, hint: string): string {
  return (
    `<table ${TABLE} style="margin:20px 0 0"><tr>` +
    `<td align="center" style="background:#e7f1ff;border:1px solid #d2defa;border-radius:6px;padding:18px 12px 16px">` +
    `<p style="margin:0;${LABEL};color:${PRIMARY}">${escapeHtml(label)}</p>` +
    `<p style="margin:8px 0 6px;padding-left:0.3em;${MONO};font-size:30px;line-height:1.2;font-weight:600;letter-spacing:0.3em;color:${INK};-webkit-user-select:all;user-select:all">${escapeHtml(code)}</p>` +
    `<p style="margin:0;font-size:13px;${MUTED}">${escapeHtml(hint)}</p>` +
    '</td></tr></table>'
  );
}

// Label and value rows over hairlines, as the LMS's facts strips; a value's new lines become line breaks.
function facts(rows: [string, string][]): string {
  const cell = `padding:10px 0;border-top:1px solid ${HAIRLINE};vertical-align:top`;
  return (
    `<table ${TABLE} style="margin:4px 0 0;border-bottom:1px solid ${HAIRLINE}">` +
    rows
      .map(
        ([label, value]) =>
          `<tr><td style="${cell};width:88px;padding-top:12px;${LABEL};${MUTED}">${escapeHtml(label)}</td>` +
          `<td style="${cell};font-size:14px;color:${INK}">${escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`,
      )
      .join('') +
    '</table>'
  );
}

export function invitationEmail({ to, name, link }: Recipient): MailSend {
  return {
    to,
    subject: 'Welcome to Centurion LMS: set your password',
    text:
      `Hello ${name},\n\nAn account has been created for you on Centurion LMS, the university's learning platform. ` +
      `Set a password to sign in.\n\nSet your password: ${link}\n\nThe link works for 7 days.${SIGN_OFF}`,
    html: layout({
      origin: origin(link),
      preview: 'Your account is ready. Set a password to sign in.',
      label: 'Welcome',
      heading: 'Your account is ready',
      body:
        paragraph(`Hello ${name},`) +
        paragraph(
          "An account has been created for you on Centurion LMS, the university's learning platform. Set a password to sign in.",
        ) +
        button('Set your password', link) +
        note('The link works for 7 days.') +
        fallbackLink(link),
    }),
  };
}

export function resetEmail({ to, name, link }: Recipient): MailSend {
  return {
    to,
    subject: 'Reset your Centurion LMS password',
    text:
      `Hello ${name},\n\nWe received a request to reset your password.\n\nReset your password: ${link}\n\n` +
      `The link works once, for 30 minutes. If you didn't ask for this, ignore this email: your password stays the same.${SIGN_OFF}`,
    html: layout({
      origin: origin(link),
      preview: 'Choose a new password. The link works for 30 minutes.',
      label: 'Password',
      heading: 'Reset your password',
      body:
        paragraph(`Hello ${name},`) +
        paragraph('We received a request to reset your password. Choose a new one with the button below.') +
        button('Reset your password', link) +
        note(
          "The link works once, for 30 minutes. If you didn't ask for this, ignore this email: your password stays the same.",
        ) +
        fallbackLink(link),
    }),
  };
}

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

// TP-03: the one-time code a guest confirms. It is in the subject too, so a phone's notification shows it.
export function guestCodeEmail(mail: { to: string; name: string; code: string; test: string; link: string }): MailSend {
  return {
    to: mail.to,
    subject: `${mail.code} is your code for ${mail.test}`,
    text:
      `Hello ${mail.name},\n\nYour code for “${mail.test}” is:\n\n    ${mail.code}\n\n` +
      `Type it on the test's page to continue. It works for 10 minutes.\n\nBack to the test: ${mail.link}\n\n` +
      `If you didn't ask for this, ignore this email.${SIGN_OFF}`,
    html: layout({
      origin: origin(mail.link),
      preview: `Your code is ${mail.code}. It works for 10 minutes.`,
      label: 'Sign-in code',
      heading: mail.test,
      body:
        paragraph(`Hello ${mail.name},`) +
        paragraph("Here is your code. Type it on the test's page to continue.") +
        codeBox('Your code', mail.code, 'It works for 10 minutes.') +
        button('Back to the test', mail.link) +
        note("If you didn't ask for this, ignore this email.") +
        fallbackLink(mail.link),
    }),
  };
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
  const opens = `${dateTimeFormat.format(mail.opensAt)} IST`;
  const closes = `${dateTimeFormat.format(mail.closesAt)} IST`;
  return {
    to: mail.to,
    subject: `You are invited: ${mail.test}`,
    text:
      `Hello,\n\n${mail.from} has invited you to take “${mail.test}” on Centurion LMS.\n\n` +
      `Opens: ${opens}\nCloses: ${closes}\n\nOpen the test: ${mail.link}\n\n` +
      `You'll be asked to sign in, or to register with this email address if you're new.${SIGN_OFF}`,
    html: layout({
      origin: origin(mail.link),
      preview: `${mail.from} invited you. Opens ${opens}.`,
      label: 'Test invitation',
      heading: mail.test,
      body:
        paragraph('Hello,') +
        paragraph(`${mail.from} has invited you to take this test on Centurion LMS.`) +
        facts([
          ['Opens', opens],
          ['Closes', closes],
        ]) +
        button('Open the test', mail.link) +
        note("You'll be asked to sign in, or to register with this email address if you're new.") +
        fallbackLink(mail.link),
    }),
  };
}

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDayFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const clockFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
// 20261028T103000Z, as Google Calendar's link takes it.
const calendarStamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

function calendarLinks(event: { title: string; start: Date; end: Date; details: string; location: string }) {
  const google = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${calendarStamp(event.start)}/${calendarStamp(event.end)}`,
    details: event.details,
    location: event.location,
  });
  const outlook = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: event.start.toISOString(),
    enddt: event.end.toISOString(),
    body: event.details,
    location: event.location,
  });
  return {
    google: `https://calendar.google.com/calendar/render?${google}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${outlook}`,
  };
}

// The LMS's outline button.
const calendarButton = (label: string, href: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 4px 8px;padding:7px 14px;border:1px solid #e2e4e7;border-radius:4px;background:#ffffff;font-size:13px;font-weight:500;line-height:18px;color:${INK};text-decoration:none">${escapeHtml(label)}</a>`;

// M03c T4: a meeting's invitation, its update or its cancellation, with the calendar file (06 §8.7). T14 (decision 9):
// everyone's link is their own and opens the meeting with the passcode, no account needed; signed in to the LMS, a
// member's opens it as them. A meeting from before passcodes has none (A-220).
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
  passcode: string | null;
  ics: string;
}): MailSend {
  const day = dayFormat.format(mail.start);
  const time = `${clockFormat.format(mail.start)} – ${clockFormat.format(mail.end)} IST`;
  const short = `${shortDayFormat.format(mail.start)}, ${clockFormat.format(mail.start)} IST`;
  const hello = mail.name ? `Hello ${mail.name},` : 'Hello,';
  const calendar = { method: mail.method, content: mail.ics };
  // MailSend allows 200 characters; a 160-character title leaves no room for the date.
  const subject = (label: string) => {
    const full = `${label}: ${mail.title} · ${short}`;
    return full.length <= 200 ? full : `${label}: ${mail.title}`;
  };

  if (mail.method === 'CANCEL') {
    const message = `“${mail.title}” has been cancelled, or you are no longer on its guest list. There is nothing you need to do.`;
    return {
      to: mail.to,
      subject: subject('Cancelled'),
      text: `${hello}\n\n${message}\n\nMeeting: ${mail.title}\nWhen: ${day}, ${time}${SIGN_OFF}`,
      html: layout({
        origin: origin(mail.link),
        preview: `${mail.title} on ${short} is cancelled.`,
        label: 'Meeting',
        heading: mail.title,
        body:
          // The LMS's status badge: a dot and coloured text, no fill.
          `<p style="margin:-8px 0 16px;font-size:13px;font-weight:500;color:${DESTRUCTIVE}">` +
          `<span style="display:inline-block;width:6px;height:6px;margin:0 6px 1px 0;border-radius:3px;background:${DESTRUCTIVE};vertical-align:middle"></span>Cancelled</p>` +
          paragraph(hello) +
          paragraph(message) +
          facts([['When', `${day}\n${time}`]]),
      }),
      calendar,
    };
  }

  const intro = mail.changed
    ? `${mail.invitedBy} has updated this meeting. Here are the latest details.`
    : `${mail.invitedBy} has invited you to a meeting.`;
  const howToJoin = mail.guest
    ? 'No account or app is needed: the meeting opens in your web browser. Click Join meeting a few minutes before it starts.'
    : 'Click Join meeting a few minutes before it starts. If you are signed in to Centurion LMS, it takes you straight in.';
  const passcodeHint = mail.guest
    ? 'You will be asked for this code and your name when you join.'
    : 'If you are asked for a passcode, type this code.';
  const details = `Join the meeting: ${mail.link}${mail.passcode ? `\nPasscode: ${mail.passcode}` : ''}`;
  const links = calendarLinks({ title: mail.title, start: mail.start, end: mail.end, details, location: mail.link });
  const personal = 'This link is personal to you, so please do not forward this email.';

  return {
    to: mail.to,
    subject: subject(mail.changed ? 'Updated invitation' : 'Invitation'),
    text:
      `${hello}\n\n${intro}\n\n${mail.title}\nWhen: ${day}, ${time}\nHosts: ${mail.hosts.join(', ')}\n` +
      (mail.passcode ? `Passcode: ${mail.passcode}\n` : '') +
      `\nJoin the meeting: ${mail.link}\n\n${howToJoin}\n\n` +
      `To add it to your calendar, open the invite.ics file attached to this email.\n\n${personal}${SIGN_OFF}`,
    html: layout({
      origin: origin(mail.link),
      preview: `${mail.invitedBy} ${mail.changed ? 'updated' : 'invited you to'} a meeting on ${short}.`,
      label: mail.changed ? 'Updated invitation' : 'Meeting invitation',
      heading: mail.title,
      body:
        paragraph(hello) +
        paragraph(intro) +
        facts([
          ['When', `${day}\n${time}`],
          ['Hosts', mail.hosts.join(', ')],
        ]) +
        (mail.passcode ? codeBox('Meeting passcode', mail.passcode, passcodeHint) : '') +
        button('Join meeting', mail.link) +
        paragraph(howToJoin, `text-align:center;font-size:13px;${MUTED}`) +
        `<p style="margin:24px 0 10px;padding-top:20px;border-top:1px solid ${HAIRLINE};text-align:center;${LABEL};${MUTED}">Add to your calendar</p>` +
        `<p style="margin:0;text-align:center">${calendarButton('Google Calendar', links.google)}${calendarButton('Outlook', links.outlook)}</p>` +
        paragraph(
          'Apple Calendar or another app: open the invite.ics file attached to this email.',
          `margin:6px 0 0;text-align:center;font-size:12px;${MUTED}`,
        ) +
        paragraph(personal, `margin:20px 0 0;text-align:center;font-size:12px;${MUTED}`) +
        fallbackLink(mail.link),
    }),
    calendar,
  };
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

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const H2 = `font-size:15px;font-weight:600;margin:30px 0 10px;padding-top:20px;border-top:1px solid ${HAIRLINE};color:${INK}`;
const H3 = `font-size:14px;font-weight:600;margin:16px 0 4px;color:${INK}`;
const CELL = `padding:9px 10px 9px 0;border-bottom:1px solid ${HAIRLINE};text-align:left;vertical-align:top;font-size:13px`;
const HEAD = `${CELL};${LABEL};${MUTED}`;

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

  const html = layout({
    origin: origin(mail.courseHref),
    preview: `The course plan for ${course} is ready.`,
    label: 'Course plan',
    heading: course,
    body:
      paragraph(`Hello ${mail.name},`) +
      paragraph(intro) +
      button('Open the course', mail.courseHref) +
      `<h2 style="${H2}">Course calendar</h2>${table(['Date', 'Topic', 'Outcomes'], calendar)}` +
      `<h2 style="${H2}">Syllabus</h2>${hasSyllabus || mail.textbooks.length || mail.references.length ? syllabusHtml : `<p style="${MUTED}">Not added yet.</p>`}` +
      (mail.syllabusPdfHref
        ? `<p style="margin:14px 0 0"><a href="${escapeHtml(mail.syllabusPdfHref)}" style="color:${PRIMARY};font-weight:500;text-decoration:underline">Download the syllabus (PDF)</a></p>`
        : '') +
      `<h2 style="${H2}">Course objectives</h2>${table(['#', 'Objective'], objectives)}` +
      `<h2 style="${H2}">Course outcomes</h2>${table(['Code', 'By the end you can', 'Bloom level'], cos)}` +
      `<h2 style="${H2}">Program outcomes</h2>${table(['Code', 'Outcome'], outcomes)}`,
  });

  return { to: mail.to, subject: `Course plan: ${course}`, text: `${text}${SIGN_OFF}`, html };
}
