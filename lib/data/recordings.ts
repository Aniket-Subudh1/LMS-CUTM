import 'server-only';
import { activeRecordings, recordingInfo, type Recording } from '@/lib/integrations/live';
import { LiveSession } from '@/lib/models/live-session';

// M03c T13: a recording the engine finished, saved or failed, onto its row. The row is found by the recording's id or,
// when its id was never stored (a start that timed out, or one that failed before the id was written), by its file.
export async function recordingEnded(roomName: string, recording: Recording, at: Date): Promise<void> {
  if (recording.status === 'active') return;
  const ended = {
    'recordings.$.status': recording.status,
    'recordings.$.endedAt': at,
    ...(recording.durationSec === null ? {} : { 'recordings.$.durationSec': recording.durationSec }),
  };
  const byId = await LiveSession.updateOne(
    { roomName, recordings: { $elemMatch: { egressId: recording.egressId, status: 'recording' } } },
    { $set: ended },
  );
  if (byId.matchedCount > 0 || !recording.key) return;
  await LiveSession.updateOne(
    { roomName, recordings: { $elemMatch: { key: recording.key, status: 'recording' } } },
    { $set: { ...ended, 'recordings.$.egressId': recording.egressId } },
  );
}

// M03c T13: rows still marked as recording that the engine no longer runs take the engine's word: saved or failed as
// it says, and failed when it has forgotten them. Run before a new recording starts, after one is stopped and after the
// room closes, so a lost webhook never leaves a class unable to record or a recording missing from its page.
export async function settleRecordings(sessionId: string, now: Date): Promise<void> {
  const session = await LiveSession.findById(sessionId, { roomName: 1, recordings: 1 }).lean();
  const running = session?.recordings?.filter((r) => r.status === 'recording') ?? [];
  if (!session || running.length === 0) return;
  const active = await activeRecordings(session.roomName);
  for (const row of running) {
    if (active.some((r) => r.key === row.key || (row.egressId !== '' && r.egressId === row.egressId))) continue;
    const info = row.egressId ? await recordingInfo(session.roomName, row.egressId) : null;
    if (info?.status === 'active') continue;
    await recordingEnded(
      session.roomName,
      info ?? { egressId: row.egressId, key: row.key, status: 'failed', durationSec: null },
      now,
    );
  }
}
