import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { listLanguages } from '@/lib/integrations/code-runner';
import { Setting } from '@/lib/models/setting';
import { User } from '@/lib/models/user';
import { SETTINGS, settingsKey, type SettingsKey, type SettingsValue } from '@/lib/schemas/settings';

// 02 §5: the only cached read of settings; `saveSettings` invalidates the tag.
async function readStored(key: SettingsKey): Promise<unknown> {
  'use cache';
  cacheLife('minutes');
  cacheTag(`settings:${key}`);
  await db();
  const doc = await Setting.findById(key, { value: 1 }).lean();
  return doc?.value ?? null;
}

// One parser per key, so a generic key keeps its own value type (each later key adds a line).
const PARSE: { [K in SettingsKey]: (stored: unknown) => SettingsValue<K> } = {
  lessons: (stored) => SETTINGS.lessons.schema.parse(stored ?? {}),
  evaluation: (stored) => SETTINGS.evaluation.schema.parse(stored ?? {}),
  attendance: (stored) => SETTINGS.attendance.schema.parse(stored ?? {}),
  codeRunner: (stored) => SETTINGS.codeRunner.schema.parse(stored ?? {}),
  proctoring: (stored) => SETTINGS.proctoring.schema.parse(stored ?? {}),
  ceTrend: (stored) => SETTINGS.ceTrend.schema.parse(stored ?? {}),
};

export async function getSettings<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
  return PARSE[key](await readStored(key));
}

export type SettingsCard = { key: SettingsKey; label: string; description: string; updatedAt: Date | null };

export async function listSettings(): Promise<SettingsCard[]> {
  await requireViewer(['admin']);
  await db();
  const docs = await Setting.find({}, { updatedAt: 1 }).limit(settingsKey.options.length).lean();
  const updated = new Map(docs.map((doc) => [doc._id, doc.updatedAt]));
  return settingsKey.options.map((key) => ({
    key,
    label: SETTINGS[key].label,
    description: SETTINGS[key].description,
    updatedAt: updated.get(key) ?? null,
  }));
}

// TP-09: the code runner's own languages, to check the ids in the codeRunner setting; null when it does not answer
// (the adapter logs why).
export async function getRunnerLanguages(): Promise<{ id: number; name: string }[] | null> {
  await requireViewer(['admin']);
  return listLanguages().then(
    (languages) => languages,
    () => null,
  );
}

export type SettingsPage<K extends SettingsKey> = {
  key: K;
  label: string;
  description: string;
  value: SettingsValue<K>;
  defaults: SettingsValue<K>;
  fieldHelp: (typeof SETTINGS)[K]['fieldHelp'];
  updated: { at: Date; by: string } | null;
};

export async function getSettingsPage<K extends SettingsKey>(key: K): Promise<SettingsPage<K>> {
  await requireViewer(['admin']);
  await db();
  const doc = await Setting.findById(key, { value: 1, updatedBy: 1, updatedAt: 1 }).lean();
  const by = doc ? await User.findById(doc.updatedBy, { name: 1 }).lean() : null;
  const entry = SETTINGS[key];
  return {
    key,
    label: entry.label,
    description: entry.description,
    value: PARSE[key](doc?.value),
    defaults: PARSE[key](null),
    fieldHelp: entry.fieldHelp,
    updated: doc ? { at: doc.updatedAt, by: by?.name ?? 'an administrator' } : null,
  };
}
