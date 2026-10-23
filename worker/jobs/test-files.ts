import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import type { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import writeXlsxFile, { type Row } from 'write-excel-file/node';
import { correctText, figuresOf, givenText, rulesOf, type ResultFigures } from '@/lib/data/results';
import { countedAttempt } from '@/lib/domain/attempts';
import { difficultyLabel, rankAll } from '@/lib/domain/results';
import { docOf, plainText } from '@/lib/domain/rich-text';
import { codeFromBytes, earnsCertificate, pdfSafe } from '@/lib/domain/test-files';
import { buildKey, sanitizeFileName } from '@/lib/domain/uploads';
import { env } from '@/lib/env';
import { formatDate, formatDateTime, formatPct, ITEM_LABEL, ordinal } from '@/lib/format';
import { deleteObjects, uploadFromFile } from '@/lib/integrations/storage';
import { log } from '@/lib/log';
import { Assessment } from '@/lib/models/assessment';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Offering } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import { TestFile, type TestFileDoc } from '@/lib/models/test-file';
import { TestStats } from '@/lib/models/test-stats';
import { User } from '@/lib/models/user';
import { XLSX_TYPE } from '@/lib/schemas/assessment';
import type { MakeTestFileJob } from '@/lib/schemas/jobs';

// M04b (TP-12): the files made from a test's results — a taker's scorecard and certificate (mock-up C7), the staff's
// reports PDF (a page or more per hand-in) and Excel export. Built on disk, put in storage under `test-file/…`, then the
// `testFiles` record points at it; the object it pointed at before is deleted.

// The lockup at about 300 dpi for the size it prints (logo.png is 960 × 1516).
const LOGO = join(process.cwd(), 'public', 'brand', 'logo-print.png');
const INK = '#1f2430';
const MUTED = '#6b7280';
const RULE = '#d9dce3';
const SHADE = '#f3f4f7';
const NAVY = '#1d2b5c';
const GOLD = '#a57c2a';
const PALE_BLUE = '#c9d6f7';
const PALE_GOLD = '#d8bf8a';
const BODY = '#3a3f4b';
const MARGIN = 48;
const BATCH = 200;
const HANDED_IN = ['submitted', 'graded'] as const;

type Test = NonNullable<Awaited<ReturnType<typeof readTest>>>;
type Paper = NonNullable<Awaited<ReturnType<typeof readPaper>>>;
type Person = { name: string; email: string; rollNo?: string | null };
type Context = {
  line: string;
  takers: 'students' | 'candidates';
  cos: { _id: Types.ObjectId; code: string; statement: string }[];
};
type Made = { contentType: string; fileName: string; ownerId: string };

const readTest = (id: Types.ObjectId) => Assessment.findById(id).lean();
const readPaper = (id: Types.ObjectId) =>
  Submission.findById(id, { 'proctor.events': 0, 'proctor.snapshots': 0, similar: 0 }).lean();

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const promptOf = (prompt: unknown) => clip(plainText(docOf(prompt)).trim() || 'Question', 160);
const marks = (value: number | null | undefined) => (typeof value === 'number' ? String(value) : '—');

async function contextOf(test: Test): Promise<Context> {
  const offering = test.offeringId ? await Offering.findById(test.offeringId, { courseId: 1 }).lean() : null;
  const course = offering ? await Course.findById(offering.courseId, { code: 1, title: 1, cos: 1 }).lean() : null;
  if (course) return { line: `${course.code} · ${course.title}`, takers: 'students', cos: course.cos };
  return { line: 'Standalone test', takers: 'candidates', cos: [] };
}

async function peopleOf(ids: Types.ObjectId[]): Promise<Map<string, Person>> {
  const people = new Map<string, Person>();
  for (let at = 0; at < ids.length; at += 1000) {
    const found = await User.find({ _id: { $in: ids.slice(at, at + 1000) } }, { name: 1, email: 1, rollNo: 1 }).lean();
    for (const person of found) people.set(String(person._id), person);
  }
  return people;
}

// --- PDF pieces ---

async function writePdf(
  path: string,
  options: PDFKit.PDFDocumentOptions & { title: string },
  draw: (doc: PDFKit.PDFDocument) => Promise<void>,
): Promise<void> {
  const doc = new PDFDocument({ ...options, info: { Title: pdfSafe(options.title), Author: 'Centurion LMS' } });
  const out = createWriteStream(path);
  doc.pipe(out);
  try {
    await draw(doc);
  } finally {
    doc.end();
  }
  await finished(out);
}

