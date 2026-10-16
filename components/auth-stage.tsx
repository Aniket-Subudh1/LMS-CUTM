'use client';

import { useLayoutEffect, useRef } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import iconCourses from '@/public/auth/icon-courses.jpg';
import iconMarks from '@/public/auth/icon-marks.jpg';
import iconShield from '@/public/auth/icon-shield.jpg';
import students from '@/public/auth/students.jpg';

export function AuthStage() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const ctx = gsap.context(() => {
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        const cards = gsap.utils.toArray<HTMLElement>('[data-auth-motion="card"]');
        gsap
          .timeline({ delay: 0.3 })
          .fromTo(
            cards,
            { autoAlpha: 0, y: 18 },
            { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.14, force3D: true },
          )
          .add(() => {
            cards.forEach((card, i) => {
              gsap.to(card, {
                y: -6,
                duration: 4 + i * 0.8,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true,
                force3D: true,
              });
            });
          });
      });
    }, node);
    return () => ctx.revert();
  }, []);

  return (
    <aside
      ref={root}
      className="relative hidden overflow-hidden rounded-[1.75rem] lg:sticky lg:top-3 lg:block lg:h-[calc(100dvh-1.5rem)] lg:self-start"
    >
      <Image
        src={students}
        alt="Three students working together at a laptop in a university library"
        fill
        placeholder="blur"
        sizes="55vw"
        fetchPriority="high"
        className="object-cover object-[center_35%]"
      />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/15 via-transparent to-black/35" />

      <div data-auth-motion="card" className="absolute top-[6%] left-[6%] w-76 motion-safe:invisible">
        <div className="bg-primary text-primary-foreground relative z-10 flex items-start gap-3.5 rounded-2xl p-4 pr-6 shadow-xl shadow-black/20">
          <span className="bg-card grid size-12 shrink-0 place-items-center rounded-xl">
            <Image src={iconCourses} alt="" sizes="40px" className="size-10 mix-blend-multiply" />
          </span>
          <span className="grid gap-0.5">
            <span className="text-sm font-semibold">Every course in one place</span>
            <span className="text-primary-foreground/80 text-xs leading-relaxed">
              Syllabus, outcomes and the people on each offering.
            </span>
          </span>
          <span className="bg-gold absolute top-4 right-4 size-1.5 rounded-full" />
        </div>
        <div className="mx-5 -mt-3 rounded-b-2xl bg-black/50 px-4 pt-5 pb-2.5 text-xs text-white/85 backdrop-blur-md">
          Lessons and live classes, too
        </div>
      </div>

      <div
        data-auth-motion="card"
        className="absolute top-[52%] right-[5%] flex w-72 items-start gap-3.5 rounded-2xl bg-black/40 p-4 text-white shadow-xl ring-1 shadow-black/20 ring-white/20 backdrop-blur-xl motion-safe:invisible"
      >
        <span className="bg-card grid size-12 shrink-0 place-items-center rounded-xl">
          <Image src={iconShield} alt="" sizes="40px" className="size-10 mix-blend-multiply" />
        </span>
        <span className="grid gap-0.5">
          <span className="text-sm font-semibold">Your account, protected</span>
          <span className="text-xs leading-relaxed text-white/80">
            Password links that expire, and sign-out on every device.
          </span>
        </span>
      </div>

      <div
        data-auth-motion="card"
        className="bg-card text-card-foreground absolute bottom-[6%] left-[6%] flex w-76 items-start gap-3.5 rounded-2xl p-4 pr-6 shadow-xl shadow-black/20 motion-safe:invisible"
      >
        <span className="bg-background grid size-12 shrink-0 place-items-center rounded-xl">
          <Image src={iconMarks} alt="" sizes="40px" className="size-10 mix-blend-multiply" />
        </span>
        <span className="grid gap-0.5">
          <span className="text-sm font-semibold">Marks you can trust</span>
          <span className="text-muted-foreground text-xs leading-relaxed">
            Internal marks follow the evaluation scheme, and every change is audited.
          </span>
        </span>
        <span className="bg-gold absolute top-4 right-4 size-1.5 rounded-full" />
      </div>
    </aside>
  );
}
