import type { ReactNode } from 'react';

export function Section({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Children may shrink below their content, so a wide table scrolls inside the card, not the page (People, 390 px).
    <section className="surface grid gap-4 p-4 sm:p-5 [&>*]:min-w-0">
      {/* From 640 px the action keeps to the right and a long description wraps beside it. */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center [&_img]:size-8 [&_svg]:size-5">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
            <p className="text-muted-foreground text-[0.8125rem]">{description}</p>
          </div>
        </div>
        {action && <div className="flex min-w-0 flex-wrap gap-2 sm:shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

// One label/value pair in a `<dl className="surface grid …">` facts strip.
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}
