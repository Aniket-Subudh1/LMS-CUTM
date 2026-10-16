import {
  courseTypeFromLabel,
  extractCode,
  inferBloom,
  parseBloomLevels,
  parseCredits,
  type BloomLevel,
  type CourseType,
  type Credits,
  type SessionKind,
} from '@/lib/domain/catalog';
import {
  CATALOG_LIMITS as LIMIT,
  OUTCOME_CODES,
  type CoursewareBlock,
  type CoursewarePage,
} from '@/lib/schemas/structure';

type OutcomeCode = (typeof OUTCOME_CODES)[number];

export type ImportedCourse = {
  code: string | null;
  title: string;
  type: CourseType | null;
  credits: Credits | null;
  facultyName: string | null;
  objectives: string[];
  cos: { code: string; statement: string; bloomLevels: BloomLevel[]; suggestedBloom: BloomLevel | null }[];
  // Keyed by CO code; the import turns codes into CO ids.
  coMap: { co: string; outcome: OutcomeCode; level: 1 | 2 | 3 }[];
  // `hours` as the page writes them: "4+0+2" (theory + practice + project hours) or "6".
  modules: { title: string; hours: string | null; topics: string; practicals: string[] }[];
  projects: string[];
  textbooks: string[];
  references: string[];
  sessionPlan: { topic: string; kind: SessionKind }[];
  // Review notes in plain words, shown on the course page until someone marks it reviewed.
  issues: string[];
};

type Note = (issue: string) => void;

type Line = { kind: 'line'; text: string; bold: boolean };
type Item = Line | { kind: 'table'; rows: string[][] };
type Section = 'objectives' | 'outcomes' | 'syllabus' | 'projects' | 'textbooks' | 'references' | 'sessions' | 'other';

// Faculty type these pages by hand, so every heading comes in several spellings. A heading is matched after its
// parentheses and trailing punctuation are removed ("Course Outcomes (COs):" → "Course Outcomes").
const SECTIONS: [Section, RegExp][] = [
  ['objectives', /^(?:course\s+)?objectives?(?:\s+of\s+the\s+course)?$/i],
  ['outcomes', /^(?:(?:course|learning)\s+outcomes?|cos)$/i],
  [
    'other',
    /^(?:co\s*[-,/\\]?\s*po(?:\s*[-,/\\]?\s*pso)?(?:\s+mapping)?(?:\s+matrix)?|mapping(?:\s+of\s+cos?\s+(?:with|to|and)\s+pos?)?(?:\s+matrix)?|course\s+outcomes?\s+to\s+program(?:me)?\s+outcomes?(?:\s+mapping)?)$/i,
  ],
  ['syllabus', /^(?:(?:course|detailed)\s+)?syllabus(?:\s*\/\s*contents?)?$|^course\s+contents?(?:\s+including.*)?$/i],
  ['projects', /^(?:list\s+of\s+)?projects?(?:\s*\/\s*\w+)*$|^project\s+(?:topics|list|work|ideas)$/i],
  [
    'textbooks',
    /^(?:text\s*books?|books?\s+prescribed|prescribed\s+(?:text\s*)?books?|books?\s+recommended|recommended\s+books?|books?(?:\s*(?:&|and)\s*journals)?|text\s*books?\s*(?:&|and)\s*references?)$/i,
  ],
  [
    'references',
    /^(?:reference\s*books?|references?(?:\s*[-–—]\s*suggested\s+readings?)?|suggested\s+readings?|further\s+readings?)$/i,
  ],
  ['sessions', /^(?:session|lesson|lecture|teaching)\s+plan(?:\s*(?:&|and)\s*materials?)?$/i],
  [
    'other',
    /^(?:introduction|course\s+(?:description|descriptor|materials?)|contents|list\s+of\s+assignments|assignments?|journals?|web\s*links?|e-?resources?|pre-?requisites?|program(?:me)?\s+outcomes?|pos?\s+and\s+psos?|scheme\s+of\s+(?:assessment|evaluation)|question\s+bank|study\s+materials?|(?:project\s+)?evaluation\s+criteria|guidelines\b.*)$/i,
  ],
];

