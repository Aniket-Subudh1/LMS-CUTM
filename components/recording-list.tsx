import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import type { RecordingRow } from '@/lib/data/live';
import { formatDateTime, formatDuration } from '@/lib/format';

// M03c T5 (mock-up R3-A): a class's or a meeting's saved recordings, each played from the bucket through /api/files,
// which checks the viewer on every request (06 §5).
export function RecordingList({ recordings, noun }: { recordings: RecordingRow[]; noun: 'class' | 'meeting' }) {
  if (recordings.length === 0) return null;
  return (
    <Section
      icon={<PageIcon name="video" className="size-8" />}
      title={recordings.length === 1 ? 'Recording' : 'Recordings'}
      description={`The ${noun} as it was recorded: the stage and everyone’s audio.`}
    >
      <ul className="grid gap-6">
        {recordings.map((r) => (
          <li key={r.key} className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* The browser fetches only the opening part until someone plays it. */}
            <video
              controls
              preload="metadata"
              src={`/api/files/${r.key}`}
              className="aspect-video w-full rounded-md bg-black"
            />
            <dl className="grid content-start gap-3 text-[0.8125rem]">
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground text-xs">Recorded</dt>
                <dd className="font-medium">{formatDateTime(r.startedAt)}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground text-xs">Started by</dt>
                <dd className="font-medium">{r.by}</dd>
              </div>
              {r.durationSec !== null && (
                <div className="grid gap-0.5">
                  <dt className="text-muted-foreground text-xs">Length</dt>
                  <dd className="font-medium">{formatDuration(r.durationSec)}</dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </Section>
  );
}
