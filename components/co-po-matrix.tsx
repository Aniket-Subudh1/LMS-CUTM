import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
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
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-card sticky left-0">CO</TableHead>
            {outcomes.map((code) => (
              <TableHead key={code} className="text-center">
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
                      <span className={level ? 'font-medium' : 'text-muted-foreground'}>{level ?? '–'}</span>
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
