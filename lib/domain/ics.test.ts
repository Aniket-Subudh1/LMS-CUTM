import { describe, expect, it } from 'vitest';
import { meetingIcs, type IcsEvent } from '@/lib/domain/ics';

const EVENT: IcsEvent = {
  uid: 'meeting-6ad1d7959796965a66ec3079@lms.cutm.ac.in',
  sequence: 0,
  method: 'REQUEST',
  stamp: new Date('2026-10-24T05:30:00Z'),
  start: new Date('2026-10-28T10:30:00Z'),
  end: new Date('2026-10-28T11:30:00Z'),
  title: 'Project review with an industry mentor',
  description: 'Pradeep Sahoo invited you.',
  url: 'https://lms.cutm.ac.in/m/x',
  organizer: { name: 'Pradeep Sahoo', email: 'no-reply@lms.cutm.ac.in' },
  attendee: { name: null, email: 'rao.kumar@example.com' },
};

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('meetingIcs (06 §8.7)', () => {
  it('writes one event naming only the person it is sent to', () => {
    expect(meetingIcs(EVENT)).toBe(
      [
        'BEGIN:VCALENDAR',
        'PRODID:-//Centurion University//LMS//EN',
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:meeting-6ad1d7959796965a66ec3079@lms.cutm.ac.in',
        'SEQUENCE:0',
        'DTSTAMP:20261024T053000Z',
        'DTSTART:20261028T103000Z',
        'DTEND:20261028T113000Z',
        'SUMMARY:Project review with an industry mentor',
        'DESCRIPTION:Pradeep Sahoo invited you.',
        'URL:https://lms.cutm.ac.in/m/x',
        'LOCATION:https://lms.cutm.ac.in/m/x',
        'ORGANIZER;CN="Pradeep Sahoo":mailto:no-reply@lms.cutm.ac.in',
        'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:rao.k',
        ' umar@example.com',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    );
  });

  it('cancels with the same UID', () => {
    const ics = unfold(meetingIcs({ ...EVENT, method: 'CANCEL', sequence: 2 }));
    expect(ics).toContain('METHOD:CANCEL\r\n');
    expect(ics).toContain('SEQUENCE:2\r\n');
    expect(ics).toContain('STATUS:CANCELLED\r\n');
    expect(ics).toContain(`UID:${EVENT.uid}\r\n`);
  });

  it.each([
    ['Review; plan, and \\ notes', 'SUMMARY:Review\\; plan\\, and \\\\ notes'],
    ['Line one\nline two', 'SUMMARY:Line one\\nline two'],
  ])('escapes %j', (title, line) => {
    expect(unfold(meetingIcs({ ...EVENT, title }))).toContain(`${line}\r\n`);
  });

  it('quotes a name and drops quotes inside it', () => {
    const ics = unfold(meetingIcs({ ...EVENT, attendee: { name: 'Rao "RK" Kumar', email: 'rk@example.com' } }));
    expect(ics).toContain('ATTENDEE;CN="Rao RK Kumar";ROLE=');
  });

  it('folds long lines at 75 octets without splitting a character', () => {
    const description = `${'Agenda – '.repeat(30)}end`;
    const ics = meetingIcs({ ...EVENT, description });
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`DESCRIPTION:${description}\r\n`);
  });
});
