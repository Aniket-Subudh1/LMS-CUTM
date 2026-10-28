import { Suspense } from 'react';
import type { Metadata } from 'next';
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ExamIcon,
  FileTextIcon,
  UsersThreeIcon,
  WarningIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { z } from 'zod';
import Loading from '../../../loading';
import { requestAttainment } from './actions';
import { ActionForm } from '@/components/action-form';
import { BloomChip } from '@/components/bloom-chip';
import { CoPoMatrix, levelTone } from '@/components/co-po-matrix';
import { CourseOutcomes } from '@/components/course-outcomes';
import { DataTable, EmptyState } from '@/components/data-table';
import { PageIcon } from '@/components/page-icon';
import { PrintButton } from '@/components/print-button';
import { Section } from '@/components/section';
import { Progress } from '@/components/ui/progress';
import { getOfferingAttainment, type AttainmentRecord, type OfferingAttainmentView } from '@/lib/data/attainment-views';
import { getOfferingCourse, type OfferingCourse } from '@/lib/data/courses';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMarks, formatPct } from '@/lib/format';

export const metadata: Metadata = { title: 'Outcomes' };

// The dialog to show: co, co-<id> (URL-driven, M03b).
const Search = z.object({ new: z.string().max(60).optional().catch(undefined) });

