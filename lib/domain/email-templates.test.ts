import { describe, expect, it } from 'vitest';
import { coursePlanEmail, invitationEmail, resetEmail } from '@/lib/domain/email-templates';

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
    expect(mail).toMatchObject({ to: 'ravi@cutm.ac.in', subject: 'Your CUTM LMS account' });
    expect(mail.text).toContain('Hello Ravi,');
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
