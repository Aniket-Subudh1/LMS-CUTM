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