function sectionOf(text: string): { section: Section; rest: string } | null {
  // "Project (1 hour):" or "Practical (4 hours):" labels a part of a module or a week, not a section.
  if (text.length > 160 || /^(?:projects?|practi(?:ce|cal)s?|theory|lab)\s*\(\s*\d/i.test(text)) return null;
  const colon = text.indexOf(':');
  for (const [head, rest] of colon > 0
    ? [
        [text, ''],
        [text.slice(0, colon), text.slice(colon + 1)],
      ]
    : [[text, '']]) {
    const name = head
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[\s:.\-–—]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const found = name.length <= 80 ? SECTIONS.find(([, pattern]) => pattern.test(name)) : undefined;
    if (found) return { section: found[0], rest: rest.trim() };
  }
  return null;
}

const URL_TEXT = /\b(?:https?:\/\/|www\.)\S+/gi;
// What is left of "PPT Link: https://…", "Video Link:", "E-material (ICAR e-Krishi Shiksha): …" or "material:1-" once
// the address is gone: a label with nothing after it.
const LINK_LABEL =
  /^(?:[a-z-]+\s){0,2}(?:links?|videos?|ppts?|e-?materials?|materials?|resources?)(?:\s*\([^)]*\))?\s*(?:[-:]\s*\d*\s*[-:]?|\d+\s*[-:]?)$|^(?:web\s*links?|e-?materials?|youtube(?:\s+video)?|videos?|ppts?|links?)$/i;
const BULLET =
  /^(?:[●•▪◦∙·*➢►✓✔](?:\s+|$)|-\s+|\(?\d{1,2}[.)](?!\d)\s*|\(?[a-h]\)\s*|\(?(?:i{1,3}|iv|vi{0,3}|ix|x)\)\s*)/i;
const JOINER =
  /(?:\b(?:of|and|or|the|a|an|in|to|for|with|on|by|from|at|as|its|their|using|between|into|via)|[,&(/–—-])$/i;
const MODULE = /^(?:module|unit)\s*[-–—:.]?\s*([ivxlc]+|\d{1,2})\b\s*[-–—:.)]*\s*(.*)$/i;
const SESSION =
  /^(?:session|lecture|lect\.?|class|day)\s*(?:no\.?\s*)?(\d{1,3}(?:\s*(?:,|&|and|to|-|–)\s*\d{1,3})*)(?!\d)\s*[:.)\-–]*\s*(.*)$/i;
const CO_CELL = /^co\s*-?\s*(\d{1,2})$/i;
const OUTCOME_CELL = /^p\s*(s)?\s*o\s*-?\s*(\d{1,2})$/i;

const FACTS = {
  faculty: /^(?:course\s+)?(?:faculty|coordinator|instructor|teacher)(?:\s+name)?\s*[:\-–]\s*(.*)$/i,
  codeCredit: /^code\s*\(\s*credits?\s*\)\s*[:\-–]?\s*(.+)$/i,
  code: /^(?:course\s+)?code\s*[:\-–]\s*(.+)$/i,
  credits: /^credits?\s*[:\-–]\s*(.+)$/i,
  name: /^course\s+(?:name|title)\s*[:\-–]/i,
};
const isFact = (text: string) => Object.values(FACTS).some((pattern) => pattern.test(text));

// Word leaves "Top of Form" and "Bottom of Form" markers in pasted text.
const tidy = (text: string) =>
  text
    .replace(/\b(?:top|bottom)\s+of\s+form\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function withoutLinks(text: string): string {
  const rest = tidy(text.replace(URL_TEXT, ''));
  return LINK_LABEL.test(rest) ? '' : rest;
}

const PREFIX_KIND =
  /^(?:project(?:\s+session)?|practi(?:ce|cal)|lab|experiment)\s*[-–]?\s*(?:[:.)\-–]+\s*)?\d*\s*[:.)\-–]+\s*/i;

// Table cells wrap softly (the DOCX exports break after a cell's first word), so their lines run on, except where
// a new "Practice:" entry or bullet starts.
function cellText(cell: string): string {
  let text = '';
  for (const line of cell.split('\n').map(withoutLinks)) {
    if (!line) continue;
    const fresh = text && !/[.;!?]$/.test(text) && (BULLET.test(line) || PREFIX_KIND.test(line));
    text = text ? `${text}${fresh ? ';' : ''} ${line}` : line;
  }
  return text;
}

