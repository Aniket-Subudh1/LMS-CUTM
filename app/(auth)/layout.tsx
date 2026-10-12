import { GraduationCap } from 'lucide-react';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <p className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <GraduationCap className="size-5" />
          </span>
          CUTM LMS
        </p>
        <main className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
      <aside className="bg-sidebar text-sidebar-foreground relative hidden flex-col justify-end overflow-hidden p-10 lg:flex">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,var(--color-sidebar-accent),transparent_55%),radial-gradient(circle_at_80%_90%,color-mix(in_oklch,var(--color-gold)_35%,transparent),transparent_50%)]"
        />
        <div className="relative grid max-w-md gap-3">
          <span className="bg-gold h-1 w-12 rounded-full" />
          <p className="text-3xl font-semibold tracking-tight">Centurion University of Technology and Management</p>
          <p className="text-sidebar-foreground/75">Learning Management System for students, faculty and staff.</p>
        </div>
      </aside>
    </div>
  );
}
