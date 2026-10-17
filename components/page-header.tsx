import type { ReactNode } from 'react';

const count = new Intl.NumberFormat('en-IN');

// Design "B · Header inside the card" (chosen by Aniket from three mock-ups, 17 Oct 2026): the title, its icon and the
// page's actions open a white card. A list page passes its number tiles as `stats` and its search and table as
// children, so the whole list is one card; any other page gets the header card alone.
export function PageHeader({
  title,
  description,
  icon,
  actions,
  stats,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  stats?: { label: string; value: number; icon: ReactNode }[];
  children?: ReactNode;
}) {
  return (
    <section className="surface mb-5 grid gap-4 p-4 sm:p-5 lg:mb-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {icon && (
          <span className="bg-primary/10 grid size-12 shrink-0 place-items-center rounded-2xl [&_svg]:size-5">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="text-lg leading-snug font-semibold tracking-tight text-balance">{title}</h1>
          {description && <p className="text-muted-foreground max-w-prose text-sm">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {(stats || children) && (
        <div className="grid min-w-0 gap-4 border-t pt-4">
          {stats && (
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="ring-border/80 flex min-w-0 items-center gap-3 rounded-xl p-3 ring-1">
                  <span className="bg-muted text-primary grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4.5">
                    {s.icon}
                  </span>
                  <div className="flex min-w-0 flex-col-reverse">
                    <dt className="text-muted-foreground truncate text-xs">{s.label}</dt>
                    <dd className="text-xl leading-tight font-semibold tracking-tight tabular-nums">
                      {count.format(s.value)}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          )}
          {children}
        </div>
      )}
    </section>
  );
}
