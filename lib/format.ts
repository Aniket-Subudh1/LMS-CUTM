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

const longDateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

// `Tuesday, 13 October`: the top bar and the Home greeting.
export function formatLongDate(date: Date): string {
  return longDateFormat.format(date);
}

// `12 Oct 2026, 10:30 AM` (08 §7); en-IN prints the meridiem in lower case.
export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date).replace(/\b(am|pm)$/i, (m) => m.toUpperCase());
}

type Tone = 'success' | 'warning' | 'danger' | 'secondary' | 'outline';

const TONE: Record<string, Tone> = {
  active: 'success',
  current: 'success',
  invited: 'warning',
  draft: 'secondary',
  upcoming: 'secondary',
  disabled: 'danger',
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

// Up to two letters for an avatar: "Asha Mohanty" → "AM".
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