// Pages are hard-wrapped: a line that starts in lower case, or follows one ending in "of", "and" or a comma, is
// the rest of the line before it. Bullets, session and module lines always start afresh.
function continues(a: Line, b: Line): boolean {
  if (/[.!?:]$/.test(a.text)) return false;
  if (BULLET.test(b.text) || SESSION.test(b.text) || MODULE.test(b.text) || sectionOf(b.text) || isFact(b.text)) {
    return false;
  }
  if ((SESSION.test(a.text) || MODULE.test(a.text)) && !(a.bold && b.bold)) return false;
  return /^[a-z,;)\]&–—]/.test(b.text) || JOINER.test(a.text);
}

function prepare(blocks: readonly CoursewareBlock[]): Item[] {
  const items: Item[] = [];
  for (const block of blocks) {
    if (block.kind === 'table') {
      const rows = block.rows.map((row) => row.map(cellText)).filter((row) => row.some(Boolean));
      if (rows.length) items.push({ kind: 'table', rows });
      continue;
    }
    const text = withoutLinks(block.text);
    if (!text) continue;
    const line: Line = { kind: 'line', text, bold: block.bold };
    const last = items.at(-1);
    if (last?.kind === 'line' && continues(last, line)) {
      last.text = `${last.text} ${text}`;
      last.bold &&= line.bold;
    } else items.push(line);
  }
  return items;
}

const LEAD_IN =
  /^(?:the\s+(?:main\s+|primary\s+)?objectives?\s+of\b.*|(?:upon|on|after)\s+(?:the\s+)?(?:successful\s+)?complet.*|.*\bstudents?\s+(?:will|shall|should)\s+(?:be\s+)?able\s+to)$/i;

// List entries: a bullet starts one, and without bullets every line is one. Under bullets, a line joins the entry
// before it unless that entry already ended a sentence (`runOn`: always, as in numbered book lists). Lead-ins such
// as "Students will be able to:" are dropped.
function entries(lines: readonly string[], runOn = false): string[] {
  const bulleted = lines.some((line) => BULLET.test(line));
  const out: string[] = [];
  for (const line of lines) {
    const bullet = BULLET.exec(line);
    if (bullet) {
      out.push(line.slice(bullet[0].length).trim());
      continue;
    }
    const last = out.at(-1);
    if (line === last) continue;
    if (bulleted && last !== undefined && (runOn || !/[.;!?]$/.test(last)))
      out[out.length - 1] = tidy(`${last} ${line}`);
    else out.push(line);
  }
  return [...new Set(out.map(tidy))].filter(
    (entry) => entry && !entry.endsWith(':') && !(entry.length < 160 && LEAD_IN.test(entry)),
  );
}

function numbers(list: string): number {
  let count = 0;
  for (const part of list.split(/\s*(?:,|&|\band\b)\s*/i)) {
    const range = /^(\d+)\s*(?:-|–|to)\s*(\d+)$/i.exec(part.trim());
    count += range ? Math.max(1, Number(range[2]) - Number(range[1]) + 1) : part.trim() ? 1 : 0;
  }
  return Math.min(Math.max(count, 1), 10);
}

// What a session line or a "Type" cell says it is: "Project Session:3: …", "Practice - …", "Practical".
function kindOf(text: string): SessionKind | null {
  if (/^\s*project/i.test(text)) return 'project';
  if (/^\s*(?:practi(?:ce|cal)|lab|experiment)/i.test(text)) return 'practice';
  return null;
}

// A project session outranks a practice one when a session mixes both.
const strongest = (a: SessionKind | null, b: SessionKind | null) => (a === 'project' || !b ? a : b);

function topicOf(text: string): string {
  return tidy(
    text
      .replace(/^topics?\s+(?:to\s+be\s+)?(?:discussed|covered)\s*:\s*/i, '')
      .split(/;\s+/)
      .map((part) => part.replace(PREFIX_KIND, ''))
      .filter(Boolean)
      .join('; '),
  );
}

type Draft = { count: number; lines: string[]; kind: SessionKind | null };

