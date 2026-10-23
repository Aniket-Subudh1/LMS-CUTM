import { roundHalfUp } from '@/lib/domain/round';
import { BLOOM_LEVELS, COURSE_TYPES, SESSION_KINDS } from '@/lib/schemas/structure';

export type Credits = { theory: number; practice: number; project: number };
export type BloomLevel = (typeof BLOOM_LEVELS)[number];
export type SessionKind = (typeof SESSION_KINDS)[number];
export type CourseType = (typeof COURSE_TYPES)[number];

const SEP = String.raw`\s*(?:\+|-{1,2}|–|—)\s*`;
const NUM = String.raw`(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)?`;
// Three parts (T+P+Pj) or, failing that, two (T+P, as some AP-campus descriptors write "3 (2+1)").
const THREE = new RegExp(`${NUM}${SEP}${NUM}${SEP}${NUM}`, 'gi');
const TWO = new RegExp(`${NUM}${SEP}${NUM}`, 'gi');

// One part may carry a whole semester (an internship is 0+0+24), so only the total of 30 limits it.
const validPart = (value: number) => Number.isInteger(value * 2);

// 07 §17. Reads "3+0+1", "2--2--2", "1.5+0+1.5", "(3-0-1)" or "Code(Credit) : CUTM1535(3-0-1)"; the parts are
// theory, practice and project credits in half steps. Null when nothing in the text is a credit split.
export function parseCredits(text: string): { credits: Credits; twoPart: boolean } | null {
  for (const [pattern, twoPart] of [
    [THREE, false],
    [TWO, true],
  ] as const) {
    for (const match of text.matchAll(pattern)) {
      const parts = match.slice(1).map(Number);
      if (!parts.every(validPart)) continue;
      const [theory, practice, project = 0] = parts;
      if (theory + practice + project > 30) continue;
      return { credits: { theory, practice, project }, twoPart };
    }
  }
  return null;
}

export const creditTotal = (c: Credits) => c.theory + c.practice + c.project;

// "3-0-1", the way CUTM prints a course's credits.
export const formatCredits = (c: Credits) => `${c.theory}-${c.practice}-${c.project}`;

// Decision 3 (15 Oct 2026): a course with credits gets the full academic set; 0-0-0 is a non-credit course.
export const courseMode = (c: Credits): 'credit' | 'noncredit' => (creditTotal(c) > 0 ? 'credit' : 'noncredit');

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[\s_-]+/g, '');

// A course code inside free text: 2–6 letters and exactly four digits ("CUST1051", "CUTM 2603", "DECT0901").
export function extractCode(text: string): string | null {
  const match = /(?:^|[^A-Z0-9])([A-Z]{2,6})\s?-?(\d{4})(?![0-9])/.exec(text.toUpperCase());
  return match ? `${match[1]}${match[2]}` : null;
}

// CPP-02's PSO titles, given to a new programme until an admin changes them (Q-08).
export const DEFAULT_OUTCOME_TITLES = [
  { code: 'PSO1', title: 'Higher education' },
  { code: 'PSO2', title: 'Entrepreneurship' },
  { code: 'PSO3', title: 'Placement' },
] as const;

// The courseware badge or the Course Repository's type column: "Core", "Domain Elective", "Skill", "Certificate",
// "Advanced Certificate", "Diploma".
export function courseTypeFromLabel(label: string): CourseType | null {
  const text = label.toLowerCase();
  if (/advanced\s*cert/.test(text)) return 'advanced_certificate';
  if (/cert/.test(text)) return 'certificate';
  if (/diploma/.test(text)) return 'diploma';
  if (/skill/.test(text)) return 'skill';
  if (/domain|elective/.test(text)) return 'domain';
  if (/core/.test(text)) return 'core';
  return null;
}

export const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^\s*(?:skill|course)\s*:\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const normalizePersonName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !['dr', 'prof', 'mr', 'mrs', 'ms', 'miss', 'er', 'sri', 'smt'].includes(word))
    .join(' ');

// A programme created from the course list gets a code from its name: "M.Sc Mathematics" → "MSC-MATHEMATICS".
export function programmeCode(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toUpperCase()
      .replace(/\./g, '')
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 17)
      .replace(/-+$/, '') || 'PROGRAMME';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// The verbs CUTM's course outcomes start with, by Bloom level. A guess for a person to confirm, never stored as