const contentWidth = (doc: PDFKit.PDFDocument) => doc.page.width - 2 * MARGIN;

// The top of a scorecard or report page: the lockup, what the page is, the test and its course.
function heading(doc: PDFKit.PDFDocument, what: string, test: Test, context: Context) {
  doc.image(LOGO, MARGIN, 38, { height: 54 });
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text('CENTURION UNIVERSITY OF TECHNOLOGY AND MANAGEMENT', MARGIN + 46, 48, { characterSpacing: 0.6 });
  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor(INK)
    .text(what, MARGIN + 46, 61);
  doc
    .moveTo(MARGIN, 104)
    .lineTo(MARGIN + contentWidth(doc), 104)
    .lineWidth(0.75)
    .strokeColor(RULE)
    .stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(INK)
    .text(pdfSafe(test.title), MARGIN, 118, { width: contentWidth(doc) });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(pdfSafe(context.line), { width: contentWidth(doc) });
  doc.moveDown(1);
}

function subhead(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(1).font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(text, MARGIN);
  doc.moveDown(0.4);
}

function facts(doc: PDFKit.PDFDocument, rows: [string, string][]) {
  doc.font('Helvetica').fontSize(9);
  doc.table({
    position: { x: MARGIN },
    maxWidth: contentWidth(doc),
    columnStyles: [80, '*'],
    defaultStyle: { border: false, padding: [2, 0], textColor: INK },
    data: rows.map(([label, value]) => [{ text: label, textColor: MUTED }, pdfSafe(value)]),
  });
}

// Shaded figures in a row: a small label over each value.
function tiles(doc: PDFKit.PDFDocument, figures: [string, string][]) {
  doc.moveDown(0.8);
  doc.table({
    position: { x: MARGIN },
    maxWidth: contentWidth(doc),
    // Each at least as wide as its value, so a rating such as "Recommended" never breaks.
    columnStyles: figures.map(([, value]) => ({
      minWidth: doc.font('Helvetica-Bold').fontSize(12).widthOfString(pdfSafe(value)) + 17,
    })),
    defaultStyle: { border: false, backgroundColor: SHADE, textColor: INK },
    data: [
      figures.map(([label]): PDFKit.Mixins.CellOptions => ({
        text: label,
        textColor: MUTED,
        font: { src: 'Helvetica', size: 8 },
        padding: [8, 8, 1, 8],
      })),
      figures.map(([, value]): PDFKit.Mixins.CellOptions => ({
        text: pdfSafe(value),
        font: { src: 'Helvetica-Bold', size: 12 },
        padding: [1, 8, 8, 8],
      })),
    ],
  });
}

// A shaded header row over hairline rules; a width is in points, or '*' to share what is left.
function table(doc: PDFKit.PDFDocument, widths: (number | '*')[], header: string[], rows: string[][]) {
  doc.font('Helvetica').fontSize(8.5);
  doc.table({
    position: { x: MARGIN },
    maxWidth: contentWidth(doc),
    columnStyles: widths,
    defaultStyle: { border: { bottom: 0.5 }, borderColor: RULE, padding: [5, 5], textColor: INK },
    data: [
      header.map((text) => ({ text, type: 'TH' as const, backgroundColor: SHADE, font: { src: 'Helvetica-Bold' } })),
      ...rows.map((row) => row.map(pdfSafe)),
    ],
  });
}

// One line at the foot of the current page (below its margin, so it never starts another page).
function footer(doc: PDFKit.PDFDocument, text: string) {
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(text, MARGIN, doc.page.height - 32, { width: contentWidth(doc), align: 'center', lineBreak: false });
  doc.page.margins.bottom = bottom;
}