function sessionsFromLines(lines: readonly Line[], drafts: Draft[]) {
  // A module sub-heading inside the plan, with the bold line it wraps onto, belongs to no session.
  let heading = false;
  for (const { text, bold } of lines) {
    const session = SESSION.exec(text);
    if (session) {
      drafts.push({ count: numbers(session[1]), lines: session[2] ? [session[2]] : [], kind: kindOf(session[2]) });
      heading = false;
      continue;
    }
    if (MODULE.test(text)) heading = true;
    const draft = drafts.at(-1);
    if (!draft || heading) {
      heading &&= bold;
      continue;
    }
    draft.lines.push(text);
    draft.kind = strongest(draft.kind, kindOf(text));
  }
}

function sessionsFromTable(rows: readonly string[][], drafts: Draft[]) {
  const header = rows.findIndex(
    (row) =>
      row.some((cell) => /^(?:lect|session|class|s\.?\s*no|sl)/i.test(cell)) &&
      row.some((cell) => /topic|points|content|coverage|description|title/i.test(cell)),
  );
  const topicCol =
    header < 0 ? -1 : rows[header].findIndex((c) => /topic|points|content|coverage|description|title/i.test(c));
  const typeCol = header < 0 ? -1 : rows[header].findIndex((c) => /type|method|activit|mode/i.test(c));
  for (const row of rows.slice(header + 1)) {
    if (row.filter(Boolean).length === 1 && MODULE.test(row.find(Boolean) ?? '')) continue;
    const at = row.findIndex((cell) => SESSION.test(cell) || /^\d{1,3}$/.test(cell));
    const typeText = typeCol >= 0 ? (row[typeCol] ?? '') : '';
    if (at >= 0) {
      const session = SESSION.exec(row[at]);
      const own = session?.[2] ?? '';
      const fallback = topicCol >= 0 && topicCol !== at ? (row[topicCol] ?? '') : '';
      const topic =
        own ||
        fallback ||
        (typeCol < 0 ? row.filter((_, i) => i !== at).sort((x, y) => y.length - x.length)[0] : '') ||
        '';
      drafts.push({
        count: session ? numbers(session[1]) : 1,
        lines: topic ? [topic] : [],
        kind: kindOf(typeText) ?? kindOf(topic),
      });
      continue;
    }
    const draft = drafts.at(-1);
    if (!draft) continue;
    draft.kind ??= kindOf(typeText);
    if (!draft.lines.length) {
      const topic = topicCol >= 0 ? (row[topicCol] ?? '') : row.slice().sort((x, y) => y.length - x.length)[0];
      if (topic) draft.lines.push(topic);
    }
  }
}

function moduleTitle(rest: string): string {
  return tidy(
    rest
      .replace(/\([^)]*\d\s*(?:h|hrs?|hours?)\b[^)]*\)/gi, ' ')
      .replace(/,?\s*\b[A-Z]{2,4}\/N\d{4}\b/g, ' ')
      .replace(/^[\s:.\-–—]+|[\s,:.\-–—]+$/g, ''),
  );
}

// "(4hr+0hr+2hr)" → "4+0+2", "(2 hour)" → "2".
function moduleHours(text: string): string | null {
  const found = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/gi)].map((m) => m[1]);
  return found.length ? found.join('+').slice(0, LIMIT.moduleHours) : null;
}

const TOPICS_MARK = /^(?:theory|topics?)\s*(?:\([^)]*\))?\s*:?\s*(.*)$/i;
const PRACTICALS_MARK =
  /^(?:list\s+of\s+)?(?:practicals?|practices?|experiments?|lab(?:oratory)?(?:\s+(?:work|experiments?))?|optional)\s*(\([^)]*\))?\s*:?$/i;
const PRACTICAL_ITEM = /^(?:practi(?:ce|cal)|experiment|exp|lab)\s*[-.]?\s*(?:no\.?\s*)?\d{1,2}\s*[:.)\-–]+\s*(.+)$/i;
const PROJECT_ITEM = /^project\s*[-.]?\s*(?:no\.?\s*)?\d{0,2}\s*[:.)\-–]+\s*(.+)$/i;

type ModuleDraft = { title: string; hours: string | null; topics: string[]; practicals: string[]; untitled: boolean };