export default function OutcomesPage({ params, searchParams }: PageProps<'/courses/[offeringId]/outcomes'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Outcomes params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Outcomes({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/outcomes'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/outcomes'>['searchParams'];
}) {
  const { offeringId } = await params;
  const { new: open } = Search.parse(await searchParams);
  const [course, attainment] = await Promise.all([getOfferingCourse(offeringId), getOfferingAttainment(offeringId)]);
  if (course.mode !== 'credit') {
    return (
      <EmptyState
        icon={<PageIcon name="outcomes" className="size-8" />}
        text="This is a non-credit course, so it has no course outcomes or mapping."
      />
    );
  }
  // M09 (mock-up A1 A): attainment first for whoever teaches or oversees the class; students see the tab as before.
  return (
    <div className="grid gap-5">
      {attainment && <Attainment offeringId={offeringId} course={course} view={attainment} />}
      <div className="print:hidden">
        <CourseOutcomes
          course={course}
          outcomes={course.outcomes}
          base={`/courses/${offeringId}/outcomes`}
          open={open}
          offeringId={offeringId}
        />
      </div>
    </div>
  );
}

const LevelChip = ({ level }: { level: number }) => (
  <span className={cn(levelTone(level), !level && 'ring-border/80 ring-1')}>{level}</span>
);

// CPP-09 (07 §4): the record as the worker wrote it, with the settings and the map it used, so a printout always reads
// against the grid it came from (A-181).
function Attainment({
  offeringId,
  course,
  view,
}: {
  offeringId: string;
  course: OfferingCourse;
  view: OfferingAttainmentView;
}) {
  const { record } = view;
  const actions = (
    <>
      {view.canRecompute && (
        <ActionForm
          action={requestAttainment}
          submitLabel={record ? 'Work it out again' : 'Work it out now'}
          submitVariant="outline"
          submitSize="sm"
          submitIcon={<ArrowClockwiseIcon />}
          successMessage="Queued. The new values show here within a minute."
        >
          <input type="hidden" name="offeringId" value={offeringId} />
        </ActionForm>
      )}
      {record && <PrintButton />}
    </>
  );
  return (
    <>
      <Section
        icon={<PageIcon name="attainment" className="size-8" />}
        title="Attainment"
        description="How far this class reached each outcome: published results (CIE) and the end-semester marks (SEE)."
        action={actions}
      >
        {record ? (
          <Worked course={course} record={record} />
        ) : (
          <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-[0.8125rem]">
            Not worked out yet. It is worked out by itself when results are published, when marks change on published
            results, when end-semester marks arrive or grade sheets are published, and when the mapping changes.
          </p>
        )}
      </Section>
      {record && (
        <Section
          icon={<PageIcon name="outcomes" className="size-8" />}
          title="Outcomes reached"
          description="Each PO and PSO from the COs that map to it, weighted by level. The grid is the mapping this was worked out with."
        >
          <CoPoMatrix
            cos={record.cos.map((co) => ({ id: co.coId, code: co.code, statement: co.statement }))}
            outcomes={course.outcomes}
            cells={Object.fromEntries(record.cells.map((c) => [`${c.coId}:${c.outcome}`, c.level]))}
            attainment={{
              values: Object.fromEntries(record.outcomes.map((o) => [o.code, o.value])),
              target: record.config.defaultTargetLevel,
            }}
          />
          <p className="text-muted-foreground text-xs">
            “—”: no CO maps to it. Below {record.config.defaultTargetLevel} (the target) in amber.
          </p>
        </Section>
      )}
    </>
  );
}

function Worked({ course, record }: { course: OfferingCourse; record: AttainmentRecord }) {
  const { config: c, see } = record;
  const bloomOf = new Map(course.cos.map((co) => [co.id, co.bloomLevels]));
  const assessed = record.cos.filter((co) => co.met !== null);
  const students = see
    ? see.considered + see.withoutMarks
    : Math.max(0, ...record.cos.map((co) => co.cie?.assessed ?? 0));
  const tiles: { icon: Icon; label: string; value: string; detail?: string }[] = [
    {
      icon: CheckCircleIcon,
      label: 'Met',
      value: `${assessed.filter((co) => co.met).length} of ${record.cos.length} COs`,
    },
    { icon: UsersThreeIcon, label: 'Students', value: String(students) },
    { icon: FileTextIcon, label: 'SEE marks', value: see ? `${see.considered} of ${students}` : 'None yet' },
    {
      icon: ExamIcon,
      label: 'SEE level',
      value: see ? String(see.level) : '—',
      detail: see ? formatPct(see.pct) : undefined,
    },
  ];
  return (
    <>
      <p className="text-[0.8125rem]">
        Worked out <b className="font-semibold">{formatDateTime(record.computedAt)}</b>
        {record.computedBy && ` by ${record.computedBy}`} with: target {c.targetPct} %, levels {c.level3Pct} /{' '}
        {c.level2Pct} / {c.level1Pct} %, CIE {c.cieWeight} · SEE {c.seeWeight}, target level {c.defaultTargetLevel}.
      </p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
            <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
              <tile.icon className="size-[1.125rem]" />
            </span>
            <div className="grid min-w-0">
              <dd className="text-lg leading-tight font-semibold tabular-nums">
                {tile.value}
                {tile.detail && <span className="text-muted-foreground text-xs font-normal"> · {tile.detail}</span>}
              </dd>
              <dt className="text-muted-foreground order-first truncate text-xs">{tile.label}</dt>
            </div>
          </div>
        ))}
      </dl>
      <DataTable
        bare
        columns={[
          {
            header: 'Outcome',
            cell: (co) => (
              <span className="grid min-w-56 gap-1">
                <span>
                  <b className="text-primary font-semibold">{co.code}</b> {co.statement}
                </span>
                <span className="flex flex-wrap gap-1">
                  {(bloomOf.get(co.coId) ?? []).map((level) => (
                    <BloomChip key={level} level={level} />
                  ))}
                </span>
              </span>
            ),
          },
          {
            header: 'Attained',
            cell: (co) =>
              co.cie ? (
                <span className="whitespace-nowrap tabular-nums">
                  {co.cie.attained} of {co.cie.assessed}
                </span>
              ) : (
                <span className="text-muted-foreground whitespace-nowrap">Not assessed</span>
              ),
          },
          {
            header: 'CIE %',
            cell: (co) => <span className="tabular-nums">{co.cie ? formatPct(co.cie.pct) : '—'}</span>,
          },
          { header: 'CIE level', cell: (co) => (co.cie ? <LevelChip level={co.cie.level} /> : '—') },
          { header: 'SEE level', cell: () => (see ? <LevelChip level={see.level} /> : '—') },
          {
            header: 'Attainment',
            cell: (co) =>
              co.value === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Progress
                    value={(co.value / 3) * 100}
                    className="w-16"
                    aria-label={`${co.code}: ${formatMarks(co.value)} of 3`}
                  />
                  <span className="font-semibold tabular-nums">{formatMarks(co.value)}</span>
                </span>
              ),
          },
          { header: 'Target', cell: () => <span className="tabular-nums">{c.defaultTargetLevel}</span> },
          {
            header: 'Met',
            cell: (co) =>
              co.met === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-medium whitespace-nowrap',
                    co.met ? 'text-success' : 'text-warning',
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                  {co.met ? 'Met' : 'Not met'}
                </span>
              ),
          },
        ]}
        rows={record.cos}
        rowKey={(co) => co.coId}
        empty="The course had no outcomes when this was worked out."
      />
      <p className="text-muted-foreground text-xs leading-relaxed">
        A student attains an outcome when they score at least {c.targetPct} % on the questions tagged with it. The level
        is 3 from {c.level3Pct} % of students, 2 from {c.level2Pct} %, 1 from {c.level1Pct} %. Attainment is{' '}
        {c.cieWeight} × the CIE level + {c.seeWeight} × the SEE level; the target is {c.defaultTargetLevel}.
        {see &&
          ` SEE: ${see.attained} of ${see.considered} students reached ${c.targetPct} % in the end-semester marks.`}
      </p>
      {record.warnings.length > 0 && (
        <div className="bg-warning/10 ring-warning/30 grid gap-1.5 rounded-md px-3.5 py-3 text-[0.8125rem] ring-1">
          <p className="text-warning flex items-center gap-2 font-semibold">
            <WarningIcon weight="bold" className="size-4" />
            Worth knowing
          </p>
          <ul className="grid list-disc gap-1 pl-9">
            {record.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
