'use client';

import { PrinterIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

// The browser's print dialog for a page with a print stylesheet (a grade sheet, M08); it does not print itself.
export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="print:hidden">
      <PrinterIcon />
      Print
    </Button>
  );
}
