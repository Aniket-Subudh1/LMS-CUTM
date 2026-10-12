import Link from 'next/link';
import { UniversityLogo } from '@/components/university-logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="bg-background flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <UniversityLogo priority sizes="8rem" className="w-28 sm:w-32" />
      <div className="grid gap-2">
        <p className="text-primary text-sm font-medium tracking-[0.16em] uppercase">404</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Page not found</h1>
        <p className="text-muted-foreground max-w-md">This page does not exist, or you do not have access to it.</p>
      </div>
      <Button asChild>
        <Link href="/home">Go to home</Link>
      </Button>
    </main>
  );
}
