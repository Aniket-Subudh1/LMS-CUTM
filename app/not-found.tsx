import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
      <h1>Page not found</h1>
      <p>This page does not exist, or you do not have access to it.</p>
      <Link href="/home">Go to home</Link>
    </main>
  );
}