// pdfkit cannot centre a line whose font changes part-way, so a sentence with bold parts is set here: its words fill
// lines up to `width`, and each line is drawn centred on `middle`, a run of one font at a time.
function centred(
  doc: PDFKit.PDFDocument,
  parts: [string, boolean][],
  { middle, top, width, size }: { middle: number; top: number; width: number; size: number },
) {
  const fontOf = (bold: boolean) => (bold ? 'Helvetica-Bold' : 'Helvetica');
  const measure = (text: string, bold: boolean) => doc.font(fontOf(bold)).fontSize(size).widthOfString(text);
  const lines: { text: string; bold: boolean }[][] = [[]];
  let used = 0;
  for (const [text, bold] of parts) {
    for (const word of pdfSafe(text).split(/(?<= )/)) {
      const line = lines[lines.length - 1];
      if (line.length > 0 && used + measure(word.trimEnd(), bold) > width) {
        lines.push([]);
        used = 0;
      }
      const current = lines[lines.length - 1];
      if (current.length === 0 && word.trim() === '') continue;
      const last = current.at(-1);
      if (last?.bold === bold) last.text += word;
      else current.push({ text: word, bold });
      used += measure(word, bold);
    }
  }
  lines.forEach((runs, i) => {
    const last = runs.at(-1);
    if (last) last.text = last.text.trimEnd();
    const widths = runs.map((run) => measure(run.text, run.bold));
    let x = middle - widths.reduce((sum, w) => sum + w, 0) / 2;
    runs.forEach((run, j) => {
      doc
        .font(fontOf(run.bold))
        .fontSize(size)
        .text(run.text, x, top + i * size * 1.6, { lineBreak: false });
      x += widths[j];
    });
  });
}

function figureTiles(figures: ResultFigures): [string, string][] {
  return [
    ['Marks', `${figures.total} / ${figures.maxMarks}`],
    ['Percentage', formatPct(figures.pct)],
    ...(figures.band ? [['Rating', figures.band] satisfies [string, string]] : []),
    ...(figures.standing
      ? [
          ['Rank', `${figures.standing.rank} of ${figures.standing.of}`] satisfies [string, string],
          ['Percentile', ordinal(figures.standing.percentile)] satisfies [string, string],
        ]
      : []),
  ];
}

const proctorLine = (warnings: number, penalty: number) =>
  `Proctoring: ${warnings} serious warning${warnings === 1 ? '' : 's'}, ${penalty > 0 ? `${penalty} marks taken off` : 'no deduction'}.`;

// --- The files ---

function drawScorecard(
  doc: PDFKit.PDFDocument,
  {
    test,
    context,
    paper,
    person,
    figures,
  }: { test: Test; context: Context; paper: Paper; person: Person; figures: ResultFigures },
) {
  const rules = rulesOf(test);
  heading(doc, 'Scorecard', test, context);
  facts(doc, [
    ['Name', person.name],
    ['Email', person.email],
    ...(person.rollNo ? [['Roll no.', person.rollNo] satisfies [string, string]] : []),
    ['Handed in', paper.submittedAt ? formatDateTime(paper.submittedAt) : '—'],
  ]);
  tiles(doc, figureTiles(figures));
  if (figures.warnings > 0) {
    doc.moveDown(0.6).font('Helvetica').fontSize(8.5).fillColor(MUTED);
    doc.text(proctorLine(figures.warnings, figures.penalty), MARGIN);
  }
  if (figures.sections.length > 0) {
    subhead(doc, 'By section');
    table(
      doc,
      ['*', 70, 70],
      ['Section', 'Marks', 'Out of'],
      figures.sections.map((s) => [s.title, String(s.marks), String(s.maxMarks)]),
    );
  }
  if (figures.outcomes.length > 0) {
    subhead(doc, 'By course outcome');
    table(
      doc,
      ['*', 70, 70],
      ['Outcome', 'Marks', 'Out of'],
      figures.outcomes.map((co) => [`${co.code} · ${clip(co.statement, 110)}`, String(co.marks), String(co.maxMarks)]),
    );
  }
  subhead(doc, 'Questions');
  table(
    doc,
    rules.showAnswers ? [24, '*', 110, 110, 52] : [24, '*', 150, 52],
    ['#', 'Question', 'Your answer', ...(rules.showAnswers ? ['Right answer'] : []), 'Marks'],
    paper.paper.map((item, i) => {
      const score = paper.scores?.[String(item._id)];
      return [
        String(i + 1),
        promptOf(item.prompt),
        givenText(item, paper.answers?.[String(item._id)], 'Your code') ?? 'Not answered',
        ...(rules.showAnswers ? [correctText(item) ?? '—'] : []),
        `${marks(score?.marks)} / ${item.maxMarks}`,
      ];
    }),
  );
  footer(doc, `Made by Centurion LMS on ${formatDateTime(new Date())} from the marks on record then.`);
}