// the CO's level until someone saves it (decision of 15 Oct 2026, the spirit of law 7).
const VERBS: Record<string, BloomLevel> = Object.fromEntries(
  (
    [
      ['remember', 'define list recall recognise recognize identify name state memorise memorize label match know'],
      [
        'understand',
        'understand explain describe summarise summarize interpret classify discuss illustrate comprehend express outline relate gain acquire get',
      ],
      [
        'apply',
        'apply use implement solve demonstrate compute calculate execute utilise utilize operate perform practise practice prepare employ show',
      ],
      [
        'analyse',
        'analyse analyze examine differentiate distinguish compare contrast investigate categorise categorize inspect deduce',
      ],
      ['evaluate', 'evaluate assess justify critique judge defend appraise recommend validate verify measure estimate'],
      [
        'create',
        'create design develop construct formulate build compose plan produce invent generate devise propose model',
      ],
    ] as const
  ).flatMap(([level, verbs]) => verbs.split(' ').map((verb) => [verb, level])),
);

const LEAD_IN =
  /^(?:co\s*\d+\s*[:.)-]?\s*|\d+\s*[.)]\s*|(?:on|after|upon)\s+(?:successful\s+)?completion\s+of\s+(?:this|the)\s+course,?\s*|(?:the\s+)?students?\s+(?:will|shall|should)\s+(?:be\s+)?(?:able\s+)?(?:to\s+)?|(?:be\s+)?able\s+to\s+|to\s+)/i;

export function inferBloom(statement: string): BloomLevel | null {
  let text = statement.trim();
  for (let i = 0; i < 4; i++) {
    const next = text.replace(LEAD_IN, '');
    if (next === text) break;
    text = next;
  }
  const [, first = '', second = ''] = /^([a-z]+)(?:\s+([a-z]+))?/i.exec(text.toLowerCase()) ?? [];
  const verb = (word: string) => VERBS[word] ?? VERBS[word.replace(/s$/, '')];
  // "Critically analyse …": the verb follows an adverb.
  return verb(first) ?? (first.endsWith('ly') ? verb(second) : undefined) ?? null;
}

const BLOOM_WORDS: Record<string, BloomLevel> = {
  remember: 'remember',
  remembering: 'remember',
  knowledge: 'remember',
  understand: 'understand',
  understanding: 'understand',
  comprehension: 'understand',
  apply: 'apply',
  applying: 'apply',
  application: 'apply',
  analyse: 'analyse',
  analyze: 'analyse',
  analysing: 'analyse',
  analyzing: 'analyse',
  analysis: 'analyse',
  evaluate: 'evaluate',
  evaluating: 'evaluate',
  evaluation: 'evaluate',
  create: 'create',
  creating: 'create',
  creation: 'create',
  synthesis: 'create',
};

// "Apply, Create", "L2 - Understand", "K3", "Analyzing" → levels in order of appearance; at most three are kept
// (a CO stores 1–3), and `extra` says some were dropped.
export function parseBloomLevels(text: string): { levels: BloomLevel[]; extra: boolean } {
  const found: BloomLevel[] = [];
  for (const token of text.split(/[,/&;]|\band\b/i)) {
    const k = /\b[KL]\s*([1-6])\b/i.exec(token);
    const word = (/[a-z]{4,}/i.exec(token.replace(/\b[KL]\s*[1-6]\b/i, ''))?.[0] ?? '').toLowerCase();
    const level = BLOOM_WORDS[word] ?? (k ? BLOOM_LEVELS[Number(k[1]) - 1] : undefined);
    if (level && !found.includes(level)) found.push(level);
  }
  return { levels: found.slice(0, 3), extra: found.length > 3 };
}

const KIND_PREFIX = /^(practice|practical|lab|project)\s*:\s*/i;

// The session-plan editor: one session per line, "Practice:" or "Project:" in front for those sessions.
export function parseSessionLines(text: string): { topic: string; kind: SessionKind }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const prefix = KIND_PREFIX.exec(line)?.[1]?.toLowerCase();
      const kind: SessionKind = prefix === 'project' ? 'project' : prefix ? 'practice' : 'theory';
      return { topic: line.replace(KIND_PREFIX, '').trim() || line, kind };
    });
}

export const formatSessionLines = (sessions: readonly { topic: string; kind: SessionKind }[]) =>
  sessions
    .map((s) => (s.kind === 'theory' ? s.topic : `${s.kind === 'project' ? 'Project' : 'Practice'}: ${s.topic}`))
    .join('\n');

