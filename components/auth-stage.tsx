'use client';

import { useLayoutEffect, useRef } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { UniversityLogo } from '@/components/university-logo';

export function AuthStage() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const ctx = gsap.context(() => {
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ defaults: { ease: 'power2.out' } })
          .from('[data-auth-motion="logo"]', { y: 12, opacity: 0, duration: 0.7 }, 0)
          .from('[data-auth-motion="rule"]', { scaleX: 0, duration: 0.55 }, 0.16)
          .from('[data-auth-motion="line"]', { y: 8, opacity: 0, duration: 0.5, stagger: 0.08 }, 0.24)
          .from('[data-auth-motion="print"]', { y: 16, opacity: 0, duration: 0.7 }, 0.32);
        gsap.to('[data-auth-motion="lotus"]', {
          rotation: 8,
          duration: 22,
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
    <aside ref={root} className="bg-background relative hidden overflow-hidden border-r lg:flex lg:flex-col">
      <Image
        src="/brand/lotus.svg"
        alt=""
        width={200}
        height={200}
        unoptimized
        data-auth-motion="lotus"
        className="pointer-events-none absolute -right-24 -bottom-28 w-[28rem] opacity-[0.22]"
      />
      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 py-12 xl:px-16">
        <div data-auth-motion="logo" className="w-40 xl:w-48">
          <UniversityLogo priority sizes="12rem" className="w-full" />
        </div>
        <span aria-hidden="true" data-auth-motion="rule" className="bg-gold mt-8 block h-px w-16 origin-left" />
        <p
          data-auth-motion="line"
          className="mt-6 max-w-md text-3xl leading-tight font-semibold tracking-tight xl:text-4xl"
        >
          Connecting through knowledge.
        </p>
        <p data-auth-motion="line" className="text-muted-foreground mt-4 max-w-sm text-sm leading-relaxed">
          The learning system for students, faculty and staff of Centurion University.
        </p>
      </div>
      <div data-auth-motion="print" aria-hidden="true" className="auth-print relative z-10 h-40 w-full" />
    </aside>
  );
}