function readSyllabus(items: readonly Item[], modules: ModuleDraft[], projects: string[]) {
  let current: ModuleDraft | null = null;
  let bucket: 'topics' | 'practicals' = 'topics';
  // A bold module line wrapped onto a second bold line: "Module: IV Budgetary" + "Control".
  let wrapsTitle = false;
  const loose: string[] = [];
  const practicalsModule = () => {
    let found = modules.find((m) => m.title === 'Practicals');
    if (!found) {
      found = { title: 'Practicals', hours: null, topics: [], practicals: [], untitled: false };
      modules.push(found);
    }
    return found;
  };

  for (const item of items) {
    if (item.kind === 'table') {
      if (bucket !== 'practicals' || !current) continue;
      const header = item.rows[0].findIndex((cell) => /title|name|experiment|practical|exercise/i.test(cell));
      for (const row of item.rows.slice(header >= 0 ? 1 : 0)) {
        const cell = header >= 0 ? row[header] : row.find((c) => c && !/^\d{1,3}$/.test(c));
        if (cell) current.practicals.push(cell);
      }
      continue;
    }
    const { text, bold } = item;
    const opens = MODULE.exec(text);
    if (opens) {
      const title = moduleTitle(opens[2]);
      current = {
        title: title || `Module ${opens[1].toUpperCase()}`,
        hours: moduleHours(text),
        topics: [],
        practicals: [],
        untitled: !title,
      };
      modules.push(current);
      bucket = 'topics';
      wrapsTitle = bold;
      continue;
    }
    const practicalsMark = PRACTICALS_MARK.exec(text);
    if (current && wrapsTitle && bold && !practicalsMark && !TOPICS_MARK.test(text) && !BULLET.test(text)) {
      current.title = current.untitled ? moduleTitle(text) || current.title : tidy(`${current.title} ${text}`);
      current.hours ??= moduleHours(text);
      current.untitled = false;
      wrapsTitle = false;
      continue;
    }
    wrapsTitle = false;
    if (current) current.untitled = false;
    const project = PROJECT_ITEM.exec(text);
    if (project) {
      projects.push(project[1]);
      continue;
    }
    if (practicalsMark) {
      // "Practical (Credit: 1)" or "List of practicals" after the modules belongs to the course, not to a module.
      if (practicalsMark[1] || /^list/i.test(text) || !current) current = practicalsModule();
      bucket = 'practicals';
      continue;
    }
    const practical = PRACTICAL_ITEM.exec(text);
    if (practical) {
      (current ?? practicalsModule()).practicals.push(practical[1]);
      continue;
    }
    const topics = TOPICS_MARK.exec(text);
    if (topics) {
      bucket = 'topics';
      if (topics[1]) (current?.topics ?? loose).push(topics[1]);
      continue;
    }
    if (!current) loose.push(text);
    else current[bucket].push(text);
  }
  if (!modules.some((m) => m.title !== 'Practicals') && entries(loose).length) {
    modules.unshift({ title: 'Syllabus', hours: null, topics: loose, practicals: [], untitled: false });
  }
}

function readCoTable(rows: readonly string[][], note: Note): ImportedCourse['cos'] | null {
  const levelCol = rows[0].findIndex((cell) => /bloom|taxonomy|k-?level|^bt|^level/i.test(cell));
  const cos = rows.flatMap((row) => {
    const code = CO_CELL.exec(row[0] ?? '');
    const statement = row
      .slice(1)
      .filter((_, i) => i + 1 !== levelCol)
      .sort((x, y) => y.length - x.length)[0];
    if (!code || !statement || statement.split(' ').length < 3) return [];
    const stated = statedBloom(statement, note);
    const levels = levelCol > 0 ? bloomOf(row[levelCol] ?? '', note) : stated.levels;
    return [{ code: `CO${Number(code[1])}`, statement: stated.statement, bloomLevels: levels, suggestedBloom: null }];
  });
  return cos.length ? cos : null;
}

function levelOf(cell: string): 1 | 2 | 3 | null {
  const value = cell.trim().toUpperCase();
  if (value === '3' || value === 'H' || value === 'HIGH') return 3;
  if (value === '2' || value === 'M' || value === 'MEDIUM') return 2;
  if (value === '1' || value === 'L' || value === 'LOW') return 1;
  return null;
}

