import 'server-only';
import { renderRichText } from '@/lib/domain/rich-text';
import type { RichTextDoc } from '@/lib/schemas/common';
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

export type CoursePlanMail = {
  to: string;
  name: string;
  courseHref: string;
  courseCode: string;
  courseTitle: string;
  calendar: { date: Date; topic: string; cos: string[] }[];
  syllabus: RichTextDoc | null;
  syllabusPdfHref: string | null;
  objectives: string[];
  cos: { code: string; statement: string; bloomLevel: string }[];
  pos: { code: string; title: string }[];
  psos: { code: string; title: string }[];
};

// Inline styles only: mail clients drop <style> blocks.
const H2 = 'font-size:16px;margin:28px 0 10px;color:#1f2430';
const CELL = 'padding:8px 10px;border-bottom:1px solid #e6e8ee;text-align:left;vertical-align:top;font-size:14px';
const HEAD = `${CELL};color:#646a7a;font-weight:600;font-size:12px`;

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '<p style="color:#646a7a">None yet.</p>';
  const tr = (cells: string[], style: string, tag: string) =>
    `<tr>${cells.map((cell) => `<${tag} style="${style}">${escapeHtml(cell)}</${tag}>`).join('')}</tr>`;
  return (
    '<table role="presentation" style="width:100%;border-collapse:collapse">' +
    `<thead>${tr(headers, HEAD, 'th')}</thead><tbody>${rows.map((row) => tr(row, CELL, 'td')).join('')}</tbody></table>`
  );
}

const lines = (rows: string[][]) => rows.map((row) => `- ${row.join(' · ')}`).join('\n') || '- None yet.';

// The plain-text part: the document's text, one block per line (inline text runs join without a break).
type TextNode = { text?: string; content?: TextNode[] };
function plain(node: TextNode): string {
  const children = node.content ?? [];
  return node.text ?? children.map(plain).join(children.some((c) => c.text !== undefined) ? '' : '\n');
}

// COM-01: calendar, syllabus, objectives, course outcomes and programme outcomes, emailed to each student.
export function coursePlanEmail(mail: CoursePlanMail): MailSend {
  const course = `${mail.courseCode} ${mail.courseTitle}`;
  const calendar = mail.calendar.map((row) => [dateFormat.format(row.date), row.topic, row.cos.join(', ') || '–']);
  const cos = mail.cos.map((co) => [
    co.code,
    co.statement,
    co.bloomLevel.charAt(0).toUpperCase() + co.bloomLevel.slice(1),
  ]);
  const outcomes = [...mail.pos, ...mail.psos].map((o) => [o.code, o.title]);
  const objectives = mail.objectives.map((objective, i) => [String(i + 1), objective]);
  const intro = `Your teacher has published the course plan for ${course}. It lists every session in order, the syllabus and what you will be able to do by the end of the course.`;
  const syllabusText = mail.syllabus ? plain(mail.syllabus).trim() : '';

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
    `<p style="font-size:12px;color:#646a7a;margin:0">Course plan</p>` +
    `<h1 style="font-size:20px;margin:4px 0 16px">${escapeHtml(course)}</h1>` +
    `<p>Hello ${escapeHtml(mail.name)},</p><p>${escapeHtml(intro)}</p>` +
    `<p><a href="${escapeHtml(mail.courseHref)}" style="display:inline-block;background:#1c59e4;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open the course</a></p>` +
    `<h2 style="${H2}">Course calendar</h2>${table(['Date', 'Topic', 'Outcomes'], calendar)}` +
    `<h2 style="${H2}">Syllabus</h2>${mail.syllabus ? renderRichText(mail.syllabus) : '<p style="color:#646a7a">Not added yet.</p>'}` +
    (mail.syllabusPdfHref
      ? `<p><a href="${escapeHtml(mail.syllabusPdfHref)}">Download the syllabus (PDF)</a></p>`
      : '') +
    `<h2 style="${H2}">Course objectives</h2>${table(['#', 'Objective'], objectives)}` +
    `<h2 style="${H2}">Course outcomes</h2>${table(['Code', 'By the end you can', 'Level'], cos)}` +
    `<h2 style="${H2}">Program outcomes</h2>${table(['Code', 'Outcome'], outcomes)}` +
    '</div>';

  return { to: mail.to, subject: `Course plan: ${course}`, text, html };
}
