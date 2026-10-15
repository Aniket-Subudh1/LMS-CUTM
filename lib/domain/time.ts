const IST_OFFSET_MS = 330 * 60_000;

// `<input type="datetime-local">` carries no zone; the server reads it as IST (06 §2).
export function parseIstLocal(local: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new RangeError(`Not an IST date-time: ${local}`);
  const [y, mo, d, h, mi] = match.slice(1).map(Number);
  const wall = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (wall.getUTCMonth() !== mo - 1 || wall.getUTCDate() !== d || h > 23 || mi > 59) {
    throw new RangeError(`Not a real IST date-time: ${local}`);
  }
  return new Date(wall.getTime() - IST_OFFSET_MS);
}

export function istDateToDate(day: string): Date {
  return parseIstLocal(`${day}T00:00`);
}

export function istDayKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

// The dates of `count` classes from `startDay` (YYYY-MM-DD, IST) on the given weekdays (0 = Sunday … 6 =
// Saturday): "start from the course's session plan" on the Course plan page. A start on a non-class day moves to
// the next class day.
export function classDates(startDay: string, weekdays: readonly number[], count: number): string[] {
  const days = new Set(weekdays);
  if (days.size === 0 || [...days].some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new RangeError('Pick at least one weekday.');
  }
  const start = istDateToDate(startDay);
  const out: string[] = [];
  for (let t = start.getTime() + 330 * 60_000; out.length < count; t += DAY_MS) {
    const day = new Date(t);
    if (days.has(day.getUTCDay())) out.push(day.toISOString().slice(0, 10));
  }
  return out;
}
