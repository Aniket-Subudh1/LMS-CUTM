import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';

let transport: Transporter | undefined;

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
  calendar?: { method: 'REQUEST' | 'CANCEL'; content: string };
}): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, MAIL_FROM } = env();
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  });
  const { calendar, ...mail } = message;
  // M03c T4: a calendar part that Gmail and Outlook read as an invitation (Yes · Maybe · No) and add to the calendar.
  await transport.sendMail({
    from: MAIL_FROM,
    ...mail,
    ...(calendar ? { icalEvent: { method: calendar.method, filename: 'invite.ics', content: calendar.content } } : {}),
  });
}