// The number in "CO7"; 0 for anything else.
export const coNumber = (code: string) => Number(/^CO(\d+)$/.exec(code)?.[1] ?? 0);

// "CO7" after CO1–CO6, even if CO3 or CO6 was deleted: `seq` is the highest number the course has ever given
// (`courses.coSeq`), so a code is never reused and cannot later refer to a different outcome in old records.
export function nextCoCode(existing: readonly { code: string }[], seq: number): string {
  return `CO${existing.reduce((max, co) => Math.max(max, coNumber(co.code)), seq) + 1}`;
}

// The syllabus's teaching hours: each module's "6" or "4+0+2" added up; a module without hours counts 0.
export function syllabusHours(modules: readonly { hours: string | null }[]): number {
  return modules.reduce(
    (total, m) => total + (m.hours ?? '').split('+').reduce((sum, part) => sum + (Number(part) || 0), 0),
    0,
  );
}

export type OutcomeCoverage = { code: string; links: number; average: number | null };

// The course's articulation of each PO and PSO: how many COs link to it and their mean level over those links
// (2 decimals), null with none. Also the codes no CO supports and the COs linked to nothing. Cells are keyed
// `<coId>:<code>` as in the mapping grid.
export function mappingCoverage(
  coIds: readonly string[],
  codes: readonly string[],
  cells: Readonly<Record<string, number>>,
): { outcomes: OutcomeCoverage[]; uncovered: string[]; unmappedCoIds: string[] } {
  const outcomes = codes.map((code) => {
    const levels = coIds.flatMap((id) => cells[`${id}:${code}`] ?? []);
    const sum = levels.reduce((total, level) => total + level, 0);
    return { code, links: levels.length, average: levels.length ? roundHalfUp(sum / levels.length, 2) : null };
  });
  return {
    outcomes,
    uncovered: outcomes.filter((o) => o.links === 0).map((o) => o.code),
    unmappedCoIds: coIds.filter((id) => codes.every((code) => !cells[`${id}:${code}`])),
  };
}

// A re-import keeps each CO's id by its code, so calendar rows and (later) question tags that point at CO2 still
// do. Imported mapping cells are keyed by CO code and come back keyed by id; cells of dropped COs go.
export function mergeCos<Id, Co extends { code: string }>(
  existing: readonly { _id: Id; code: string }[],
  imported: readonly Co[],
  newId: () => Id,
): (Co & { _id: Id })[] {
  const byCode = new Map(existing.map((co) => [co.code, co._id]));
  return imported.map((co) => ({ ...co, _id: byCode.get(co.code) ?? newId() }));
}

export type ReadinessInput = {
  credits: Credits;
  reviewNeeded: boolean;
  hasCoordinator: boolean;
  objectives: number;
  cos: readonly { id: string; bloomLevels: readonly string[] }[];
  mappedCoIds: ReadonlySet<string>;
  modules: number;
  hasSyllabusFile: boolean;
  textbooks: number;
  sessions: number;
};
export type ReadinessKey =
  'review' | 'coordinator' | 'objectives' | 'outcomes' | 'bloom' | 'mapping' | 'syllabus' | 'books' | 'sessions';

// The course page's "Course readiness" checklist, in the order a coordinator works through it.
export function courseReadiness(c: ReadinessInput): { key: ReadinessKey; done: boolean }[] {
  const credit = courseMode(c.credits) === 'credit';
  const steps: { key: ReadinessKey; done: boolean; show: boolean }[] = [
    { key: 'review', done: false, show: c.reviewNeeded },
    { key: 'coordinator', done: c.hasCoordinator, show: true },
    { key: 'objectives', done: c.objectives > 0, show: true },
    { key: 'outcomes', done: c.cos.length > 0, show: credit },
    { key: 'bloom', done: c.cos.length > 0 && c.cos.every((co) => co.bloomLevels.length > 0), show: credit },
    { key: 'mapping', done: c.cos.length > 0 && c.cos.every((co) => c.mappedCoIds.has(co.id)), show: credit },
    { key: 'syllabus', done: c.modules > 0 || c.hasSyllabusFile, show: true },
    { key: 'books', done: c.textbooks > 0, show: credit },
    { key: 'sessions', done: c.sessions > 0, show: true },
  ];
  return steps.filter((s) => s.show).map(({ key, done }) => ({ key, done }));
}
