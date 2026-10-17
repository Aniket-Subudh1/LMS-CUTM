import Image from 'next/image';
import { cn } from '@/lib/cn';
import attendance from '@/public/icons/attendance.png';
import audit from '@/public/icons/audit.png';
import badge from '@/public/icons/badge.png';
import baskets from '@/public/icons/baskets.png';
import books from '@/public/icons/books.png';
import catalog from '@/public/icons/catalog.png';
import course from '@/public/icons/course.png';
import courses from '@/public/icons/courses.png';
import dashboard from '@/public/icons/dashboard.png';
import departments from '@/public/icons/departments.png';
import devices from '@/public/icons/devices.png';
import diploma from '@/public/icons/diploma.png';
import envelope from '@/public/icons/envelope.png';
import evaluation from '@/public/icons/evaluation.png';
import globe from '@/public/icons/globe.png';
import imports from '@/public/icons/imports.png';
import key from '@/public/icons/key.png';
import lesson from '@/public/icons/lesson.png';
import lessons from '@/public/icons/lessons.png';
import live from '@/public/icons/live.png';
import mapping from '@/public/icons/mapping.png';
import missing from '@/public/icons/missing.png';
import notifications from '@/public/icons/notifications.png';
import offerings from '@/public/icons/offerings.png';
import outcomes from '@/public/icons/outcomes.png';
import overview from '@/public/icons/overview.png';
import people from '@/public/icons/people.png';
import plan from '@/public/icons/plan.png';
import profile from '@/public/icons/profile.png';
import programmes from '@/public/icons/programmes.png';
import session from '@/public/icons/session.png';
import settings from '@/public/icons/settings.png';
import signin from '@/public/icons/signin.png';
import structure from '@/public/icons/structure.png';
import terms from '@/public/icons/terms.png';
import users from '@/public/icons/users.png';
import video from '@/public/icons/video.png';

export const pageIcons = {
  attendance,
  audit,
  badge,
  baskets,
  books,
  catalog,
  course,
  courses,
  dashboard,
  departments,
  devices,
  diploma,
  envelope,
  evaluation,
  globe,
  imports,
  key,
  lesson,
  lessons,
  live,
  mapping,
  missing,
  notifications,
  offerings,
  outcomes,
  overview,
  people,
  plan,
  profile,
  programmes,
  session,
  settings,
  signin,
  structure,
  terms,
  users,
  video,
} as const;

export type PageIconName = keyof typeof pageIcons;

// The page's own mark. Decorative: the heading beside it is the accessible name.
export function PageIcon({ name, className }: { name: PageIconName; className?: string }) {
  return <Image src={pageIcons[name]} alt="" className={cn('size-10 object-contain', className)} />;
}
