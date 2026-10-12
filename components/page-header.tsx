export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6 lg:mb-8">
      <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{title}</h1>
      {description && <p className="text-muted-foreground mt-1.5 max-w-prose">{description}</p>}
      <span aria-hidden="true" className="bg-gold mt-4 block h-px w-12" />
    </header>
  );
}
