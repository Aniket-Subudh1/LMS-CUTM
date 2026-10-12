'use client';

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section className="card">
      <h1>Something went wrong</h1>
      <p>
        Try again. If it keeps happening, contact support
        {error.digest ? ` and quote the reference ${error.digest}` : ''}.
      </p>
      <button type="button" className="btn btn-primary self-start" onClick={() => retry()}>
        Try again
      </button>
    </section>
  );
}
