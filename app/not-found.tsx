import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-primary text-sm font-semibold">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground max-w-md">This page does not exist, or you do not have access to it.</p>
      <Button asChild>
        <Link href="/home">Go to home</Link>
      </Button>
    </main>
  );
}
