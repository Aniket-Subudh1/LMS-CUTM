import { describe, expect, it } from 'vitest';
import { invitationEmail, resetEmail } from '@/lib/domain/email-templates';

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
});
