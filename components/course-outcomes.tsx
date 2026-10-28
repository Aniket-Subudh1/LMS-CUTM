import Link from 'next/link';
import {
  CheckCircleIcon,
  InfoIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
} from '@phosphor-icons/react/ssr';
import { addCo, deleteCo, saveCoMap, updateCo } from '@/app/(app)/catalog/actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { BarChart } from '@/components/bar-chart';
import { BloomChip } from '@/components/bloom-chip';
import { CoPoEditor } from '@/components/co-po-editor';
import { CoPoMatrix, type OutcomeColumn } from '@/components/co-po-matrix';
import { EmptyState } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { RowMenu } from '@/components/row-menu';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { EditableCourse } from '@/lib/data/courses';
import { mappingCoverage, type OutcomeCoverage } from '@/lib/domain/catalog';
import { keptBy } from '@/lib/format';
import { BLOOM_LEVELS, CATALOG_LIMITS } from '@/lib/schemas/structure';

type Co = EditableCourse['cos'][number];

const list = new Intl.ListFormat('en-IN', { type: 'conjunction' });

// The workspace's Outcomes tab and the catalogue course page (M03b, "Outcomes A"): the COs with their Bloom levels,
// how strongly each PO and PSO is supported, and the CO × PO/PSO grid. The coordinator and admins edit in place;
// everyone else reads. Edit dialogs open from the URL (`?new=co`, `?new=co-<id>`) on `base`, the page's own path.
// `offeringId` (the Outcomes tab) has the AI's mapping suggestion use that class's programme titles (M09 decision 2).
export function CourseOutcomes({
  course,
  outcomes,
  base,
  open,
  offeringId,
}: {
  course: EditableCourse;
  outcomes: OutcomeColumn[];
  base: string;
  open: string | undefined;
  offeringId?: string;
}) {
  const { cos, canEdit } = course;
  const coverage = mappingCoverage(
    cos.map((co) => co.id),
    outcomes.map((o) => o.code),
    course.cells,
  );
  const room = canEdit && cos.length < CATALOG_LIMITS.cos;
  const editing = canEdit ? cos.find((co) => open === `co-${co.id}`) : undefined;
  return (
    <div className="grid gap-5">
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Section
          icon={<PageIcon name="outcomes" className="size-8" />}
          title="Course outcomes"
          description={
            canEdit
              ? 'What a student can do after this course. A code never changes once given.'
              : keptBy(course.coordinator)
          }
          action={
            room &&
            cos.length > 0 && (
              <Button asChild size="sm">
                <Link href={`${base}?new=co`} scroll={false}>
                  <PlusIcon /> Add outcome
                </Link>
              </Button>
            )
          }
        >
          {cos.length === 0 ? (
            <EmptyState
              icon={<PageIcon name="outcomes" className="size-8" />}
              text={
                canEdit
                  ? 'Write what a student can do after this course, one outcome at a time.'
                  : 'The course outcomes have not been written yet.'
              }
            />
          ) : (
            <ol className="divide-border/70 grid divide-y">
              {cos.map((co) => (
                <CoRow key={co.id} course={course} co={co} base={base} />
              ))}
            </ol>
          )}
          {room && (
            <Link
              href={`${base}?new=co`}
              scroll={false}
              className="text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2.5 text-[0.8125rem] transition-colors"
            >
              <span className="flex items-center gap-2">
                <PlusIcon className="size-4" /> Add an outcome
              </span>
              <span className="text-xs">{course.nextCo} is next</span>
            </Link>
          )}
        </Section>
        <Section
          icon={<PageIcon name="mapping" className="size-8" />}
          title="How each programme outcome is covered"
          description="The average mapping level of each PO and PSO over the outcomes linked to it: 3 strong, 1 slight."
        >
          {coverage.outcomes.every((o) => o.average === null) ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-[0.8125rem]">
              {cos.length > 0
                ? 'Coverage shows here once the outcomes are mapped.'
                : 'Coverage shows here once outcomes are written and mapped.'}
            </p>
          ) : (
            <BarChart
              data={coverage.outcomes.map((o) => ({
                label: o.code,
                value: o.average,
                tone: o.code.startsWith('PSO') ? 'teal' : 'primary',
              }))}
              max={3}
              ticks={[1, 2, 3]}
              name="Average mapping level"
              summary={coverageSummary(coverage.outcomes)}
            />
          )}
        </Section>
      </div>
      {cos.length > 0 && (
        <div id="mapping" className="scroll-mt-24">
          <Section
            icon={<PageIcon name="mapping" className="size-8" />}
            title="CO–PO–PSO mapping"
            description={
              canEdit
                ? 'How strongly each outcome supports PO1–PO12 and PSO1–PSO3: 1 slight, 2 moderate, 3 strong.'
                : `How strongly each outcome supports PO1–PO12 and PSO1–PSO3. ${keptBy(course.coordinator)}`
            }
          >
            {canEdit ? (
              <ActionForm action={saveCoMap} submitLabel="Save mapping" successMessage="Mapping saved.">
                <input type="hidden" name="courseId" value={course.id} />
                {/* Starts again from the saved grid whenever the outcomes or the saved links change. */}
                <CoPoEditor
                  key={JSON.stringify([cos.map((co) => co.id), course.cells])}
                  cos={cos}
                  outcomes={outcomes}
                  cells={course.cells}
                  suggest={course.aiReady ? { courseId: course.id, offeringId } : null}
                />
                <FieldErrors name="cell[]" />
              </ActionForm>
            ) : (
              <CoPoMatrix cos={cos} outcomes={outcomes} cells={course.cells} />
            )}
            <Gaps cos={cos} unmappedCoIds={coverage.unmappedCoIds} uncovered={coverage.uncovered} />
          </Section>
        </div>
      )}
      {room && open === 'co' && <CoDialog key={open} course={course} />}
      {editing && <CoDialog key={open} course={course} co={editing} />}
    </div>
  );
}

