import 'server-only';
import { Window, type Document, type Element, type Node } from 'happy-dom';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import type { CoursewareBlock, CoursewarePage } from '@/lib/schemas/structure';

// CUTM's public courseware site (courseware.cutm.ac.in): a listing at /courses?page=n and one page per course at
// /course/{id}. The page body is WYSIWYG HTML typed by each faculty member, so this adapter only flattens it into
// lines and tables; lib/domain/courseware.ts reads the course out of them.

// Pages are rendered on request and take 30–60 s.
const TIMEOUT_MS = 90_000;

export const coursewareUrl = (path = '') => `${env().COURSEWARE_URL.replace(/\/+$/, '')}${path}`;

// null when the page does not exist; any other failure (timeout, 5xx) is an integration error the job retries.
async function get(path: string): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(coursewareUrl(path), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': `CUTM-LMS catalogue importer (${env().APP_URL})` },
    });
  } catch (error) {
    throw new AppError('INTEGRATION', `Courseware did not answer for ${path}: ${String(error)}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new AppError('INTEGRATION', `Courseware answered ${response.status} for ${path}`);
  return response.text();
}

function parse<T>(html: string, read: (doc: Document) => T): T {
  const window = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
      disableComputedStyleRendering: true,
    },
  });
  try {
    return read(new window.DOMParser().parseFromString(html, 'text/html'));
  } finally {
    void window.happyDOM.abort();
    window.happyDOM.close();
  }
}

// One page of the listing: the course ids on it and the number of the last page.
export async function listCourseIds(page: number): Promise<{ ids: number[]; lastPage: number }> {
  const html = await get(`/courses?page=${page}`);
  if (html === null) return { ids: [], lastPage: page };
  return parse(html, (doc) => {
    const numbers = (selector: string, pattern: RegExp) =>
      [...doc.querySelectorAll(selector)].flatMap((a) => {
        const match = pattern.exec(a.getAttribute('href') ?? '');
        return match ? [Number(match[1])] : [];
      });
    const ids = [...new Set(numbers('a[href^="/course/"]', /^\/course\/(\d+)$/))];
    const lastPage = Math.max(page, ...numbers('a[href*="courses?page="]', /[?&]page=(\d+)/));
    return { ids, lastPage };
  });
}

export async function fetchCoursePage(id: number): Promise<CoursewarePage | null> {
  const html = await get(`/course/${id}`);
  return html === null ? null : parseCoursePage(html);
}

const isElement = (node: Node): node is Element => node.nodeType === node.ELEMENT_NODE;
const SKIP = new Set(['script', 'style', 'svg', 'img', 'iframe', 'video', 'audio', 'button', 'form']);
const BLOCK = new Set([
  'p',
  'div',
  'section',
  'article',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'hr',
  'tr',
  'td',
  'th',
  'thead',
  'tbody',
  'caption',
  'dl',
  'dt',
  'dd',
]);
const BOLD = /^(?:strong|b|h[1-6]|th)$/;

// Contact details are never stored (09 §5): an email address or an Indian mobile number is cut out of the text,
// and a line or table row labelled as contact details goes entirely.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const MOBILE = /(?<![\d-])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d-])/g;
const CONTACT_LABEL = /^\s*(?:contact|phone|mobile|mob|ph|tel|telephone|whatsapp|e-?mail)\b/i;
const redact = (text: string) => text.replace(EMAIL, '').replace(MOBILE, '');

const clean = (text: string) =>
  redact(text)
    .replace(/[\s ​]+/g, ' ')
    .trim();

// Text, `<br>` and block elements become lines; a line is bold when every visible character of it is. A list
// item is one line starting with "• ", since faculty wrap long items with `<br>`.
function flatten(root: Element): CoursewareBlock[] {
  const blocks: CoursewareBlock[] = [];
  let text = '';
  let plain = false;

  const end = () => {
    const line = clean(text);
    if (line && !CONTACT_LABEL.test(line)) blocks.push({ kind: 'line', text: line, bold: !plain });
    text = '';
    plain = false;
  };

  const walk = (node: Node, bold: boolean, item: boolean) => {
    for (const child of node.childNodes) {
      if (!isElement(child)) {
        if (child.nodeType !== child.TEXT_NODE) continue;
        const value = child.textContent;
        if (!bold && value.trim()) plain = true;
        text += value;
        continue;
      }
      const tag = child.localName;
      if (SKIP.has(tag)) continue;
      if (tag === 'br') {
        if (item) text += ' ';
        else end();
        continue;
      }
      if (tag === 'li') {
        end();
        text = '• ';
        walk(child, bold, true);
        end();
        continue;
      }
      if (tag === 'table') {
        end();
        const rows = tableRows(child);
        if (rows.length) blocks.push({ kind: 'table', rows });
        continue;
      }
      const block = BLOCK.has(tag);
      if (block) end();
      walk(child, bold || BOLD.test(tag), item && !block);
      if (block) end();
    }
  };

  walk(root, false, false);
  end();
  return blocks;
}

// A cell keeps its own line breaks as "\n"; rows of a nested table are not this table's rows.
function tableRows(table: Element): string[][] {
  return [...table.querySelectorAll('tr')]
    .filter((tr) => tr.closest('table') === table)
    .map((tr) =>
      [...tr.children]
        .filter((cell) => cell.localName === 'td' || cell.localName === 'th')
        .map((cell) =>
          flatten(cell)
            .map((block) => (block.kind === 'line' ? block.text : block.rows.map((row) => row.join(' ')).join('\n')))
            .join('\n'),
        ),
    )
    .filter((cells) => cells.some(Boolean) && !CONTACT_LABEL.test(cells[0] ?? ''));
}

export function parseCoursePage(html: string): CoursewarePage {
  return parse(html, (doc) => {
    const heading = doc.querySelector('main h1');
    if (!heading) throw new Error('The courseware page has no course title');
    const labels = [...(heading.previousElementSibling?.querySelectorAll('span') ?? [])]
      .filter((span) => !span.children.length)
      .map((span) => clean(span.textContent));
    const body = doc.querySelector('main .prose-cw');
    return {
      title: clean(heading.textContent),
      typeLabel: labels[0] || null,
      identifier: labels[1] || null,
      blocks: body ? flatten(body) : [],
    };
  });
}