function drawCertificate(
  doc: PDFKit.PDFDocument,
  c: {
    test: Test;
    context: Context;
    person: Person;
    figures: ResultFigures;
    takenOn: Date;
    signer: { name: string; line: string };
    code: string;
  },
) {
  const { width: w, height: h } = doc.page;
  doc
    .lineWidth(1.5)
    .strokeColor(PALE_BLUE)
    .rect(14, 14, w - 28, h - 28)
    .stroke();
  doc
    .lineWidth(0.75)
    .strokeColor(PALE_GOLD)
    .rect(20, 20, w - 40, h - 40)
    .stroke();
  doc.image(LOGO, w / 2 - 31, 52, { height: 98 });
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(GOLD)
    .text('CERTIFICATE OF ACHIEVEMENT', 0, 200, { width: w, align: 'center', characterSpacing: 3 });
  doc
    .font('Times-Roman')
    .fontSize(40)
    .fillColor(NAVY)
    .text(pdfSafe(c.person.name), 60, 222, { width: w - 120, align: 'center' });
  const { standing, band } = c.figures;
  const parts: [string, boolean][] = [
    ['took ', false],
    [c.test.title, true],
    [` on ${formatDate(c.takenOn)} and scored `, false],
    [formatPct(c.figures.pct), true],
    [standing ? `, ranking ${ordinal(standing.rank)} of ${standing.of} ${c.context.takers}` : '', false],
    ...(band
      ? [[', with the rating ', false] satisfies [string, boolean], [band, true] satisfies [string, boolean]]
      : []),
    ['.', false],
  ];
  doc.fillColor(BODY);
  centred(doc, parts, { middle: w / 2, top: doc.y + 18, width: w - 300, size: 12.5 });

  const base = h - 128;
  const url = `${env().APP_URL}/v/${c.code}`;
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const cell = 70 / qr.modules.size;
  const qrX = w / 2 - 35;
  for (let row = 0; row < qr.modules.size; row++) {
    for (let col = 0; col < qr.modules.size; col++) {
      if (qr.modules.get(row, col)) doc.rect(qrX + col * cell, base + row * cell, cell, cell);
    }
  }
  doc.fillColor(INK).fill();
  doc.link(qrX, base, 70, 70, url);
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(BODY)
    .text(`Verify: ${new URL(env().APP_URL).host}/v/${c.code}`, 0, base + 78, { width: w, align: 'center' });

  const signature = (x: number, align: 'left' | 'right', name: string, line: string) => {
    doc
      .moveTo(x, base + 50)
      .lineTo(x + 180, base + 50)
      .lineWidth(0.75)
      .strokeColor(BODY)
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(INK)
      .text(pdfSafe(name), x, base + 58, { width: 180, align });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(BODY)
      .text(pdfSafe(line), x, base + 72, { width: 180, align });
  };
  signature(90, 'left', c.signer.name, c.signer.line);
  signature(w - 270, 'right', 'Controller of Examinations', 'Centurion University');
}

