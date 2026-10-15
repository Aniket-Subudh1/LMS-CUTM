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
      courseCode: 'CS201',
      courseTitle: 'Data <Structures>',
      calendar: [{ date: new Date('2026-10-13T18:30:00Z'), topic: 'Stacks & <queues>', cos: ['CO1', 'CO2'] }],
      syllabus: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unit 1 <script>alert(1)</script>' }] }],
      },
      syllabusPdfHref: 'https://lms.cutm.ac.in/api/files/syllabus/x?a="b"',
      objectives: ['Learn <safely>'],
      cos: [{ code: 'CO1', statement: 'Explain <trees>', bloomLevel: 'understand' }],
      pos: [{ code: 'PO1', title: 'Engineering <knowledge>' }],
      psos: [{ code: 'PSO1', title: 'Higher education' }],
    });

    expect(mail.subject).toBe('Course plan: CS201 Data <Structures>');
    for (const heading of ['Course calendar', 'Syllabus', 'Course objectives', 'Course outcomes', 'Program outcomes']) {
      expect(mail.html).toContain(`>${heading}</h2>`);
      expect(mail.text).toContain(heading.toUpperCase());
    }
    expect(mail.html).toContain('Wed, 14 Oct');
    expect(mail.html).toContain('Stacks &#38; &#60;queues&#62;');
    expect(mail.html).toContain('Data &#60;Structures&#62;');
    expect(mail.html).toContain('Asha &#60;b&#62;');
    expect(mail.html).toContain('Engineering &#60;knowledge&#62;');
    expect(mail.html).toContain('href="https://lms.cutm.ac.in/api/files/syllabus/x?a=&#34;b&#34;"');
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).toContain('Unit 1 <script>alert(1)</script>');
  });
});
