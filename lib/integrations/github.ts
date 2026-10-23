import 'server-only';
import { App } from 'octokit';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';

// 06 §4.5 (M07). Only this file talks to GitHub: the App reads repositories it is installed on, links a student's account
// through OAuth, and verifies webhooks. Until the App's settings are present, GitHub projects say it is not set up.

type Settings = { appId: string; slug: string; privateKey: string; clientId: string; clientSecret: string; secret: string };

function settings(): Settings | null {
  const e = env();
  if (
    !e.GITHUB_APP_ID ||
    !e.GITHUB_APP_SLUG ||
    !e.GITHUB_APP_PRIVATE_KEY ||
    !e.GITHUB_CLIENT_ID ||
    !e.GITHUB_CLIENT_SECRET ||
    !e.GITHUB_WEBHOOK_SECRET
  ) {
    return null;
  }
  return {
    appId: e.GITHUB_APP_ID,
    slug: e.GITHUB_APP_SLUG,
    privateKey: e.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientId: e.GITHUB_CLIENT_ID,
    clientSecret: e.GITHUB_CLIENT_SECRET,
    secret: e.GITHUB_WEBHOOK_SECRET,
  };
}

export function githubConfigured(): boolean {
  return settings() !== null;
}

let app: InstanceType<typeof App> | undefined;

function github(): { app: InstanceType<typeof App>; settings: Settings } {
  const s = settings();
  if (!s) throw new AppError('CONFLICT', 'GitHub is not set up yet. Ask an administrator.');
  app ??= new App({
    appId: s.appId,
    privateKey: s.privateKey,
    oauth: { clientId: s.clientId, clientSecret: s.clientSecret },
    webhooks: { secret: s.secret },
  });
  return { app, settings: s };
}

const status = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;

export function installUrl(): string {
  return `https://github.com/apps/${github().settings.slug}/installations/new`;
}

export function oauthAuthorizeUrl(state: string): string {
  const query = new URLSearchParams({
    client_id: github().settings.clientId,
    state,
    redirect_uri: `${env().APP_URL}/api/auth/github/callback`,
  });
  return `https://github.com/login/oauth/authorize?${query}`;
}

// The account behind an OAuth code: only its id and login are kept.
export async function exchangeOAuthCode(code: string): Promise<{ id: number; login: string }> {
  const { app: gh } = github();
  const { authentication } = await gh.oauth.createToken({ code });
  const octokit = await gh.oauth.getUserOctokit({ token: authentication.token });
  const { data } = await octokit.request('GET /user');
  return { id: Number(data.id), login: data.login };
}

export async function resolveRepo(owner: string, name: string): Promise<{ installationId: number; defaultBranch: string }> {
  const { app: gh } = github();
  try {
    const { data: installation } = await gh.octokit.request('GET /repos/{owner}/{repo}/installation', {
      owner,
      repo: name,
    });
    const octokit = await gh.getInstallationOctokit(installation.id);
    const { data: repo } = await octokit.request('GET /repos/{owner}/{repo}', { owner, repo: name });
    return { installationId: installation.id, defaultBranch: repo.default_branch };
  } catch (error) {
    if (status(error) === 404) {
      throw new AppError('NOT_FOUND', 'Install the CUTM LMS GitHub App on this repository first.');
    }
    throw new AppError('INTEGRATION', 'GitHub did not answer. Try again in a minute.');
  }
}

export type GithubCommit = {
  sha: string;
  authorLogin: string | null;
  authorId: number | null;
  committedAt: Date;
  message: string;
  parents: number;
};

export async function listCommits(input: {
  installationId: number;
  owner: string;
  name: string;
  since: Date | null;
}): Promise<GithubCommit[]> {
  const octokit = await github().app.getInstallationOctokit(input.installationId);
  const commits = await octokit.paginate('GET /repos/{owner}/{repo}/commits', {
    owner: input.owner,
    repo: input.name,
    per_page: 100,
    ...(input.since ? { since: input.since.toISOString() } : {}),
  });
  return commits.map((c) => ({
    sha: c.sha,
    authorLogin: c.author?.login ?? null,
    authorId: c.author?.id ?? null,
    committedAt: new Date(c.commit.committer?.date ?? c.commit.author?.date ?? Date.now()),
    message: c.commit.message.slice(0, 500),
    parents: c.parents.length,
  }));
}

export async function commitStats(input: {
  installationId: number;
  owner: string;
  name: string;
  sha: string;
}): Promise<{ additions: number; deletions: number }> {
  const octokit = await github().app.getInstallationOctokit(input.installationId);
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
    owner: input.owner,
    repo: input.name,
    ref: input.sha,
  });
  return { additions: data.stats?.additions ?? 0, deletions: data.stats?.deletions ?? 0 };
}

export async function verifyWebhook(rawBody: string, signature: string): Promise<void> {
  if (!(await github().app.webhooks.verify(rawBody, signature))) {
    throw new AppError('FORBIDDEN', 'The webhook signature does not match.');
  }
}
