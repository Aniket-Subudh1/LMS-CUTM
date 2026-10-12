export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <p className="text-primary text-lg font-semibold">CUTM LMS</p>
      {children}
    </main>
  );
}
