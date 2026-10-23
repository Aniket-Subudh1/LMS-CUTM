import type { ReactNode } from 'react';
import { ArrowClockwiseIcon, CircleNotchIcon } from '@phosphor-icons/react/ssr';
import { requestTestFile } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { ActionForm } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { Button } from '@/components/ui/button';
import type { TestFileState } from '@/lib/data/assessments';
import { formatDateTime } from '@/lib/format';
import type { TestFileKind } from '@/lib/schemas/assessment';

// TP-12: one file made from a test's results, as its button: ask for it, wait while the worker makes it (the page
// refreshes itself), then download it. The staff's files stay downloadable, with a button to make them again.
export function TestFileButton({
  assessmentId,
  kind,
  label,
  icon,
  file,
  again = false,
}: {
  assessmentId: string;
  kind: TestFileKind;
  label: string;
  icon: ReactNode;
  file: TestFileState;
  again?: boolean;
}) {
  const ask = (submitLabel: string, iconOnly: boolean) => (
    <ActionForm
      action={requestTestFile}
      submitLabel={submitLabel}
      submitVariant="outline"
      submitSize="sm"
      submitIcon={iconOnly ? <ArrowClockwiseIcon /> : icon}
      iconOnly={iconOnly}
    >
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <input type="hidden" name="kind" value={kind} />
    </ActionForm>
  );
  if (file.state === 'ask') return ask(file.failed ? `${label} · try again` : label, false);
  if (file.state === 'making') {
    return (
      <>
        <Button variant="outline" size="sm" disabled title="Being made: this page updates when it is ready">
          <CircleNotchIcon className="animate-spin" /> {label}
          <span className="sr-only" aria-live="polite">
            , being made
          </span>
        </Button>
        <AutoRefresh seconds={3} />
      </>
    );
  }
  return (
    <span className="flex gap-1">
      <Button asChild variant="outline" size="sm">
        <a href={file.href} target="_blank" rel="noopener" title={`Made ${formatDateTime(file.madeAt)}`}>
          {icon} {label}
        </a>
      </Button>
      {again && ask(`Make it again (this one was made ${formatDateTime(file.madeAt)})`, true)}
    </span>
  );
}