function coverageSummary(outcomes: OutcomeCoverage[]) {
  const linked = outcomes.flatMap((o) => (o.average === null ? [] : [{ code: o.code, average: o.average }]));
  const top = Math.max(...linked.map((o) => o.average));
  const strongest = linked.filter((o) => o.average === top).map((o) => o.code);
  const none = outcomes.length - linked.length;
  return [
    `Strongest: ${list.format(strongest)} at ${top}.`,
    none === 0
      ? 'Every PO and PSO is supported.'
      : none <= 5
        ? `No outcome supports ${list.format(outcomes.filter((o) => o.average === null).map((o) => o.code))}.`
        : `${none} of ${outcomes.length} have no link.`,
  ].join(' ');
}

function Gaps({ cos, unmappedCoIds, uncovered }: { cos: Co[]; unmappedCoIds: string[]; uncovered: string[] }) {
  const unmapped = cos.filter((co) => unmappedCoIds.includes(co.id)).map((co) => co.code);
  return (
    <div className="grid gap-1.5 text-[0.8125rem] [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
      {unmapped.length > 0 ? (
        <p className="text-warning flex items-start gap-2">
          <WarningIcon weight="bold" />
          {list.format(unmapped)} {unmapped.length === 1 ? 'is' : 'are'} not mapped to any PO or PSO yet.
        </p>
      ) : (
        <p className="text-muted-foreground flex items-start gap-2">
          <CheckCircleIcon weight="bold" className="text-success" />
          Every outcome is mapped.
        </p>
      )}
      {uncovered.length > 0 && (
        <p className="text-muted-foreground flex items-start gap-2">
          <InfoIcon weight="bold" />
          No outcome supports {list.format(uncovered)}.
        </p>
      )}
    </div>
  );
}

function CoRow({ course, co, base }: { course: EditableCourse; co: Co; base: string }) {
  const links = Object.keys(course.cells).filter((key) => key.startsWith(`${co.id}:`)).length;
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="text-primary w-9 shrink-0 pt-0.5 text-xs font-bold tabular-nums">{co.code}</span>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="text-[0.8125rem] leading-relaxed">{co.statement}</p>
        <div className="flex flex-wrap items-center gap-1">
          {co.bloomLevels.map((level) => (
            <BloomChip key={level} level={level} />
          ))}
          {co.bloomLevels.length === 0 && (
            <span className="text-warning text-xs">
              {co.suggestedBloom
                ? `“${co.suggestedBloom}” suggested from the verb; not confirmed`
                : 'No Bloom level yet'}
            </span>
          )}
        </div>
      </div>
      {course.canEdit && (
        <RowMenu
          label={co.code}
          items={[
            { kind: 'link', label: 'Edit', href: `${base}?new=co-${co.id}`, icon: <PencilSimpleIcon /> },
            { kind: 'separator' },
            {
              kind: 'action',
              label: 'Delete',
              icon: <TrashIcon />,
              destructive: true,
              action: deleteCo,
              fields: { courseId: course.id, coId: co.id },
              confirm: {
                title: `Delete ${co.code}?`,
                message: [
                  links === 0
                    ? 'Its tags on class sessions go with it.'
                    : `Its ${links} mapping link${links === 1 ? ' goes' : 's go'} with it, and so do its tags on class sessions.`,
                  `The code ${co.code} is not given to another outcome.`,
                ].join(' '),
                confirmLabel: 'Delete',
                destructive: true,
              },
            },
          ]}
        />
      )}
    </li>
  );
}

function CoDialog({ course, co }: { course: EditableCourse; co?: Co }) {
  const ticked = co?.bloomLevels.length ? co.bloomLevels : co?.suggestedBloom ? [co.suggestedBloom] : [];
  return (
    <FormDialog
      openParam={co ? `co-${co.id}` : 'co'}
      icon={<PageIcon name="outcomes" className="size-7" />}
      title={co ? `Edit ${co.code}` : `Add ${course.nextCo}`}
      description={
        co
          ? 'Saving also confirms its Bloom levels.'
          : 'What a student can do after this course. The code is given now and never changes.'
      }
      action={co ? updateCo : addCo}
      submitLabel={co ? 'Save outcome' : 'Add outcome'}
      successMessage={co ? 'Outcome saved.' : 'Outcome added.'}
    >
      <input type="hidden" name="courseId" value={course.id} />
      {co && <input type="hidden" name="coId" value={co.id} />}
      <Field name="statement" label="Outcome" hint="Start with a verb: Explain…, Design…, Analyse…">
        <Textarea
          name="statement"
          rows={3}
          maxLength={CATALOG_LIMITS.coStatement}
          defaultValue={co?.statement}
          required
        />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">
          Bloom levels{' '}
          <span className="text-muted-foreground font-normal">
            · up to three
            {co && co.bloomLevels.length === 0 && co.suggestedBloom && `; “${co.suggestedBloom}” was suggested`}
          </span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {BLOOM_LEVELS.map((level) => (
            <label
              key={level}
              className="ring-border has-checked:bg-foreground has-checked:text-background has-checked:ring-foreground has-focus-visible:ring-ring flex cursor-pointer items-center rounded-md px-2.5 py-1 text-[0.8125rem] capitalize ring-1 transition-colors has-focus-visible:ring-2"
            >
              <input
                type="checkbox"
                name="bloom[]"
                value={level}
                defaultChecked={ticked.includes(level)}
                className="sr-only"
              />
              {level}
            </label>
          ))}
        </div>
        <FieldErrors name="bloom[]" />
      </fieldset>
    </FormDialog>
  );
}
