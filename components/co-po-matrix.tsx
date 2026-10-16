import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/cn';

export type OutcomeColumn = { code: string; title: string };

export const levelTone = (level: number | undefined) =>
  cn(
    'inline-grid size-7 place-items-center rounded-md text-xs font-semibold tabular-nums',
    level === 3 && 'bg-primary text-primary-foreground',
    level === 2 && 'bg-primary/25 text-primary',
    level === 1 && 'bg-primary/10 text-primary',
    !level && 'text-muted-foreground',
  );

// COs are rows and PO1–PO12, PSO1–PSO3 are columns (a programme's title shows on hover). A cell key is
// `<coId>:<code>`; the level is 1–3, or "–" for no link. Read only; CoPoEditor edits it.
export function CoPoMatrix({
  cos,
  outcomes,
  cells,
}: {
  cos: { id: string; code: string }[];
  outcomes: OutcomeColumn[];
  cells: Record<string, number>;
}) {
  return (
    <div className="ring-border overflow-x-auto rounded-xl ring-1">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            <TableHead className="bg-muted sticky left-0 text-xs font-medium tracking-wide uppercase">CO</TableHead>
            {outcomes.map((o) => (
              <TableHead key={o.code} className="text-center text-xs font-medium">
                <abbr title={o.title || o.code} className="no-underline">
                  {o.code}
                </abbr>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cos.map((co) => (
            <TableRow key={co.id}>
              <TableCell className="bg-card sticky left-0 font-medium">{co.code}</TableCell>
              {outcomes.map((o) => {
                const level = cells[`${co.id}:${o.code}`];
                return (
                  <TableCell key={o.code} className="text-center">
                    <span className={levelTone(level)} aria-label={`${co.code} to ${o.code}: ${level ?? 'no link'}`}>
                      {level ?? '–'}
                    </span>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
