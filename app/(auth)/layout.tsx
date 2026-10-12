import { AuthStage } from '@/components/auth-stage';
import { UniversityLogo } from '@/components/university-logo';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="bg-background grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(26rem,0.9fr)]">
      <AuthStage />
      <main className="flex flex-col items-center justify-center gap-8 px-4 py-10 sm:px-8 lg:px-12 xl:px-20">
        <UniversityLogo
          priority
          sizes="8rem"
          className="motion-safe:animate-in motion-safe:fade-in-0 w-28 sm:w-32 lg:hidden"
        />
        <div className="sm:bg-card w-full max-w-md sm:rounded-xl sm:border sm:p-8 sm:shadow-sm lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          {children}
        </div>
      </main>
    </div>
  );
}
