'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-renders the page every `seconds` while its tab is visible: a student waiting for a live class sees the room as
// soon as the teacher starts it (A-69). It renders nothing.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}
