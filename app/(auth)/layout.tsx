import { AuthStage } from '@/components/auth-stage';
import { UniversityLogo } from '@/components/university-logo';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="auth-wash grid min-h-dvh gap-3 p-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <main className="flex min-w-0 flex-col px-3 pt-3 pb-4 sm:px-10 sm:pt-6 lg:px-14 xl:px-20">
        <span className="flex w-fit items-center gap-4">
          <UniversityLogo priority sizes="48px" className="w-12" />
          <span className="grid gap-0.5 leading-tight">
            <span className="text-xl font-semibold tracking-tight">
              Centurion <span className="text-primary font-bold">LMS</span>
            </span>
            <span className="text-muted-foreground text-sm">Learning Management System</span>
          </span>
        </span>
        <div className="motion-safe:animate-in motion-safe:fade-in-0 mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center py-12 motion-safe:duration-700">
          {children}
        </div>
        <p className="text-muted-foreground text-xs">Centurion University of Technology and Management</p>
      </main>
      <AuthStage />
    </div>
  );
}
