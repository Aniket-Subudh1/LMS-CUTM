import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LockKeyIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../loading';
import { changePassword, signOutEverywhere, startGithubLink, unlinkGithub } from './actions';
import { ActionForm, Field } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { PasswordInput } from '@/components/password-input';
import { Section } from '@/components/section';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireViewer } from '@/lib/auth/session';
import { getGithubLink } from '@/lib/data/users';
import { formatDate, initials, ROLE_LABEL } from '@/lib/format';

export const metadata: Metadata = { title: 'Profile' };

const Search = z.object({ github: z.enum(['linked', 'taken', 'failed']).optional().catch(undefined) });

// What came back from GitHub after "Link GitHub account" (/api/auth/github/callback).
const GITHUB_RESULT = {
  linked: 'GitHub linked. Your commits in project repositories now count as yours.',
  taken: 'That GitHub account is already linked to another LMS user. Sign in to GitHub as yourself and try again.',
  failed: 'GitHub did not confirm the link. Try again.',
} as const;

export default function ProfilePage({ searchParams }: PageProps<'/profile'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Profile searchParams={searchParams} />
    </Suspense>
  );
}

async function Profile({ searchParams }: { searchParams: PageProps<'/profile'>['searchParams'] }) {
  const viewer = await requireViewer();
  const { github: result } = Search.parse(await searchParams);
  const github = viewer.roles.includes('student') ? await getGithubLink() : null;
  return (
    <>
      <PageHeader
        icon={<PageIcon name="profile" />}
        title="Profile"
        description="Name and email are set by the university."
      />
      <div className="grid gap-8">
        <section className="surface relative overflow-hidden">
          <div aria-hidden="true" className="brand-aurora h-20 sm:h-24" />
          <div className="flex flex-wrap items-end gap-4 px-5 pb-5 sm:px-6">
            <p
              aria-hidden="true"
              className="bg-card text-primary ring-border -mt-10 grid size-20 shrink-0 place-items-center rounded-lg text-2xl font-semibold ring-1"
            >
              {initials(viewer.name)}
            </p>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">{viewer.name}</h2>
              <p className="text-muted-foreground text-sm break-all">{viewer.email}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {viewer.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABEL[role]}
                </Badge>
              ))}
            </div>
          </div>
        </section>

        {github && (github.ready || github.login) && (
          <Section
            icon={<PageIcon name="code" className="size-8" />}
            title="GitHub"
            description="Link your GitHub account so your commits in project repositories count as yours."
          >
            {result && (
              <Alert variant={result === 'linked' ? 'default' : 'destructive'}>
                <AlertDescription>{GITHUB_RESULT[result]}</AlertDescription>
              </Alert>
            )}
            {github.login ? (
              <div className="ring-border/70 flex flex-wrap items-center justify-between gap-3 rounded-md p-3 ring-1">
                <span className="grid">
                  <b className="text-[0.8125rem]">Linked as {github.login}</b>
                  {github.linkedAt && (
                    <span className="text-muted-foreground text-xs">Since {formatDate(github.linkedAt)}</span>
                  )}
                </span>
                <ActionForm
                  action={unlinkGithub}
                  submitLabel="Unlink"
                  submitVariant="outline"
                  submitSize="sm"
                  confirm={{
                    title: 'Unlink GitHub?',
                    message: 'Your new commits stop counting as yours until you link an account again.',
                  }}
                />
              </div>
            ) : (
              <ActionForm action={startGithubLink} submitLabel="Link GitHub account" submitSize="sm" />
            )}
            <p className="text-muted-foreground text-xs">
              “Link GitHub account” takes you to GitHub to confirm, then back here. The LMS reads only your username and
              id.
            </p>
          </Section>
        )}

        <Section
          icon={<PageIcon name="signin" className="size-8" />}
          title="Security"
          description="Keep your account yours. Both actions are recorded in the audit log."
        >
          <ul className="grid gap-4 md:grid-cols-2">
            {/* A candidate signs in with an email code and has no password (M04b, TP-03). */}
            {viewer.roles.some((role) => role !== 'candidate') && (
              <li className="surface flex flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <span className="icon-chip size-10 [&_svg]:size-5">
                    <PageIcon name="key" className="size-8" />
                  </span>
                  <div>
                    <h3 className="font-medium">Password</h3>
                    <p className="text-muted-foreground text-sm">Changing it signs you out on every other device.</p>
                  </div>
                </div>
                <FormDialog
                  trigger={
                    <Button variant="outline" size="sm" className="mt-auto self-start">
                      <LockKeyIcon weight="duotone" /> Change password
                    </Button>
                  }
                  icon={<PageIcon name="key" className="size-8" />}
                  title="Change password"
                  description="You stay signed in on this browser."
                  openParam="password"
                  action={changePassword}
                  submitLabel="Change password"
                  successMessage="Your password has been changed."
                >
                  <Field name="current" label="Current password">
                    <PasswordInput name="current" autoComplete="current-password" required />
                  </Field>
                  <Field name="password" label="New password" hint="10 to 128 characters. Not your email address.">
                    <PasswordInput
                      name="password"
                      autoComplete="new-password"
                      required
                      minLength={10}
                      maxLength={128}
                    />
                  </Field>
                  <Field name="confirm" label="Repeat the new password">
                    <PasswordInput name="confirm" autoComplete="new-password" required />
                  </Field>
                </FormDialog>
              </li>
            )}
            <li className="surface flex flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <span className="icon-chip size-10 [&_svg]:size-5">
                  <PageIcon name="devices" className="size-8" />
                </span>
                <div>
                  <h3 className="font-medium">Other devices</h3>
                  <p className="text-muted-foreground text-sm">Ends every sign-in, including this browser.</p>
                </div>
              </div>
              <div className="mt-auto">
                <ActionForm
                  action={signOutEverywhere}
                  submitLabel="Sign out everywhere"
                  submitVariant="destructive"
                  submitSize="sm"
                  confirm={{
                    title: 'Sign out everywhere?',
                    message: 'You will need to sign in again on every device, including this one.',
                  }}
                />
              </div>
            </li>
          </ul>
        </Section>
      </div>
    </>
  );
}
