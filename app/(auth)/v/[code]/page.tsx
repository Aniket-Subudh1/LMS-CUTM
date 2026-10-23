import { Suspense } from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { SealCheckIcon, WarningCircleIcon } from '@phosphor-icons/react/ssr';
import { getCertificate } from '@/lib/data/results';
import { formatDate, formatPct, ordinal } from '@/lib/format';
import { certificateCode } from '@/lib/schemas/assessment';

export const metadata: Metadata = { title: 'Certificate check' };

export default function CertificatePage({ params }: PageProps<'/v/[code]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-center text-sm">Checking the certificate…</p>}>
      <Check params={params} />
    </Suspense>
  );
}

// TP-12: what anyone scanning a certificate's QR code, or typing its link, sees — whether the LMS issued it, and what it
// states, from the record as it is now. No sign-in, and nothing the certificate does not already print.
async function Check({ params }: { params: PageProps<'/v/[code]'>['params'] }) {
  const { code } = await params;
  // The record is read as it is now, on every visit.
  await connection();
  const parsed = certificateCode.safeParse(code.trim().toUpperCase());
  const found = parsed.success ? await getCertificate(parsed.data) : null;
  if (!found) {
    return (
      <div className="grid gap-3">
        <span className="bg-destructive/10 text-destructive inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium">
          <WarningCircleIcon className="size-3.5" /> Not found
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">No certificate has this code</h1>
        <p className="text-muted-foreground text-sm">
          Check the code printed under the QR code on the certificate: two groups of five letters and digits, such as
          7KQ2M-91XAH.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      {found.valid ? (
        <span className="bg-success/10 text-success inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium">
          <SealCheckIcon className="size-3.5" /> Issued by Centurion LMS
        </span>
      ) : (
        <span className="bg-destructive/10 text-destructive inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium">
          <WarningCircleIcon className="size-3.5" /> No longer valid
        </span>
      )}
      <div className="grid gap-2">
        <p className="text-gold text-xs font-semibold tracking-[0.25em] uppercase">Certificate of achievement</p>
        <h1 className="font-serif text-3xl leading-tight text-balance">{found.name}</h1>
        <p className="text-sm leading-relaxed">
          took <b>{found.test}</b> on {formatDate(found.takenOn)} and scored <b>{formatPct(found.pct)}</b>
          {found.standing && `, ranking ${ordinal(found.standing.rank)} of ${found.standing.of}`}
          {found.band && (
            <>
              , with the rating <b>{found.band}</b>
            </>
          )}
          .
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        {[
          ['Code', parsed.success ? parsed.data : code],
          ['Course', found.course ?? 'Standalone test'],
        ].map(([label, value]) => (
          <div key={label} className="bg-card ring-border/70 grid content-start gap-0.5 rounded-md p-2.5 ring-1">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-[0.8125rem] leading-snug font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {!found.valid && (
        <p className="text-muted-foreground bg-muted/60 rounded-md px-3 py-2 text-[0.8125rem]">
          The marks for this attempt changed after the certificate was made, and the result no longer earns one.
        </p>
      )}
    </div>
  );
}