async function drawReports(doc: PDFKit.PDFDocument, test: Test, context: Context) {
  const attempts = await Submission.find(
    { assessmentId: test._id, status: { $in: HANDED_IN } },
    { studentId: 1, attemptNo: 1, status: 1, total: 1 },
  ).lean();
  const byStudent = Map.groupBy(attempts, (attempt) => String(attempt.studentId));
  const people = await peopleOf([...new Set(attempts.map((attempt) => attempt.studentId))]);
  const counted = new Set(
    [...byStudent.values()].flatMap((mine) => {
      const kept = countedAttempt(mine, test.attemptPolicy);
      return kept ? [String(kept._id)] : [];
    }),
  );
  const order = [...byStudent.entries()]
    .sort(([a], [b]) => (people.get(a)?.name ?? '').localeCompare(people.get(b)?.name ?? ''))
    .flatMap(([, mine]) => mine.sort((a, b) => a.attemptNo - b.attemptNo));

  heading(doc, 'Attempt reports', test, context);
  facts(doc, [
    ['Hand-ins', String(order.length)],
    ['People', String(byStudent.size)],
    ['Made', formatDateTime(new Date())],
  ]);
  doc.moveDown(1).font('Helvetica').fontSize(9).fillColor(MUTED);
  doc.text('One report for each hand-in, by name, with the marks on record when this file was made.', MARGIN);

  for (let at = 0; at < order.length; at += BATCH) {
    const batch = order.slice(at, at + BATCH);
    const papers = await Submission.find(
      { _id: { $in: batch.map((attempt) => attempt._id) } },
      { 'proctor.events': 0, 'proctor.snapshots': 0, similar: 0 },
    ).lean();
    const byId = new Map(papers.map((paper) => [String(paper._id), paper]));
    for (const attempt of batch) {
      const paper = byId.get(String(attempt._id));
      if (!paper) continue;
      const person = people.get(String(paper.studentId)) ?? { name: 'Unknown', email: '—' };
      const tries = byStudent.get(String(paper.studentId))?.length ?? 1;
      doc.addPage();
      heading(doc, 'Attempt report', test, context);
      const when = [
        paper.submittedAt ? formatDateTime(paper.submittedAt) : '—',
        ...(paper.late ? ['late'] : []),
        ...(paper.autoSubmitted ? ['when time ran out'] : []),
        ...(paper.endedBy === 'warnings' ? ['ended for too many warnings'] : []),
        ...(paper.endedBy === 'teacher' ? ['ended by a teacher'] : []),
      ];
      facts(doc, [
        ['Name', person.name],
        ['Email', person.email],
        ...(person.rollNo ? [['Roll no.', person.rollNo] satisfies [string, string]] : []),
        ['Attempt', `${paper.attemptNo} of ${tries}${counted.has(String(paper._id)) ? ', the one that counts' : ''}`],
        ['Handed in', when.join(' · ')],
        ['Status', paper.status === 'graded' ? 'Marked' : 'Still to mark'],
      ]);
      const total = typeof paper.total === 'number' ? paper.total : null;
      const figures = total === null ? null : figuresOf(test, paper, total, { takers: null, cos: [] });
      tiles(doc, [
        ['Marks', `${marks(total)} / ${test.maxMarks}`],
        ['Percentage', figures ? formatPct(figures.pct) : '—'],
        ['Serious warnings', String(paper.proctor?.hard ?? 0)],
        ['Marks off', String(figures?.penalty ?? 0)],
      ]);
      subhead(doc, 'Questions');
      table(
        doc,
        [24, '*', 170, 56],
        ['#', 'Question', 'Answer', 'Marks'],
        paper.paper.map((item, i) => {
          const score = paper.scores?.[String(item._id)];
          return [
            String(i + 1),
            promptOf(item.prompt),
            givenText(item, paper.answers?.[String(item._id)], 'Code') ?? 'Not answered',
            score ? `${score.marks} / ${item.maxMarks}` : `To mark / ${item.maxMarks}`,
          ];
        }),
      );
    }
  }
}

