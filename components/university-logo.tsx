import Image from 'next/image';
import { cn } from '@/lib/cn';

export function UniversityLogo({
  className,
  sizes,
  priority = false,
}: {
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/logo.png"
      alt="Centurion University of Technology and Management. Shaping Lives. Empowering Communities."
      width={960}
      height={1516}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
      className={cn('h-auto', className)}
    />
  );
}
