import type { MailSend } from '@/lib/schemas/jobs';

type Recipient = { to: string; name: string; link: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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