async function writeResults(path: string, test: Test, context: Context): Promise<void> {
  const attempts = await Submission.find(
    { assessmentId: test._id, status: { $in: HANDED_IN } },
    { studentId: 1, attemptNo: 1, status: 1, total: 1 },
  ).lean();
  const rows = [...Map.groupBy(attempts, (attempt) => String(attempt.studentId)).values()].map((mine) => {
    const counted = countedAttempt(mine, test.attemptPolicy);
    return {
      counted,
      shown: counted ?? mine.reduce((a, b) => (b.attemptNo > a.attemptNo ? b : a)),
      tries: mine.length,
    };
  });
  const ranks = rankAll(
    rows.flatMap(({ counted }) => (counted ? [{ id: String(counted._id), total: counted.total }] : [])),
  );
  const people = await peopleOf(rows.map((row) => row.shown.studentId));
  const rankOf = (id: Types.ObjectId) => ranks.get(String(id))?.rank ?? Number.MAX_SAFE_INTEGER;
  rows.sort(
    (a, b) =>
      rankOf(a.shown._id) - rankOf(b.shown._id) ||
      (people.get(String(a.shown.studentId))?.name ?? '').localeCompare(
        people.get(String(b.shown.studentId))?.name ?? '',
      ),
  );

  const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
  const header: Row = [
    ...['Rank', 'Name', 'Email', 'Roll no.', 'Attempts', 'Attempt', 'Handed in', 'Late', 'Status', 'Marks', 'Out of'],
    ...['Percentage', 'Rating', 'Percentile', 'Serious warnings', 'Marks off'],
    ...test.sections.map((section) => section.title),
    ...test.items.map((item, i) => `Q${i + 1} (${item.maxMarks})`),
  ].map(bold);
  const data: Row[] = [header];
  for (let at = 0; at < rows.length; at += BATCH) {
    const batch = rows.slice(at, at + BATCH);
    const papers = await Submission.find(
      { _id: { $in: batch.map((row) => row.shown._id) } },
      { answers: 0, results: 0, similar: 0, 'proctor.events': 0, 'proctor.snapshots': 0 },
    ).lean();
    const byId = new Map(papers.map((paper) => [String(paper._id), paper]));
    for (const { counted, shown, tries } of batch) {
      const paper = byId.get(String(shown._id));
      if (!paper) continue;
      const person = people.get(String(shown.studentId));
      const rank = ranks.get(String(shown._id));
      const figures = counted ? figuresOf(test, paper, counted.total, { takers: null, cos: [] }) : null;
      const bySection = new Map(figures?.sections.map((section) => [section.title, section.marks]));
      data.push([
        rank?.rank ?? null,
        person?.name ?? 'Unknown',
        person?.email ?? null,
        person?.rollNo ?? null,
        tries,
        shown.attemptNo,
        paper.submittedAt ? formatDateTime(paper.submittedAt) : null,
        paper.late ? 'Late' : null,
        counted ? 'Marked' : 'Still to mark',
        counted?.total ?? null,
        test.maxMarks,
        figures?.pct ?? null,
        figures?.band ?? null,
        rank?.percentile ?? null,
        paper.proctor?.hard ?? 0,
        figures?.penalty ?? null,
        ...test.sections.map((section) => bySection.get(section.title) ?? null),
        ...test.items.map((item) => paper.scores?.[String(item._id)]?.marks ?? null),
      ]);
    }
  }

  const stats = await TestStats.findById(test._id, { items: 1 }).lean();
  const coCode = new Map(context.cos.map((co) => [String(co._id), co.code]));
  const questions: Row[] = [
    [
      ...['Question', 'Type', 'Section', 'Outcomes', 'Answered by', 'Correct %', 'Difficulty', 'Discrimination'],
      'Most picked wrong answer',
    ].map(bold),
    ...(stats?.items ?? []).map((item): Row => [
      item.title,
      ITEM_LABEL[item.type],
      item.sectionTitle ?? null,
      item.coIds.flatMap((id) => coCode.get(String(id)) ?? []).join(', ') || null,
      item.n,
      item.correctPct,
      difficultyLabel(item.correctPct),
      item.discrimination ?? null,
      item.wrongPick?.text ? `${item.wrongPick.text} (${item.wrongPick.pct ?? 0}%)` : null,
    ]),
  ];

  await writeXlsxFile([
    {
      sheet: 'Results',
      data,
      stickyRowsCount: 1,
      columns: [8, 28, 30, 14, 9, 8, 22, 6, 13, 8, 8, 11, 14, 10, 10, 10].map((width) => ({ width })),
    },
    ...(stats
      ? [
          {
            sheet: 'Questions',
            data: questions,
            stickyRowsCount: 1,
            columns: [40, 14, 18, 14, 11, 10, 12, 16, 28].map((width) => ({ width })),
          },
        ]
      : []),
  ]).toFile(path);
}

// --- The job ---

// A certificate's code is given once, the first time one is made for the attempt; setting it leaves the attempt's
// `updatedAt` alone, so its scorecard stays current.
async function certificateCode(paper: Paper): Promise<string> {
  if (paper.certificateCode) return paper.certificateCode;
  await Submission.updateOne(
    { _id: paper._id, certificateCode: null },
    { $set: { certificateCode: codeFromBytes(randomBytes(10)) } },
    { timestamps: false },
  );
  const saved = await Submission.findById(paper._id, { certificateCode: 1 }).lean();
  if (!saved?.certificateCode) throw new Error('The certificate code was not saved.');
  return saved.certificateCode;
}

