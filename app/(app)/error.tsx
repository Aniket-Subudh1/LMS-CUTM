'use client';

import { WarningIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <WarningIcon weight="duotone" className="text-warning size-8" />
        <CardTitle className="text-xl">Something went wrong</CardTitle>
        <CardDescription>
          Try again. If it keeps happening, contact support
          {error.digest ? ` and quote the reference ${error.digest}` : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => retry()}>Try again</Button>
      </CardContent>
    </Card>
  );
}
