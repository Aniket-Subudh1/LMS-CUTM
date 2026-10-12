import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'CUTM LMS', template: '%s · CUTM LMS' },
  description: 'Learning Management System of Centurion University of Technology and Management',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
