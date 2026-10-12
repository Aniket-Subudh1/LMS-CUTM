const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const isLevel = (value: string | undefined): value is Level => value !== undefined && Object.hasOwn(LEVELS, value);

// Reads process.env directly so logging still works when env() validation itself fails.
function threshold(): number {
  const configured = process.env.LOG_LEVEL;
  return isLevel(configured) ? LEVELS[configured] : LEVELS.info;
}

function write(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (LEVELS[level] < threshold()) return;
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields }, (_key, value: unknown) =>
    value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value,
  );
  if (LEVELS[level] >= LEVELS.warn) console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};
