import { createHash } from 'node:crypto';
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import { describe, expect, it, vi } from 'vitest';

const KEY = 'unit-live-key';
const SECRET = 'unit-live-secret-at-least-32-characters';
vi.mock('@/lib/env', () => ({
  env: () => ({
    LIVEKIT_URL: 'wss://live.test',
    LIVEKIT_API_URL: 'https://live.test',
    LIVEKIT_API_KEY: KEY,
    LIVEKIT_API_SECRET: SECRET,
    LOG_LEVEL: 'error',
  }),
}));

const { joinToken, parseWebhook } = await import('./live');

// The engine signs a webhook with a JWT whose sha256 claim is the body's digest (11 §3.1).
async function signed(event: Record<string, unknown>, secret = SECRET) {
  const body = JSON.stringify(event);
  const token = new AccessToken(KEY, secret);
  token.sha256 = createHash('sha256').update(body).digest('base64');
  return { body, authorization: await token.toJwt() };
}

const participant = {
  sid: 'PA_one',
  identity: '665f1c2b9a1e4b0012345678',
  joinedAt: '1760592600',
  joinedAtMs: '1760592600250',
};

describe('parseWebhook', () => {
  it('maps a join to the user, the connection and the time in seconds', async () => {
    const { body, authorization } = await signed({
      event: 'participant_joined',
      room: { name: 'ls-abc' },
      participant,
      createdAt: '1760592601',
    });
    expect(await parseWebhook(body, authorization)).toEqual({
      type: 'joined',
      roomName: 'ls-abc',
      userId: participant.identity,
      sid: 'PA_one',
      at: new Date(1760592601_000),
    });
  });

  it('gives a leave the time that connection joined', async () => {
    const { body, authorization } = await signed({
      event: 'participant_left',
      room: { name: 'ls-abc' },
      participant,
      createdAt: '1760596200',
    });
    expect(await parseWebhook(body, authorization)).toMatchObject({
      type: 'left',
      sid: 'PA_one',
      joinedAt: new Date(1760592600_250),
      at: new Date(1760596200_000),
    });
  });

  it('maps the room closing and ignores other events', async () => {
    const finished = await signed({ event: 'room_finished', room: { name: 'ls-abc' }, createdAt: '1760596300' });
    expect(await parseWebhook(finished.body, finished.authorization)).toEqual({
      type: 'room_finished',
      roomName: 'ls-abc',
      at: new Date(1760596300_000),
    });
    const track = await signed({ event: 'track_published', room: { name: 'ls-abc' }, participant, createdAt: '1' });
    expect(await parseWebhook(track.body, track.authorization)).toEqual({ type: 'ignored' });
  });

  it('refuses a body that was changed, a wrong key and a missing signature', async () => {
    const { body, authorization } = await signed({ event: 'room_finished', room: { name: 'ls-abc' }, createdAt: '1' });
    await expect(parseWebhook(body.replace('ls-abc', 'ls-xyz'), authorization)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const forged = await signed({ event: 'room_finished', room: { name: 'ls-abc' }, createdAt: '1' }, 'x'.repeat(40));
    await expect(parseWebhook(forged.body, forged.authorization)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(parseWebhook(body, null)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('joinToken', () => {
  it('grants the room, and room admin to the host only', async () => {
    const verifier = new TokenVerifier(KEY, SECRET);
    const input = { roomName: 'ls-abc', userId: participant.identity, name: 'Asha Rao', ttlSec: 600 };
    const host = await joinToken({ ...input, role: 'host' });
    const student = await joinToken({ ...input, role: 'participant' });
    expect(host.serverUrl).toBe('wss://live.test');
    const hostClaims = await verifier.verify(host.token);
    const studentClaims = await verifier.verify(student.token);
    expect(hostClaims).toMatchObject({ sub: participant.identity, name: 'Asha Rao' });
    expect(hostClaims.video).toMatchObject({ roomJoin: true, room: 'ls-abc', canPublish: true, roomAdmin: true });
    expect(studentClaims.video).toMatchObject({ roomJoin: true, room: 'ls-abc', roomAdmin: false });
    expect(Number(studentClaims.exp) - Number(studentClaims.nbf)).toBe(600);
  });
});