function readMapping(rows: readonly string[][], note: Note): ImportedCourse['coMap'] | null {
  const header = rows.findIndex((row) => row.filter((cell) => OUTCOME_CELL.test(cell)).length >= 3);
  if (header < 0) return null;
  const unknown: string[] = [];
  const columns = rows[header].map((cell) => {
    const match = OUTCOME_CELL.exec(cell);
    if (!match) return undefined;
    const name = `${match[1] ? 'PSO' : 'PO'}${Number(match[2])}`;
    const code = OUTCOME_CODES.find((c) => c === name);
    if (!code) unknown.push(name);
    return code;
  });
  if (unknown.length) {
    note(`The mapping has columns other than PO1–PO12 and PSO1–PSO3 (${unknown.join(', ')}); they were left out.`);
  }
  return rows.slice(header + 1).flatMap((row) => {
    const co = CO_CELL.exec(row[0] ?? '');
    if (!co) return [];
    return row.flatMap((cell, i) => {
      const outcome = columns[i];
      const level = levelOf(cell);
      return outcome && level ? [{ co: `CO${Number(co[1])}`, outcome, level }] : [];
    });
  });
}

const EXPLICIT_BLOOM =
  /\s*[([]\s*((?:[KL]\s*[1-6]|remember|understand|apply|analy[sz]e|evaluate|create)[^)\]]*)[)\]]\s*\.?\s*$/i;

// "Implement servlets. (Apply, Analyze)" states its levels; they are taken as written and cut from the statement.
function statedBloom(text: string, note: Note): { statement: string; levels: BloomLevel[] } {
  const stated = EXPLICIT_BLOOM.exec(text);
  const levels = stated ? bloomOf(stated[1], note) : [];
  return { statement: levels.length ? text.slice(0, stated?.index).trim() : text, levels };
}

function bloomOf(text: string, note: Note): BloomLevel[] {
  const { levels, extra } = parseBloomLevels(text);
  if (extra) note('An outcome names more than three Bloom levels; the first three were kept.');
  return levels;
}
const CO_PREFIX = /^co\s*-?\s*(\d{1,2})\s*[:.)\-–]*\s*/i;

function outcomesFromList(lines: readonly string[], note: Note): { cos: ImportedCourse['cos']; numbered: boolean } {
  const list = entries(lines);
  const coded = list.map((entry) => CO_PREFIX.exec(entry)?.[1]);
  const numbered = coded.length > 0 && coded.every(Boolean) && new Set(coded).size === coded.length;
  const cos = list.map((entry, i) => {
    const { statement, levels } = statedBloom(entry.replace(CO_PREFIX, ''), note);
    return { code: `CO${numbered ? Number(coded[i]) : i + 1}`, statement, bloomLevels: levels, suggestedBloom: null };
  });
  return { cos, numbered };
}

// "One page" imports (06 §4.8): a numeric id, or a URL on the courseware host whose path is /course/<id>. Anything
// else is refused, so the importer cannot be pointed at another host.
export function coursewarePageId(input: string, baseUrl: string): number | null {
  const text = input.trim();
  if (/^\d{1,7}$/.test(text)) return Number(text);
  const url = URL.parse(text);
  if (!url || url.origin !== new URL(baseUrl).origin) return null;
  const match = /^\/course\/(\d{1,7})\/?$/.exec(url.pathname);
  return match ? Number(match[1]) : null;
}

