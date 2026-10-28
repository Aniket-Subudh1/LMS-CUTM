import { PageIcon, type PageIconName } from '@/components/page-icon';
import { TabNav } from '@/components/tab-nav';

const mark = (name: PageIconName) => <PageIcon name={name} className="size-4" />;

// M09 (08 §3): the reports as tabs under the one sidebar item; each page checks who may read it.
export default function ReportsLayout({ children }: LayoutProps<'/reports'>) {
  return (
    <>
      <TabNav
        tabs={[
          { href: '/reports/ce', label: 'Continuous evaluation', icon: mark('marks') },
          { href: '/reports/attainment', label: 'Attainment', icon: mark('attainment') },
          { href: '/reports/engagement', label: 'Engagement', icon: mark('engagement') },
        ]}
      />
      {children}
    </>
  );
}
