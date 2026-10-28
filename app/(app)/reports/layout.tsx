import { TabNav } from '@/components/tab-nav';

// M09 (08 §3): the reports as tabs under the one sidebar item; each page checks who may read it.
export default function ReportsLayout({ children }: LayoutProps<'/reports'>) {
  return (
    <>
      <TabNav
        tabs={[
          { href: '/reports/ce', label: 'Continuous evaluation' },
          { href: '/reports/attainment', label: 'Attainment' },
        ]}
      />
      {children}
    </>
  );
}
