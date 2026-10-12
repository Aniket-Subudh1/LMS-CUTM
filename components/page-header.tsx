import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4 lg:mb-8">
      <div className="flex min-w-0 items-center gap-4">
        {icon && <span className="icon-chip size-12 max-sm:hidden [&_svg]:size-7">{icon}</span>}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]">{title}</h1>
          {description && <p className="text-muted-foreground mt-1 max-w-prose text-sm md:text-base">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
