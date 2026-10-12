import { AuthStage } from '@/components/auth-stage';
import { UniversityLogo } from '@/components/university-logo';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="bg-background grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(30rem,0.95fr)]">
      <AuthStage />
      <main className="flex min-w-0 flex-col">
        <div className="auth-aurora motion-safe:animate-aurora flex justify-center px-4 pt-8 pb-16 lg:hidden">
          <span className="rounded-2xl bg-white p-2.5 shadow-lg shadow-black/15">
            <UniversityLogo priority sizes="5rem" className="w-16 sm:w-20" />
          </span>
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-10 lg:items-center lg:px-12 lg:py-12">
          <div className="surface motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 -mt-10 w-full max-w-md p-6 motion-safe:duration-500 sm:p-8 lg:mt-0">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