// Builds the file at `path`; null when what it is made from is gone (or, for a certificate, no longer earns one).
async function build(
  file: Pick<TestFileDoc, 'assessmentId' | 'kind' | 'submissionId' | 'requestedBy'>,
  path: string,
): Promise<Made | null> {
  const test = await readTest(file.assessmentId);
  if (!test) return null;
  const context = await contextOf(test);
  const name = (what: string, ext: string, who?: string) =>
    sanitizeFileName(`${what} - ${test.title}${who ? ` - ${who}` : ''}.${ext}`);
  if (file.kind === 'results_xlsx') {
    await writeResults(path, test, context);
    return { contentType: XLSX_TYPE, fileName: name('Results', 'xlsx'), ownerId: String(file.requestedBy) };
  }
  if (file.kind === 'reports_pdf') {
    await writePdf(path, { size: 'A4', margin: MARGIN, title: `Attempt reports: ${test.title}` }, (doc) =>
      drawReports(doc, test, context),
    );
    return { contentType: 'application/pdf', fileName: name('Reports', 'pdf'), ownerId: String(file.requestedBy) };
  }

  const paper = file.submissionId ? await readPaper(file.submissionId) : null;
  if (!paper || paper.status !== 'graded' || typeof paper.total !== 'number') return null;
  const person = await User.findById(paper.studentId, { name: 1, email: 1, rollNo: 1 }).lean();
  if (!person) return null;
  const stats = test.status === 'results_published' ? await TestStats.findById(test._id, { takers: 1 }).lean() : null;
  const figures = figuresOf(test, paper, paper.total, { takers: stats?.takers ?? null, cos: context.cos });
  const ownerId = String(paper.studentId);

  if (file.kind === 'scorecard') {
    await writePdf(path, { size: 'A4', margin: MARGIN, title: `Scorecard: ${test.title}` }, async (doc) =>
      drawScorecard(doc, { test, context, paper, person, figures }),
    );
    return { contentType: 'application/pdf', fileName: name('Scorecard', 'pdf', person.name), ownerId };
  }

  if (!earnsCertificate(figures.pct, rulesOf(test).certificateFromPct)) return null;
  const code = await certificateCode(paper);
  const owner = await User.findById(test.createdBy, { name: 1, departmentId: 1 }).lean();
  const department = owner?.departmentId ? await Department.findById(owner.departmentId, { name: 1 }).lean() : null;
  await writePdf(
    path,
    { size: 'A4', layout: 'landscape', margin: 0, title: `Certificate: ${test.title}` },
    async (doc) =>
      drawCertificate(doc, {
        test,
        context,
        person,
        figures,
        takenOn: paper.submittedAt ?? paper.startedAt,
        signer: {
          name: owner?.name ?? 'Centurion University',
          line: department ? `Department of ${department.name}` : 'Centurion University',
        },
        code,
      }),
  );
  return { contentType: 'application/pdf', fileName: name('Certificate', 'pdf', person.name), ownerId };
}

// `compute/makeTestFile` (06 §6, TP-12). Only the request it was queued for may finish it: when the file was asked for
// again meanwhile, the newer job makes it and this one's object is deleted. On its last try a failure marks the file
// failed, so its page offers to try again.
export async function makeTestFile({ fileId }: MakeTestFileJob, lastTry: boolean): Promise<void> {
  const file = await TestFile.findById(fileId).lean();
  if (!file || file.status !== 'making') return;
  const mine = { _id: file._id, requestedAt: file.requestedAt };
  const dir = await mkdtemp(join(tmpdir(), 'lms-test-file-'));
  try {
    const path = join(dir, 'file');
    const made = await build(file, path);
    if (!made) {
      await TestFile.updateOne(mine, { $set: { status: 'failed' } });
      return;
    }
    const key = buildKey('test-file', String(file.assessmentId), made.ownerId, crypto.randomUUID(), made.contentType);
    await uploadFromFile(key, path, made.contentType);
    const before = await TestFile.findOneAndUpdate(mine, {
      $set: { status: 'ready', key, fileName: made.fileName, madeAt: new Date() },
    }).lean();
    await deleteObjects(before ? (before.key ? [before.key] : []) : [key]);
    log.info('test file made', { fileId, kind: file.kind, current: Boolean(before) });
  } catch (error) {
    if (lastTry) await TestFile.updateOne(mine, { $set: { status: 'failed' } });
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
