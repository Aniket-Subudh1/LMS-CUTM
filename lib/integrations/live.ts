import 'server-only';
import { AccessToken, RoomServiceClient, ServerError, WebhookReceiver } from 'livekit-server-sdk';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { log } from '@/lib/log';

// 06 §4.3. The live engine is self-hosted LiveKit (ADR-18); only this file talks to it from the server.
export type LiveRole = 'host' | 'participant';

// `sid` names one connection of a participant: a reconnect or a second tab is a new sid, so presence is matched by it.
export type LiveEvent =
  | { type: 'joined'; roomName: string; userId: string; sid: string; at: Date }
  | { type: 'left'; roomName: string; userId: string; sid: string; joinedAt: Date; at: Date }
  | { type: 'room_finished'; roomName: string; at: Date }
  | { type: 'ignored' };

let rooms: RoomServiceClient | undefined;
let receiver: WebhookReceiver | undefined;

const roomService = () =>
  (rooms ??= new RoomServiceClient(env().LIVEKIT_API_URL, env().LIVEKIT_API_KEY, env().LIVEKIT_API_SECRET));
const missing = (error: unknown) =>
  error instanceof ServerError && (error.status === 404 || error.code === 'not_found');

export async function joinToken(input: {
  roomName: string;
  userId: string;
  name: string;
  role: LiveRole;
  ttlSec: number;
}): Promise<{ serverUrl: string; token: string }> {
  const token = new AccessToken(env().LIVEKIT_API_KEY, env().LIVEKIT_API_SECRET, {
    identity: input.userId,
    name: input.name,
    ttl: input.ttlSec,
    // M03b: every browser in the room tells the hosts apart by this attribute. The token grants no
    // `canUpdateOwnMetadata`, so a participant cannot change their own name, role or hand.
    attributes: { role: input.role },
  });
  token.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: input.role === 'host',
  });
  return { serverUrl: env().LIVEKIT_URL, token: await token.toJwt() };
}

export async function closeRoom(roomName: string): Promise<void> {
  try {
    await roomService().deleteRoom(roomName);
  } catch (error) {
    // A room nobody joined, or one the engine already closed, does not exist: there is nothing to close.
    if (missing(error)) return;
    log.error('live request failed', { operation: 'closeRoom', roomName, error });
    throw new AppError('INTEGRATION', 'The live-class service did not answer. Try again in a minute.');
  }
}

// M03b: a raised hand is the participant attribute `hand`, the time it was raised in ms; "" lowers it. The server
// sets it, and every browser in the room sees the change, those who join later too. Someone no longer in the room has
// nothing to change.
export async function setHand(roomName: string, identity: string, raisedAt: Date | null): Promise<void> {
  try {
    await roomService().updateParticipant(roomName, identity, {
      attributes: { hand: raisedAt ? String(raisedAt.getTime()) : '' },
    });
  } catch (error) {
    if (missing(error)) return;
    log.error('live request failed', { operation: 'setHand', roomName, error });
    throw new AppError('INTEGRATION', 'The live-class service did not answer. Try again in a moment.');
  }
}

export async function parseWebhook(rawBody: string, authorization: string | null): Promise<LiveEvent> {
  receiver ??= new WebhookReceiver(env().LIVEKIT_API_KEY, env().LIVEKIT_API_SECRET);
  let event: Awaited<ReturnType<WebhookReceiver['receive']>>;
  try {
    event = await receiver.receive(rawBody, authorization ?? undefined);
  } catch (error) {
    log.warn('live webhook refused', { error });
    throw new AppError('FORBIDDEN', 'Invalid webhook signature');
  }
  // createdAt is in whole seconds (verified against LiveKit 1.13.9, 11 §3.1).
  const at = new Date(Number(event.createdAt) * 1000);
  const roomName = event.room?.name ?? '';
  const participant = event.participant;
  if (!roomName) return { type: 'ignored' };
  if (event.event === 'room_finished') return { type: 'room_finished', roomName, at };
  if (!participant?.identity || !participant.sid) return { type: 'ignored' };
  const { identity: userId, sid } = participant;
  if (event.event === 'participant_joined') return { type: 'joined', roomName, userId, sid, at };
  if (event.event === 'participant_left') {
    const joinedMs = Number(participant.joinedAtMs) || Number(participant.joinedAt) * 1000;
    return { type: 'left', roomName, userId, sid, joinedAt: joinedMs > 0 ? new Date(joinedMs) : at, at };
  }
  return { type: 'ignored' };
}
