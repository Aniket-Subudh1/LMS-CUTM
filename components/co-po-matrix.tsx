import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { cn } from '@/lib/cn';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// COs are rows and the programme's PO then PSO codes are columns. A cell key is `<coId>:<outcome code>`.
// `edit` renders a <select name="cell[]"> per cell for an ActionForm; `levels` shows the saved level or "–".
export function CoPoMatrix({
  cos,
  outcomes,
  cells,
  mode,
}: {
  cos: { id: string; code: string }[];
  outcomes: string[];
  cells: Record<string, number>;
  mode: 'edit' | 'levels';
}) {
  return (
    <div className="ring-border overflow-hidden rounded-xl ring-1">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            <TableHead className="bg-muted sticky left-0 text-xs font-medium tracking-wide uppercase">CO</TableHead>
            {outcomes.map((code) => (
              <TableHead key={code} className="text-center text-xs font-medium">
                {code}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cos.map((co) => (
            <TableRow key={co.id}>
              <TableCell className="bg-card sticky left-0 font-medium">{co.code}</TableCell>
              {outcomes.map((code) => {
                const key = `${co.id}:${code}`;
                const level = cells[key];
                return (
                  <TableCell key={code} className="text-center">
                    {mode === 'edit' ? (
                      <NativeSelect
                        size="sm"
                        name="cell[]"
                        aria-label={`${co.code} to ${code}`}
                        defaultValue={level ? `${key}:${level}` : ''}
                        className="w-16"
                      >
                        <NativeSelectOption value="">–</NativeSelectOption>
                        {[1, 2, 3].map((l) => (
                          <NativeSelectOption key={l} value={`${key}:${l}`}>
                            {l}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    ) : (
                      <span
                        className={cn(
                          'inline-grid size-7 place-items-center rounded-md text-xs font-semibold tabular-nums',
                          level === 3 && 'bg-primary text-primary-foreground',
                          level === 2 && 'bg-primary/25 text-primary',
                          level === 1 && 'bg-primary/10 text-primary',
                          !level && 'text-muted-foreground',
                        )}
                      >
                        {level ?? '–'}
                      </span>
                    )}
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
