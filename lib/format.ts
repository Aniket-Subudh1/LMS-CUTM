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

const dayFormat = new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' });

// `Wed, 14 Oct`: a session in a course calendar.
export function formatDay(date: Date): string {
  return dayFormat.format(date);
}

const longDateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

// `Tuesday, 13 October`: the top bar.
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

const pctFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

// `74%`, `66.67%` (08 §7): up to two decimals, no trailing zeros.
export function formatPct(value: number): string {
  return `${pctFormat.format(value)}%`;
}

const sizeFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

// File sizes in decimal units, as phones and upload limits state them: `640 MB`, `1.5 GB`.
export function formatBytes(bytes: number): string {
  const [value, unit] =
    bytes >= 1e9
      ? [bytes / 1e9, 'GB']
      : bytes >= 1e6
        ? [bytes / 1e6, 'MB']
        : bytes >= 1e3
          ? [bytes / 1e3, 'KB']
          : [bytes, 'bytes'];
  return `${sizeFormat.format(value)} ${unit}`;
}

// Video lengths: `45 s`, `12 min`, `1 h 5 min`.
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
