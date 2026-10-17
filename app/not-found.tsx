import Link from 'next/link';
import { PageIcon } from '@/components/page-icon';
import { UniversityLogo } from '@/components/university-logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="surface grid w-full max-w-md justify-items-center gap-6 p-8 text-center sm:p-10">
        <UniversityLogo priority sizes="8rem" className="w-24 sm:w-28" />
        <PageIcon name="missing" className="size-16" />
        <div className="grid gap-2">
          <p className="text-primary text-5xl font-bold tracking-tight tabular-nums">404</p>
          <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
          <p className="text-muted-foreground text-sm">This page does not exist, or you do not have access to it.</p>
        </div>
        <Button asChild>
          <Link href="/home">Go to home</Link>
        </Button>
      </div>
    </main>
  );
}
