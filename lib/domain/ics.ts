// M03c T4: a meeting invitation's calendar file (RFC 5545, 06 §8.7). One event per file, naming only the person it is
// sent to, so no attendee's address reaches another. A later file with the same UID and a higher SEQUENCE replaces it;
// METHOD:CANCEL takes it off the calendar.
export type IcsEvent = {
  uid: string;
  sequence: number;
  method: 'REQUEST' | 'CANCEL';
  stamp: Date;
  start: Date;
  end: Date;
  title: string;
  description: string;
  url: string;
  organizer: { name: string; email: string };
  attendee: { name: string | null; email: string };
};

// 20261028T103000Z
const utc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const text = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// A parameter value is quoted, and may not hold a double quote or a control character.
const param = (value: string) => `"${value.replace(/["\p{Cc}]/gu, '')}"`;

// Lines longer than 75 octets continue on the next line after a space, never inside a character.
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (octets + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function meetingIcs(event: IcsEvent): string {
  const attendee = event.attendee.name ? `;CN=${param(event.attendee.name)}` : '';
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Centurion University//LMS//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${event.method}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utc(event.stamp)}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(event.end)}`,
    `SUMMARY:${text(event.title)}`,
    `DESCRIPTION:${text(event.description)}`,
    `URL:${event.url}`,
    `LOCATION:${text(event.url)}`,
    `ORGANIZER;CN=${param(event.organizer.name)}:mailto:${event.organizer.email}`,
    `ATTENDEE${attendee};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${event.attendee.email}`,
    `STATUS:${event.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
