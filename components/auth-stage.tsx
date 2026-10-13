'use client';

import { useLayoutEffect, useRef } from 'react';
import Image from 'next/image';
import { ChartLineUpIcon, ShieldCheckIcon, StackIcon } from '@phosphor-icons/react';
import gsap from 'gsap';
import { UniversityLogo } from '@/components/university-logo';

const FEATURES = [
  {
    icon: StackIcon,
    title: 'Every course in one place',
    text: 'Syllabus, outcomes and the people on each offering.',
  },
  {
    icon: ChartLineUpIcon,
    title: 'Marks you can trust',
    text: 'Internal marks follow the evaluation scheme, and every change is audited.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Your account, protected',
    text: 'Password links that expire, and sign-out on every device in one click.',
  },
];

export function AuthStage() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const ctx = gsap.context(() => {
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from('[data-auth-motion="logo"]', { y: 16, opacity: 0, scale: 0.96, duration: 0.8 }, 0)
          .from('[data-auth-motion="line"]', { y: 12, opacity: 0, duration: 0.6, stagger: 0.08 }, 0.2)
          .from('[data-auth-motion="feature"]', { x: -12, opacity: 0, duration: 0.5, stagger: 0.1 }, 0.45);
        gsap.to('[data-auth-motion="lotus"]', {
          rotation: 12,
          duration: 26,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          transformOrigin: '50% 50%',
        });
      });
    }, node);
    return () => ctx.revert();
  }, []);

  return (
    <aside
      ref={root}
      className="auth-aurora motion-safe:animate-aurora relative hidden overflow-hidden text-white lg:flex lg:flex-col"
    >
      <Image
        src="/brand/lotus.svg"
        alt=""
        width={200}
        height={200}
        unoptimized
        data-auth-motion="lotus"
        className="pointer-events-none absolute -right-32 -bottom-36 w-[34rem] opacity-25 brightness-0 invert"
      />
      <div className="relative z-10 flex flex-1 flex-col justify-between gap-12 px-10 py-10 xl:px-16 xl:py-14">
        <div data-auth-motion="logo" className="w-fit rounded-2xl bg-white p-3 shadow-lg shadow-black/15">
          <UniversityLogo priority sizes="7rem" className="w-24 xl:w-28" />
        </div>
        <div className="grid max-w-lg gap-8">
          <div className="grid gap-4">
            <p data-auth-motion="line" className="text-sm font-semibold tracking-[0.18em] text-white/70 uppercase">
              Learning Management System
            </p>
            <h2 data-auth-motion="line" className="text-4xl leading-[1.1] font-semibold tracking-tight xl:text-5xl">
              Connecting through knowledge.
            </h2>
            <p data-auth-motion="line" className="max-w-md text-base leading-relaxed text-white/80">
              The learning system for students, faculty and staff of Centurion University.
            </p>
          </div>
          <ul className="grid gap-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                data-auth-motion="feature"
                className="flex items-start gap-4 rounded-xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/15">
                  <f.icon className="size-5" />
                </span>
                <span className="grid gap-0.5">
                  <span className="font-medium">{f.title}</span>
                  <span className="text-sm text-white/75">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">Centurion University of Technology and Management</p>
      </div>
    </aside>
  );
}
