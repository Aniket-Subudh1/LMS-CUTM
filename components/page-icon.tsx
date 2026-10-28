import Image from 'next/image';
import { cn } from '@/lib/cn';
import assignment from '@/public/icons/assignment.png';
import attainment from '@/public/icons/attainment.png';
import attendance from '@/public/icons/attendance.png';
import audit from '@/public/icons/audit.png';
import badge from '@/public/icons/badge.png';
import bank from '@/public/icons/bank.png';
import baskets from '@/public/icons/baskets.png';
import batches from '@/public/icons/batches.png';
import blank from '@/public/icons/blank.png';
import books from '@/public/icons/books.png';
import catalog from '@/public/icons/catalog.png';
import chart from '@/public/icons/chart.png';
import chat from '@/public/icons/chat.png';
import code from '@/public/icons/code.png';
import complete from '@/public/icons/complete.png';
import completed from '@/public/icons/completed.png';
import course from '@/public/icons/course.png';
import cover from '@/public/icons/cover.png';
import courses from '@/public/icons/courses.png';
import credits from '@/public/icons/credits.png';
import curriculum from '@/public/icons/curriculum.png';
import dashboard from '@/public/icons/dashboard.png';
import deadline from '@/public/icons/deadline.png';
import departments from '@/public/icons/departments.png';
import devices from '@/public/icons/devices.png';
import diploma from '@/public/icons/diploma.png';
import document from '@/public/icons/document.png';
import draft from '@/public/icons/draft.png';
import dropping from '@/public/icons/dropping.png';
import engagement from '@/public/icons/engagement.png';
import envelope from '@/public/icons/envelope.png';
import evaluation from '@/public/icons/evaluation.png';
import exams from '@/public/icons/exams.png';
import faculty from '@/public/icons/faculty.png';
import fileq from '@/public/icons/fileq.png';
import github from '@/public/icons/github.png';
import globe from '@/public/icons/globe.png';
import guests from '@/public/icons/guests.png';
import handin from '@/public/icons/handin.png';
import history from '@/public/icons/history.png';
import imports from '@/public/icons/imports.png';
import integrations from '@/public/icons/integrations.png';
import key from '@/public/icons/key.png';
import lab from '@/public/icons/lab.png';
import labtest from '@/public/icons/labtest.png';
import lesson from '@/public/icons/lesson.png';
import lessons from '@/public/icons/lessons.png';
import link from '@/public/icons/link.png';
import live from '@/public/icons/live.png';
import locked from '@/public/icons/locked.png';
import mapping from '@/public/icons/mapping.png';
import marks from '@/public/icons/marks.png';
import matching from '@/public/icons/matching.png';
import mcq from '@/public/icons/mcq.png';
import meetings from '@/public/icons/meetings.png';
import missing from '@/public/icons/missing.png';
import modules from '@/public/icons/modules.png';
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
import proctoring from '@/public/icons/proctoring.png';
import programmes from '@/public/icons/programmes.png';
import projects from '@/public/icons/projects.png';
import quiz from '@/public/icons/quiz.png';
import records from '@/public/icons/records.png';
import reports from '@/public/icons/reports.png';
import results from '@/public/icons/results.png';
import session from '@/public/icons/session.png';
import settings from '@/public/icons/settings.png';
import signin from '@/public/icons/signin.png';
import sparkle from '@/public/icons/sparkle.png';
import structure from '@/public/icons/structure.png';
import students from '@/public/icons/students.png';
import task from '@/public/icons/task.png';
import terms from '@/public/icons/terms.png';
import tests from '@/public/icons/tests.png';
import textq from '@/public/icons/textq.png';
import today from '@/public/icons/today.png';
import trophy from '@/public/icons/trophy.png';
import truefalse from '@/public/icons/truefalse.png';
import users from '@/public/icons/users.png';
import video from '@/public/icons/video.png';
import warning from '@/public/icons/warning.png';
import week from '@/public/icons/week.png';

export const pageIcons = {
  assignment,
  attainment,
  attendance,
  audit,
  badge,
  bank,
  baskets,
  batches,
  blank,
  books,
  catalog,
  chart,
  chat,
  code,
  complete,
  completed,
  course,
  cover,
  courses,
  credits,
  curriculum,
  dashboard,
  deadline,
  departments,
  devices,
  diploma,
  document,
  draft,
  dropping,
  engagement,
  envelope,
  evaluation,
  exams,
  faculty,
  fileq,
  github,
  globe,
  guests,
  handin,
  history,
  imports,
  integrations,
  key,
  lab,
  labtest,
  lesson,
  lessons,
  link,
  live,
  locked,
  mapping,
  marks,
  matching,
  mcq,
  meetings,
  missing,
  modules,
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
  proctoring,
  programmes,
  projects,
  quiz,
  records,
  reports,
  results,
  session,
  settings,
  signin,
  sparkle,
  structure,
  students,
  task,
  terms,
  tests,
  textq,
  today,
  trophy,
  truefalse,
  users,
  video,
  warning,
  week,
} as const;

export type PageIconName = keyof typeof pageIcons;

// The page's own mark. Decorative: the heading beside it is the accessible name.
export function PageIcon({ name, className }: { name: PageIconName; className?: string }) {
  return <Image src={pageIcons[name]} alt="" className={cn('size-10 object-contain', className)} />;
}
