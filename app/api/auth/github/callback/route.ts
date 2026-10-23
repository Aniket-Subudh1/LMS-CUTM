import { writeAudit } from '@/lib/audit';
import { getViewer } from '@/lib/auth/session';
import { readToken } from '@/lib/auth/tokens';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { exchangeOAuthCode } from '@/lib/integrations/github';
import { log } from '@/lib/log';
import { User } from '@/lib/models/user';

// M07 T4 (06 §3): GitHub sends the user back here with a code and the state startGithubLink sealed. The state must name
// this browser's user at their current session version; the account's id and login are kept, unless another LMS user
// has already linked that account.
const back = (result: 'linked' | 'taken' | 'failed') =>
  Response.redirect(new URL(`/profile?github=${result}`, env().APP_URL), 302);

export async function GET(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer) return Response.redirect(new URL('/login', env().APP_URL), 302);
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  const state = await readToken(params.get('state') ?? '', ['github']);
  if (!code || !state || state.uid !== viewer.id) return back('failed');
  await db();
  const user = await User.findById(viewer.id, { sessionVersion: 1 }).lean();
  if (!user || user.sessionVersion !== state.sv) return back('failed');
  let account: { id: number; login: string };
  try {
    account = await exchangeOAuthCode(code);
  } catch (error) {
    log.warn('github link failed', { userId: viewer.id, error });
    return back('failed');
  }
  if (await User.exists({ 'github.id': account.id, _id: { $ne: viewer.id } })) return back('taken');
  await User.updateOne({ _id: viewer.id }, { $set: { github: { ...account, linkedAt: new Date() } } });
  await writeAudit({
    actorId: viewer.id,
    action: 'user.github_linked',
    entity: 'user',
    entityId: viewer.id,
    after: { login: account.login },
  });
  return back('linked');
}
