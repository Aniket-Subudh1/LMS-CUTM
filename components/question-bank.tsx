import Link from 'next/link';
import { DatabaseIcon, PencilSimpleIcon, PlusIcon, TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import { deleteBankItem, importBankCsv, saveBankItem } from '@/app/(app)/tests/bank/actions';
import { Field } from '@/components/action-form';
import { BloomChip } from '@/components/bloom-chip';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { QuestionDialog, TYPE_ICON } from '@/components/question-dialog';
import { RowMenu } from '@/components/row-menu';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getBank, getBankItem, type BankRow } from '@/lib/data/bank';
import { ITEM_LABEL } from '@/lib/format';
import { DIFFICULTIES, ITEM_TYPES } from '@/lib/schemas/assessment';
import { BANK_LIMITS, BankFilter } from '@/lib/schemas/bank';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

const Search = BankFilter.extend({
  page: pageParam.catch(1),
  new: z.string().max(40).optional().catch(undefined),
});

const LEVEL_TONE = { easy: 'success', medium: 'warning', hard: 'danger' } as const;
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// TP-05 (mock-up "Question bank"): a course's bank, shared by every offering of the course in any term, or a member of
// staff's own for their standalone tests. Questions are tagged so papers can be drawn by outcome, level and topic;
// they come one by one, from a CSV, or from a test ("Save to the bank"). Shared by the workspace tab and /tests/bank.
export async function QuestionBank({
  offeringId,
  base,
  searchParams,
}: {
  offeringId: string | null;
  base: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page, new: open, ...filter } = Search.parse(await searchParams);
  const bank = await getBank(offeringId ?? undefined, filter, page);
  const query = Object.fromEntries(Object.entries(filter).flatMap(([k, v]) => (v ? [[k, v]] : [])));
  const here = (name: string) => `${base}?${new URLSearchParams({ ...query, new: name })}`;
  const editId = open?.startsWith('edit-') ? open.slice(5) : undefined;
  const editing = editId ? await getBankItem(offeringId ?? undefined, editId) : undefined;
  const newType = ITEM_TYPES.find((type) => `item-${type}` === open);
  const scope = offeringId ? <input type="hidden" name="offeringId" value={offeringId} /> : null;
  const share = (n: number) => (bank.stats.total === 0 ? 0 : Math.round((100 * n) / bank.stats.total));
  const tiles = [
    { label: 'Questions', value: bank.stats.total.toLocaleString('en-IN') },
    {
      label: 'Easy / medium / hard %',
      value: `${share(bank.stats.easy)} / ${share(bank.stats.medium)} / ${share(bank.stats.hard)}`,
    },
    bank.courseTitle
      ? { label: 'Without an outcome', value: bank.stats.untagged.toLocaleString('en-IN') }
      : { label: 'Topics', value: bank.topics.length.toLocaleString('en-IN') },
    {
      label: 'Without a level',
      value: (bank.stats.total - bank.stats.easy - bank.stats.medium - bank.stats.hard).toLocaleString('en-IN'),
    },
  ];
  const filtered = Object.keys(query).length > 0;
  return (
    <>
      <Section
        icon={<PageIcon name="books" className="size-8" />}
        title={bank.courseTitle ? `Question bank · ${bank.courseTitle}` : 'Your question bank'}
        description={
          bank.courseTitle
            ? 'For every offering of this course, in any term. Tag questions so papers can be drawn by outcome, level and topic.'
            : 'For your tests outside a course. Tag questions so papers can be drawn by level and topic.'
        }
        action={
          bank.canEdit && (
            <Button asChild variant="outline" size="sm">
              <Link href={here('import')} scroll={false}>
                <UploadSimpleIcon /> Import CSV
              </Link>
            </Button>
          )
        }
      >
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
              <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
                <DatabaseIcon className="size-4.5" />
              </span>
              <div className="grid min-w-0">
                <dd className="text-lg leading-tight font-semibold tabular-nums">{tile.value}</dd>
                <dt className="text-muted-foreground order-first truncate text-xs">{tile.label}</dt>
              </div>
            </div>
          ))}
        </dl>
        {bank.canEdit && (
          <div className="grid gap-2 rounded-md border border-dashed p-3">
            <p className="text-muted-foreground flex items-center gap-2 text-[0.8125rem]">
              <PlusIcon className="size-4" /> Add a question
            </p>
            <div className="flex flex-wrap gap-2">
              {ITEM_TYPES.map((type) => {
                const TypeIcon = TYPE_ICON[type];
                return (
                  <Button key={type} asChild variant="outline" size="sm">
                    <Link href={here(`item-${type}`)} scroll={false}>
                      <TypeIcon /> {ITEM_LABEL[type]}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        <FilterForm
          action={base}
          submitLabel="Search"
          search={{ name: 'q', label: 'Search questions', placeholder: 'Search questions', defaultValue: filter.q }}
        >
          <NativeSelect name="type" aria-label="Type" defaultValue={filter.type ?? ''}>
            <NativeSelectOption value="">Any type</NativeSelectOption>
            {ITEM_TYPES.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {ITEM_LABEL[type]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {bank.cos.length > 0 && (
            <NativeSelect name="coId" aria-label="Outcome" defaultValue={filter.coId ?? ''}>
              <NativeSelectOption value="">Any outcome</NativeSelectOption>
              {bank.cos.map((co) => (
                <NativeSelectOption key={co.id} value={co.id}>
                  {co.code}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <NativeSelect name="difficulty" aria-label="Level" defaultValue={filter.difficulty ?? ''}>
            <NativeSelectOption value="">Any level</NativeSelectOption>
            {DIFFICULTIES.map((level) => (
              <NativeSelectOption key={level} value={level}>
                {cap(level)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {bank.topics.length > 0 && (
            <NativeSelect name="topic" aria-label="Topic" defaultValue={filter.topic ?? ''}>
              <NativeSelectOption value="">Any topic</NativeSelectOption>
              {bank.topics.map((topic) => (
                <NativeSelectOption key={topic} value={topic}>
                  {topic}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FilterForm>
        <DataTable
          bare
          columns={[
            {
              header: 'Question',
              cell: (row: BankRow) => (
                <span className="grid max-w-xl min-w-56 gap-0.5">
                  <span className="line-clamp-2 font-medium">{row.question}</span>
                  <span className="text-muted-foreground text-xs">
                    {[row.topic && `Topic: ${row.topic}`, row.detail].filter(Boolean).join(' · ') || ' '}
                  </span>
                </span>
              ),
            },
            {
              header: 'Type',
              cell: (row: BankRow) => (
                <span className="bg-muted rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap">
                  {ITEM_LABEL[row.type]}
                </span>
              ),
            },
            {
              header: 'Tags',
              cell: (row: BankRow) => (
                <span className="flex flex-wrap items-center gap-1">
                  {row.coCodes.map((code) => (
                    <span
                      key={code}
                      className="bg-primary/8 text-primary ring-primary/15 rounded-sm px-1.5 py-px text-[0.6875rem] font-medium ring-1"
                    >
                      {code}
                    </span>
                  ))}
                  {row.bloomLevel && <BloomChip level={row.bloomLevel} />}
                </span>
              ),
            },
            {
              header: 'Level',
              cell: (row: BankRow) =>
                row.difficulty ? (
                  <Badge variant={LEVEL_TONE[row.difficulty]}>{row.difficulty}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
            {
              header: 'Used',
              cell: (row: BankRow) =>
                row.usedCount > 0 ? (
                  <span className="tabular-nums">
                    {row.usedCount} paper{row.usedCount === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
            ...(bank.canEdit
              ? [
                  {
                    header: '',
                    className: 'w-10',
                    cell: (row: BankRow) => (
                      <RowMenu
                        label={row.question}
                        items={[
                          { kind: 'link', label: 'Edit', href: here(`edit-${row.id}`), icon: <PencilSimpleIcon /> },
                          { kind: 'separator' },
                          {
                            kind: 'action',
                            label: 'Delete',
                            icon: <TrashIcon />,
                            destructive: true,
                            action: deleteBankItem,
                            fields: { ...(offeringId ? { offeringId } : {}), bankItemId: row.id },
                            confirm: {
                              title: 'Delete this question from the bank?',
                              message: 'Papers already drawn keep their own copy; new papers cannot draw it.',
                              confirmLabel: 'Delete',
                              destructive: true,
                            },
                          },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
          ]}
          rows={bank.rows}
          rowKey={(row) => row.id}
          total={bank.total}
          page={page}
          pageSize={pageSize}
          query={query}
          path={base}
          empty={
            filtered
              ? 'Nothing matches. Clear the search or the filters.'
              : 'No questions yet. Add one, import a CSV, or save questions from a test with “Save to the bank”.'
          }
        />
      </Section>

      {bank.canEdit && (newType || editing) && (
        <QuestionDialog
          key={open}
          openParam={open ?? ''}
          title={editing ? `Edit · ${ITEM_LABEL[editing.type]}` : `New question · ${ITEM_LABEL[newType ?? 'mcq']}`}
          type={editing?.type ?? newType ?? 'mcq'}
          item={editing}
          action={saveBankItem}
          hidden={
            <>
              {scope}
              {editing && <input type="hidden" name="bankItemId" value={editing.id} />}
            </>
          }
          cos={offeringId ? bank.cos : null}
          credit={false}
          sections={[]}
        />
      )}
      {bank.canEdit && open === 'import' && (
        <FormDialog
          key={open}
          openParam="import"
          size="wide"
          icon={<UploadSimpleIcon weight="duotone" />}
          title="Import questions from a CSV"
          description={`Up to ${BANK_LIMITS.csvRows} questions at a time. Every row is checked first; nothing is saved unless all are right.`}
          action={importBankCsv}
          submitLabel="Import"
          successMessage="Questions imported."
        >
          {scope}
          <Field name="file" label="CSV file">
            <Input name="file" type="file" accept=".csv,text/csv" required />
          </Field>
          <div className="bg-muted/60 grid gap-2 rounded-md p-3 text-xs leading-relaxed">
            <p className="font-medium">Columns (the first five are needed):</p>
            <code className="block overflow-x-auto font-mono whitespace-pre">
              {'type,question,options,answer,marks,difficulty,topic,cos,negative\n' +
                'one answer,Which is LIFO?,Queue|Stack,2,1,easy,stacks,CO1,0.25\n' +
                'true or false,A queue is FIFO.,,true,1,easy,queues,,\n' +
                'number,Bytes in an int?,,4 ± 0,2,medium,types,CO2,\n' +
                'written answer,Explain recursion.,,,5,hard,recursion,CO1|CO2,'}
            </code>
            <p>
              Types: one answer, several answers, true or false, number, written answer. Separate options with |; the
              answer is the number of the right option (several: 1|3), true or false, or a number with an optional
              margin.{bank.courseTitle ? ' cos are the course’s outcome codes, separated by |.' : ''}
            </p>
          </div>
        </FormDialog>
      )}
    </>
  );
}
