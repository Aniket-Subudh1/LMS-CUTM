import type { Role } from '@/lib/schemas/common';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  hod: 'Head of department',
  faculty: 'Faculty',
  student: 'Student',
  support: 'Support',
};

const IST = 'Asia/Kolkata';
const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

// `12 Oct 2026, 10:30 AM` (08 §7); en-IN prints the meridiem in lower case.
export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date).replace(/\b(am|pm)$/i, (m) => m.toUpperCase());
}

type Tone = 'default' | 'secondary' | 'destructive' | 'outline';

const TONE: Record<string, Tone> = {
  active: 'default',
  current: 'default',
  invited: 'secondary',
  draft: 'secondary',
  upcoming: 'secondary',
  disabled: 'destructive',
  archived: 'outline',
  closed: 'outline',
  retired: 'outline',
  dropped: 'outline',
  graduated: 'outline',
  completed: 'outline',
};

// The one place a status becomes a Badge variant (08 §4).
export function statusTone(status: string): Tone {
  return TONE[status] ?? 'secondary';
}