// Reads one courseware page (lib/integrations/courseware.ts) into a catalogue course. Anything the page leaves
// unclear becomes an issue for the course's reviewer; nothing is guessed silently.
export function normalizeCourseware(page: CoursewarePage): ImportedCourse {
  const items = prepare(page.blocks);
  const issues = new Set<string>();
  const note: Note = (issue) => issues.add(issue);
  let trimmed = false;
  // A cut ends in "…"; it is noted for review, except a long session description, which is common and harmless.
  const cut = (text: string, max: number, note = true) => {
    if (text.length <= max) return text;
    trimmed ||= note;
    return `${text.slice(0, max - 1).trimEnd()}…`;
  };
  const fit = <T>(list: readonly T[], max: number) => {
    if (list.length > max) trimmed = true;
    return list.slice(0, max);
  };

  let faculty: string | null = null;
  let code: string | null = null;
  let credits: ReturnType<typeof parseCredits> = null;
  const runs: { section: Section; items: Item[] }[] = [];
  const tables: string[][][] = [];

  for (const [i, item] of items.entries()) {
    if (item.kind === 'table') {
      tables.push(item.rows);
      // A header row over a value row: "Subject Code | Name | T-Pr-Pi | Credits" above "CUTM 2603 | … | 3-2-0 | 5".
      const [header = [], values = []] = item.rows;
      header.forEach((field, c) => {
        const value = values[c] ?? '';
        if (/^(?:subject|course)\s*code$/i.test(field)) code ??= extractCode(value);
        if (/^(?:t\s*-\s*p\w*\s*-\s*p\w*|l\s*-\s*t\s*-\s*p)$/i.test(field)) credits ??= parseCredits(value);
      });
      // Descriptor tables pair a field with its value: "Course Code | ASAG 1101 | Credits | 3 (2+1)".
      for (const row of item.rows) {
        for (let c = 0; c + 1 < row.length; c += 2) {
          const [field, value] = [row[c], row[c + 1]];
          if (!value) continue;
          if (/^course\s*code$/i.test(field)) code ??= extractCode(value);
          if (/^credits?$/i.test(field)) credits ??= parseCredits(value);
          if (/^course\s*(?:coordinator|faculty)$/i.test(field)) faculty ??= value;
        }
      }
      runs.at(-1)?.items.push(item);
      continue;
    }
    const { text } = item;
    const codeCredit = FACTS.codeCredit.exec(text);
    if (codeCredit) {
      code ??= extractCode(codeCredit[1]);
      credits ??= parseCredits(codeCredit[1]);
      continue;
    }
    const facultyLine = FACTS.faculty.exec(text);
    if (facultyLine) {
      const next = items[i + 1];
      const value = facultyLine[1] || (next?.kind === 'line' && next.text.length <= 80 ? next.text : '');
      faculty ??= value || null;
      continue;
    }
    const codeLine = FACTS.code.exec(text);
    if (codeLine) {
      code ??= extractCode(codeLine[1]);
      continue;
    }
    const creditLine = FACTS.credits.exec(text);
    if (creditLine) {
      credits ??= parseCredits(creditLine[1]);
      continue;
    }
    if (FACTS.name.test(text)) continue;
    // Some pages go straight from the outcomes to "Module 1" with no syllabus heading.
    const current = runs.at(-1)?.section;
    if (item.bold && MODULE.test(text) && current && !['syllabus', 'sessions', 'projects'].includes(current)) {
      runs.push({ section: 'syllabus', items: [] });
    }
    // Some pages list "Session 1", "Session 2" … with no "Session plan" heading above them.
    const session = SESSION.exec(text);
    if (session && /^1(?!\d)/.test(session[1]) && runs.at(-1)?.section !== 'sessions') {
      runs.push({ section: 'sessions', items: [] });
    }
    const heading = sectionOf(text);
    if (heading) {
      runs.push({ section: heading.section, items: [] });
      if (heading.rest) runs.at(-1)?.items.push({ kind: 'line', text: heading.rest, bold: false });
      continue;
    }
    runs.at(-1)?.items.push(item);
  }

  const linesOf = (section: Section) =>
    runs
      .filter((run) => run.section === section)
      .flatMap((run) => run.items.flatMap((item) => (item.kind === 'line' ? [item.text] : [])));

  code ??= extractCode(page.identifier ?? '') ?? extractCode(page.title);
  if (!code) note('The courseware page has no course code.');
  if (!credits) note('The courseware page gives no credits (T-P-Pj).');
  else if (credits.twoPart) {
    note('The page gives credits in two parts; they were read as theory + practice with no project credits.');
  }

  // Outcomes come from a CO table when the page has one, otherwise from the list under "Course outcomes".
  let cos = tables.map((rows) => readCoTable(rows, note)).find((found) => found !== null) ?? null;
  if (!cos) {
    const listed = outcomesFromList(linesOf('outcomes'), note);
    cos = listed.cos;
    if (cos.length && !listed.numbered) note('The outcomes had no CO numbers, so they were numbered in order.');
  }
  cos = fit(cos, LIMIT.cos).map((co) => {
    const statement = cut(co.statement, LIMIT.coStatement);
    return { ...co, statement, suggestedBloom: co.bloomLevels.length ? null : inferBloom(statement) };
  });
  const coCodes = new Set(cos.map((co) => co.code));
  const coMap = (tables.map((rows) => readMapping(rows, note)).find((found) => found !== null) ?? []).filter((cell) =>
    coCodes.has(cell.co),
  );
  const rows = [...coCodes].map((co) =>
    coMap
      .filter((cell) => cell.co === co)
      .map((cell) => `${cell.outcome}:${cell.level}`)
      .join(),
  );
  if (rows.length > 1 && rows[0] && rows.every((row) => row === rows[0])) {
    note('Every outcome has the same CO–PO mapping on the page; check that it is meant.');
  }

  const modules: ModuleDraft[] = [];
  const projects: string[] = [];
  for (const run of runs.filter((r) => r.section === 'syllabus')) readSyllabus(run.items, modules, projects);
  // Project lists grouped under module sub-headings: the headings (and their wrapped second lines) are not projects.
  let underModule = false;
  const projectLines = linesOf('projects').filter((line) => {
    if (MODULE.test(line)) underModule = true;
    else if (BULLET.test(line)) underModule = false;
    return !underModule;
  });
  projects.push(...entries(projectLines));

  const books = (section: 'textbooks' | 'references') => {
    const lines: string[] = [];
    for (const line of linesOf(section)) {
      if (/^chapters?\s*[:\-–]/i.test(line) && lines.length) lines[lines.length - 1] += ` · ${line}`;
      else lines.push(line.replace(/^\d{1,2}\s+(?=[A-Z])/, ''));
    }
    return fit(entries(lines, true), LIMIT[section]).map((book) => cut(book, LIMIT.book));
  };

  const drafts: Draft[] = [];
  for (const run of runs.filter((r) => r.section === 'sessions')) {
    let lines: Line[] = [];
    for (const item of run.items) {
      if (item.kind === 'line') {
        lines.push(item);
        continue;
      }
      sessionsFromLines(lines, drafts);
      lines = [];
      sessionsFromTable(item.rows, drafts);
    }
    sessionsFromLines(lines, drafts);
  }
  const sessionPlan = drafts.flatMap((draft) => {
    const kind = draft.kind ?? 'theory';
    // Separate lines of a session become "a; b", but a one- or two-word line is a wrapped piece of its neighbour.
    const joined = draft.lines
      .map(topicOf)
      .filter(Boolean)
      .reduce((text, line, i, all) => {
        if (!text) return line;
        const wrapped = all[i - 1].split(' ').length <= 2 || line.split(' ').length <= 2;
        return `${text}${/[.;:!?]$/.test(text) || wrapped ? '' : ';'} ${line}`;
      }, '');
    const topic = cut(joined || 'Session', LIMIT.sessionTopic, false);
    return Array.from({ length: draft.count }, () => ({ topic, kind }));
  });

  const result: ImportedCourse = {
    code,
    title: tidy(
      page.title
        .replace(/^\s*(?:skill|course)\s*:\s*/i, '')
        .replace(/[\s\-–:(]*\b[A-Z]{2,6}\s?-?\d{4}\b\)?/i, '')
        .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, ''),
    ),
    type: page.typeLabel ? courseTypeFromLabel(page.typeLabel) : null,
    credits: credits?.credits ?? null,
    facultyName: faculty ? tidy(faculty) : null,
    objectives: fit(entries(linesOf('objectives')), LIMIT.objectives).map((o) => cut(o, LIMIT.objective)),
    cos,
    coMap,
    modules: fit(modules, LIMIT.modules).map((m) => ({
      title: cut(m.title, LIMIT.moduleTitle),
      hours: m.hours,
      topics: cut(entries(m.topics).join('\n'), LIMIT.moduleTopics),
      practicals: fit(entries(m.practicals), LIMIT.practicals).map((p) => cut(p, LIMIT.practical)),
    })),
    projects: fit([...new Set(projects.map(tidy))], LIMIT.projects).map((p) => cut(p, LIMIT.project)),
    textbooks: books('textbooks'),
    references: books('references'),
    sessionPlan: fit(sessionPlan, LIMIT.sessions),
    issues: [],
  };
  if (trimmed) note('Some entries were too long or too many and were cut; check them against the page.');
  result.issues = [...issues];
  return result;
}
