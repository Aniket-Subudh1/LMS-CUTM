import 'server-only';
import {
  AccessToken,
  DataPacket_Kind,
  RoomServiceClient,
  ServerError,
  TrackSource,
  WebhookReceiver,
} from 'livekit-server-sdk';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { log } from '@/lib/log';

// 06 §4.3. The live engine is self-hosted LiveKit (ADR-18); only this file talks to it from the server.
export type LiveRole = 'host' | 'participant';
// M03c T2: what a student may do in the room; hosts may always do everything.
export type StudentRights = { share: boolean; unmute: boolean; chat: boolean };
// Someone in the room: whether they host, and the microphone tracks they have on.
export type RoomPerson = { identity: string; host: boolean; microphones: string[] };
// Messages from the server to the browsers in the room: `notice` is shown to the people it is sent to; `controls`
// tells hosts that the host controls changed.
export type RoomTopic = 'notice' | 'controls';

// `sid` names one connection of a participant: a reconnect or a second tab is a new sid, so presence is matched by it.
export type LiveEvent =
  | { type: 'joined'; roomName: string; userId: string; sid: string; host: boolean; at: Date }
  | { type: 'left'; roomName: string; userId: string; sid: string; joinedAt: Date; at: Date }
  | { type: 'room_finished'; roomName: string; at: Date }
  | { type: 'ignored' };

let rooms: RoomServiceClient | undefined;
let receiver: WebhookReceiver | undefined;

const roomService = () =>
  (rooms ??= new RoomServiceClient(env().LIVEKIT_API_URL, env().LIVEKIT_API_KEY, env().LIVEKIT_API_SECRET));

// A room nobody is in, or someone who has left, does not exist for the engine: there is nothing to change, and the
// request returns `absent`.
async function request<T>(operation: string, roomName: string, run: () => Promise<T>, absent: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ServerError && (error.status === 404 || error.code === 'not_found')) return absent;
    log.error('live request failed', { operation, roomName, error });
    throw new AppError('INTEGRATION', 'The live-class service did not answer. Try again in a moment.');
  }
}

// M03c T2: the camera always; the microphone, the screen and data messages (chat, reactions) as the host allows. The
// permission is replaced as a whole, so every field is set.
const permission = (rights: StudentRights) => ({
  canSubscribe: true,
  canPublish: true,
  canPublishData: rights.chat,
  canPublishSources: [
    TrackSource.CAMERA,
    ...(rights.unmute ? [TrackSource.MICROPHONE] : []),
    ...(rights.share ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : []),
  ],
  canUpdateMetadata: false,
});

// M03c: tokens are short-lived (LiveKit renews them for everyone connected), so one a removed person kept stops
// working soon.
export const JOIN_TTL_SEC = 10 * 60;

export async function joinToken(input: {
  roomName: string;
  userId: string;
  name: string;
  role: LiveRole;
  rights: StudentRights;
}): Promise<{ serverUrl: string; token: string }> {
  const token = new AccessToken(env().LIVEKIT_API_KEY, env().LIVEKIT_API_SECRET, {
    identity: input.userId,
    name: input.name,
    ttl: JOIN_TTL_SEC,
    // M03b: every browser in the room tells the hosts apart by this attribute. The token grants no
    // `canUpdateOwnMetadata`, so a participant cannot change their own name, role or hand.
    attributes: { role: input.role },
  });
  const rights = input.role === 'host' ? undefined : permission(input.rights);
  // M03c: no `roomAdmin`: hosts mute, remove and lock through the LMS, which checks and records it.
  token.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: rights?.canPublishData ?? true,
    ...(rights && { canPublishSources: rights.canPublishSources }),
  });
  return { serverUrl: env().LIVEKIT_URL, token: await token.toJwt() };
}

export async function closeRoom(roomName: string): Promise<void> {
  await request('closeRoom', roomName, () => roomService().deleteRoom(roomName), undefined);
}

// M03b: a raised hand is the participant attribute `hand`, the time it was raised in ms; "" lowers it. The server
// sets it, and every browser in the room sees the change, those who join later too.
export async function setHand(roomName: string, identity: string, raisedAt: Date | null): Promise<void> {
  const attributes = { hand: raisedAt ? String(raisedAt.getTime()) : '' };
  await request('setHand', roomName, () => roomService().updateParticipant(roomName, identity, { attributes }), null);
}

export async function roomPeople(roomName: string): Promise<RoomPerson[]> {
  const people = await request('roomPeople', roomName, () => roomService().listParticipants(roomName), []);
  return people.map((p) => ({
    identity: p.identity,
    host: p.attributes.role === 'host',
    microphones: p.tracks.filter((t) => t.source === TrackSource.MICROPHONE && !t.muted).map((t) => t.sid),
  }));
}

// M03c T2: as in Google Meet, a host can turn someone's microphone off but not on. False when it was already off.
export async function muteMicrophone(roomName: string, identity: string, trackSids?: string[]): Promise<boolean> {
  const sids =
    trackSids ??
    (await request('muteMicrophone', roomName, () => roomService().getParticipant(roomName, identity), null))?.tracks
      .filter((t) => t.source === TrackSource.MICROPHONE && !t.muted)
      .map((t) => t.sid) ??
    [];
  await Promise.all(
    sids.map((sid) =>
      request('muteMicrophone', roomName, () => roomService().mutePublishedTrack(roomName, identity, sid, true), null),
    ),
  );
  return sids.length > 0;
}

// A track whose source is no longer allowed is unpublished by the engine.
export async function setRights(roomName: string, identity: string, rights: StudentRights): Promise<void> {
  const update = { permission: permission(rights) };
  await request('setRights', roomName, () => roomService().updateParticipant(roomName, identity, update), null);
}

// Disconnects them now. On a self-hosted engine this does not stop their token, so the LMS keeps them out itself.
export async function removeFromRoom(roomName: string, identity: string): Promise<void> {
  await request('removeFromRoom', roomName, () => roomService().removeParticipant(roomName, identity), undefined);
}

// Plain text, to everyone in the room or to the identities given. Browsers trust only messages from the server.
export async function tell(roomName: string, topic: RoomTopic, text: string, identities?: string[]): Promise<void> {
  const data = new TextEncoder().encode(text);
  const options = { topic, ...(identities && { destinationIdentities: identities }) };
  await request(
    'tell',
    roomName,
    () => roomService().sendData(roomName, data, DataPacket_Kind.RELIABLE, options),
    null,
  );
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
  if (event.event === 'participant_joined') {
    return { type: 'joined', roomName, userId, sid, host: participant.attributes.role === 'host', at };
  }
  if (event.event === 'participant_left') {
    const joinedMs = Number(participant.joinedAtMs) || Number(participant.joinedAt) * 1000;
    return { type: 'left', roomName, userId, sid, joinedAt: joinedMs > 0 ? new Date(joinedMs) : at, at };
  }
  return { type: 'ignored' };
}
