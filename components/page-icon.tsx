import Image from 'next/image';
import { cn } from '@/lib/cn';
import assignment from '@/public/icons/assignment.png';
import attendance from '@/public/icons/attendance.png';
import audit from '@/public/icons/audit.png';
import badge from '@/public/icons/badge.png';
import bank from '@/public/icons/bank.png';
import baskets from '@/public/icons/baskets.png';
import blank from '@/public/icons/blank.png';
import books from '@/public/icons/books.png';
import catalog from '@/public/icons/catalog.png';
import chart from '@/public/icons/chart.png';
import chat from '@/public/icons/chat.png';
import code from '@/public/icons/code.png';
import course from '@/public/icons/course.png';
import cover from '@/public/icons/cover.png';
import courses from '@/public/icons/courses.png';
import dashboard from '@/public/icons/dashboard.png';
import departments from '@/public/icons/departments.png';
import devices from '@/public/icons/devices.png';
import diploma from '@/public/icons/diploma.png';
import envelope from '@/public/icons/envelope.png';
import evaluation from '@/public/icons/evaluation.png';
import fileq from '@/public/icons/fileq.png';
import globe from '@/public/icons/globe.png';
import imports from '@/public/icons/imports.png';
import key from '@/public/icons/key.png';
import lab from '@/public/icons/lab.png';
import labtest from '@/public/icons/labtest.png';
import lesson from '@/public/icons/lesson.png';
import lessons from '@/public/icons/lessons.png';
import live from '@/public/icons/live.png';
import mapping from '@/public/icons/mapping.png';
import matching from '@/public/icons/matching.png';
import mcq from '@/public/icons/mcq.png';
import missing from '@/public/icons/missing.png';
import msq from '@/public/icons/msq.png';
import notifications from '@/public/icons/notifications.png';
import numeric from '@/public/icons/numeric.png';
import offerings from '@/public/icons/offerings.png';
import ordering from '@/public/icons/ordering.png';
import outcomes from '@/public/icons/outcomes.png';
import overview from '@/public/icons/overview.png';
import people from '@/public/icons/people.png';
import plan from '@/public/icons/plan.png';
import profile from '@/public/icons/profile.png';
import programmes from '@/public/icons/programmes.png';
import quiz from '@/public/icons/quiz.png';
import session from '@/public/icons/session.png';
import settings from '@/public/icons/settings.png';
import sparkle from '@/public/icons/sparkle.png';
import signin from '@/public/icons/signin.png';
import structure from '@/public/icons/structure.png';
import terms from '@/public/icons/terms.png';
import textq from '@/public/icons/textq.png';
import trophy from '@/public/icons/trophy.png';
import truefalse from '@/public/icons/truefalse.png';
import users from '@/public/icons/users.png';
import video from '@/public/icons/video.png';

export const pageIcons = {
  assignment,
  attendance,
  audit,
  badge,
  bank,
  baskets,
  blank,
  books,
  catalog,
  chart,
  chat,
  code,
  course,
  cover,
  courses,
  dashboard,
  departments,
  devices,
  diploma,
  envelope,
  evaluation,
  fileq,
  globe,
  imports,
  key,
  lab,
  labtest,
  lesson,
  lessons,
  live,
  mapping,
  matching,
  mcq,
  missing,
  msq,
  notifications,
  numeric,
  offerings,
  ordering,
  outcomes,
  overview,
  people,
  plan,
  profile,
  programmes,
  quiz,
  session,
  settings,
  signin,
  sparkle,
  structure,
  terms,
  textq,
  trophy,
  truefalse,
  users,
  video,
} as const;

export type PageIconName = keyof typeof pageIcons;

// The page's own mark. Decorative: the heading beside it is the accessible name.
export function PageIcon({ name, className }: { name: PageIconName; className?: string }) {
  return <Image src={pageIcons[name]} alt="" className={cn('size-10 object-contain', className)} />;
}
