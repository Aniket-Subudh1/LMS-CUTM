import { describe, expect, it } from 'vitest';
import {
  coursePlanEmail,
  guestCodeEmail,
  invitationEmail,
  meetingEmail,
  resetEmail,
} from '@/lib/domain/email-templates';

describe('email templates', () => {
  it('escapes every interpolated value in the HTML part', () => {
    const mail = resetEmail({
      to: 'asha@cutm.ac.in',
      name: '<script>alert(1)</script>',
      link: 'http://localhost:3000/reset-password?token=a"b&c',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&#60;script&#62;alert(1)&#60;/script&#62;');
    expect(mail.html).toContain('href="http://localhost:3000/reset-password?token=a&#34;b&#38;c"');
    expect(mail.text).toContain('Reset your password: http://localhost:3000/reset-password?token=a"b&c');
  });

  it('addresses the invitation to the recipient', () => {
    const mail = invitationEmail({ to: 'ravi@cutm.ac.in', name: 'Ravi', link: 'http://x/reset-password?token=t' });
    expect(mail).toMatchObject({ to: 'ravi@cutm.ac.in', subject: 'Welcome to Centurion LMS: set your password' });
    expect(mail.html).toContain('src="http://x/brand/logo-email.png"');
    expect(mail.text).toContain('Hello Ravi,');
    expect(mail.text).toContain('Set your password: http://x/reset-password?token=t');
  });

  it('shows a guest their code in the highlighted box and leads the subject with it', () => {
    const mail = guestCodeEmail({ to: 'g@x.in', name: 'Gita', code: '482913', test: 'Quiz <1>', link: 'http://x/t/a' });
    expect(mail.subject).toBe('482913 is your code for Quiz <1>');
    expect(mail.html).toMatch(/user-select:all">482913</);
    expect(mail.html).toContain('Quiz &#60;1&#62;');
  });

  const meeting = {
    to: 'rao@gmail.com',
    name: 'Rao',
    changed: false,
    title: 'Review & <plan>',
    start: new Date('2026-10-28T10:30:00Z'),
    end: new Date('2026-10-28T11:30:00Z'),
    hosts: ['Dr Asha Nayak'],
    invitedBy: 'Dr Asha Nayak',
    link: 'https://lms.cutm.ac.in/m/abc.def',
    guest: true,
    passcode: '123456',
    ics: 'BEGIN:VCALENDAR',
  };

  it('invites to a meeting with the time in IST, the passcode box and links to add it to a calendar', () => {
    const mail = meetingEmail({ ...meeting, method: 'REQUEST' });
    expect(mail.subject).toBe('Invitation: Review & <plan> · Wed, 28 Oct, 4:00 pm IST');
    expect(mail.calendar).toEqual({ method: 'REQUEST', content: 'BEGIN:VCALENDAR' });
    expect(mail.html).toContain('Wednesday, 28 October 2026<br>4:00 pm – 5:00 pm IST');
    expect(mail.html).toMatch(/user-select:all">123456</);
    expect(mail.html).toContain('href="https://lms.cutm.ac.in/m/abc.def"');
    expect(mail.html).toContain('Review &#38; &#60;plan&#62;');
    expect(mail.html).not.toContain('<plan>');

    const google = /href="(https:\/\/calendar\.google\.com\/[^"]+)"/.exec(mail.html)?.[1].replace(/&#38;/g, '&');
    const params = new URL(google ?? 'https://x').searchParams;
    expect(params.get('text')).toBe('Review & <plan>');
    expect(params.get('dates')).toBe('20261028T103000Z/20261028T113000Z');
    expect(params.get('details')).toBe('Join the meeting: https://lms.cutm.ac.in/m/abc.def\nPasscode: 123456');
    expect(mail.html).toContain('href="https://outlook.live.com/calendar/0/deeplink/compose?');

    expect(mail.text).toContain('Join the meeting: https://lms.cutm.ac.in/m/abc.def');
    expect(mail.text).toContain('Passcode: 123456');
  });

  it('keeps a meeting subject within 200 characters, dropping the date for a long title', () => {
    const title = 'x'.repeat(160);
    expect(meetingEmail({ ...meeting, title, changed: true, method: 'REQUEST' }).subject).toBe(
      `Updated invitation: ${title}`,
    );
  });

  it('cancels without a join button or calendar links', () => {
    const mail = meetingEmail({ ...meeting, method: 'CANCEL' });
    expect(mail.subject).toBe('Cancelled: Review & <plan> · Wed, 28 Oct, 4:00 pm IST');
    expect(mail.calendar?.method).toBe('CANCEL');
    expect(mail.html).not.toContain('Join meeting');
    expect(mail.html).not.toContain('calendar.google.com');
    expect(mail.html).not.toContain('123456');
  });

  it('puts all five course-plan sections in both parts and escapes every value', () => {
    const mail = coursePlanEmail({
      to: 'asha@cutm.ac.in',
      name: 'Asha <b>',
      courseHref: 'https://lms.cutm.ac.in/courses/abc',
      courseCode: 'CUTM1535',
      courseTitle: 'Complex <Analysis>',
      credits: '3-0-1',
      calendar: [{ date: new Date('2026-10-13T18:30:00Z'), topic: 'Residues & <poles>', cos: ['CO1', 'CO2'] }],
      modules: [
        {
          title: 'Module II',
          hours: '4+0+2',
          topics: 'Residue <script>alert(1)</script>',
          practicals: ['Plot <poles>'],
        },
      ],
      projects: ['Study on residues'],
      textbooks: ['L. V. Ahlfors, “Complex Analysis” · Chapters: 4, 5'],
      references: [],
      syllabusPdfHref: 'https://lms.cutm.ac.in/api/files/syllabus/x?a="b"',
      objectives: ['Learn <safely>'],
      cos: [{ code: 'CO1', statement: 'Explain <residues>', bloomLevels: ['understand', 'apply'] }],
      outcomes: [{ code: 'PO1', title: 'Engineering <knowledge>' }],
    });

    expect(mail.subject).toBe('Course plan: CUTM1535 Complex <Analysis>');
    for (const heading of ['Course calendar', 'Syllabus', 'Course objectives', 'Course outcomes', 'Program outcomes']) {
      expect(mail.html).toContain(`>${heading}</h2>`);
      expect(mail.text).toContain(heading.toUpperCase());
    }
    expect(mail.html).toContain('Wed, 14 Oct');
    expect(mail.html).toContain('Module II (4+0+2 hours)');
    expect(mail.html).toContain('Understand, Apply');
    expect(mail.html).toContain('Residues &#38; &#60;poles&#62;');
    expect(mail.html).toContain('Complex &#60;Analysis&#62;');
    expect(mail.html).toContain('Asha &#60;b&#62;');
    expect(mail.html).toContain('Engineering &#60;knowledge&#62;');
    expect(mail.html).toContain('href="https://lms.cutm.ac.in/api/files/syllabus/x?a=&#34;b&#34;"');
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).toContain('Residue <script>alert(1)</script>');
    expect(mail.text).toContain('Practical: Plot <poles>');
  });
});
