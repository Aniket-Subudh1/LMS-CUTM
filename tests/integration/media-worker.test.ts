import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import ffmpegPath from 'ffmpeg-static';
import { Redis } from 'ioredis';
import { newId } from '../factories';

const objects = new Map<string, Buffer>();
const deleted: string[] = [];

vi.mock('@/lib/integrations/storage', () => ({
  downloadToFile: async (key: string, path: string) => {
    const file = objects.get(key);
    if (!file) throw new Error(`Missing object ${key}`);
    await writeFile(path, file);
  },
  uploadFromFile: async (key: string, path: string) => {
    objects.set(key, await readFile(path));
  },
  deleteObjects: async (keys: string[]) => {
    deleted.push(...keys);
  },
}));

type Loaded = {
  mediaQueue: typeof import('@/lib/queue').mediaQueue;
  redis: typeof import('@/lib/queue').redis;
  Lesson: typeof import('@/lib/models/lesson').Lesson;
};

let worker: ReturnType<typeof import('@/worker/jobs/media').startMediaWorker>;
let events: QueueEvents;
let m: Loaded;

async function exec(args: string[]): Promise<{ code: number | null; stderr: string }> {
  const binary = ffmpegPath;
  if (!binary) throw new Error('ffmpeg-static is unavailable');
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

async function generateFixture(): Promise<Buffer> {
  const workdir = await mkdtemp(join(tmpdir(), 'cutm-lms-fixture-'));
  const path = join(workdir, 'fixture.mp4');
  try {
    const result = await exec([
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=640x360:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:sample_rate=44100',
      '-t',
      '3',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      path,
    ]);
    if (result.code !== 0) throw new Error(result.stderr);
    return await readFile(path);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

async function decodeVideo(buffer: Buffer): Promise<string> {
  const workdir = await mkdtemp(join(tmpdir(), 'cutm-lms-verify-'));
  const path = join(workdir, 'video.mp4');
  try {
    await writeFile(path, buffer);
    const playable = await exec(['-v', 'error', '-i', path, '-f', 'null', '-']);
    expect(playable.code).toBe(0);
    const details = await exec(['-hide_banner', '-i', path]);
    return details.stderr;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

beforeAll(async () => {
  const { env } = await import('@/lib/env');
  const { db } = await import('@/lib/db');
  const { startMediaWorker } = await import('@/worker/jobs/media');
  m = { ...(await import('@/lib/queue')), ...(await import('@/lib/models/lesson')) };
  await db();
  await m.Lesson.createCollection();
  worker = startMediaWorker(env().REDIS_URL);
  events = new QueueEvents('media', { connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }) });
  await events.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([worker.close(), events.close(), m.mediaQueue().close()]);
  await m.redis().quit();
});

describe('media worker', () => {
  it('takes a JPEG frame, creates a playable 480p copy and marks the lesson ready', async () => {
    const key = `lesson-video/${newId()}/${newId()}/fixture.mp4`;
    objects.set(key, await generateFixture());
    const lesson = await m.Lesson.create({
      offeringId: newId(),
      moduleId: newId(),
      order: 1,
      kind: 'video',
      title: 'Lecture',
      published: true,
      fileKey: key,
      fileName: 'fixture.mp4',
      contentType: 'video/mp4',
      size: objects.get(key)?.byteLength ?? 1,
      durationSec: 3,
      transcode: 'pending',
    });

    const job = await m.mediaQueue().add('transcodeLesson', { lessonId: String(lesson._id), fileKey: key });
    await job.waitUntilFinished(events);

    const saved = await m.Lesson.findById(lesson._id).lean();
    expect(saved?.transcode).toBe('ready');
    expect(saved?.lowKey).toBe(key.replace(/\.mp4$/, '-480p.mp4'));
    expect(saved?.frameKey).toBe(key.replace(/\.mp4$/, '-frame.jpg'));
    const frame = saved?.frameKey ? objects.get(saved.frameKey) : undefined;
    // A JPEG starts with FF D8.
    expect(frame?.subarray(0, 2).toString('hex')).toBe('ffd8');
    const low = saved?.lowKey ? objects.get(saved.lowKey) : undefined;
    if (!low) throw new Error('No data-saver copy was uploaded.');
    const details = await decodeVideo(low);
    expect(details).toMatch(/x480[,\s]/);
    expect(details).toMatch(/h264 \(Main\)/);
  });

  it('marks the lesson failed after a corrupt input and leaves the original object intact', async () => {
    const key = `lesson-video/${newId()}/${newId()}/corrupt.mp4`;
    objects.set(key, Buffer.from('not a real mp4'));
    const lesson = await m.Lesson.create({
      offeringId: newId(),
      moduleId: newId(),
      order: 1,
      kind: 'video',
      title: 'Broken lecture',
      published: true,
      fileKey: key,
      fileName: 'corrupt.mp4',
      contentType: 'video/mp4',
      size: objects.get(key)?.byteLength ?? 1,
      durationSec: 3,
      transcode: 'pending',
    });

    const job = await m
      .mediaQueue()
      .add(
        'transcodeLesson',
        { lessonId: String(lesson._id), fileKey: key },
        { attempts: 1, jobId: `corrupt-${lesson._id}` },
      );
    await expect(job.waitUntilFinished(events)).rejects.toThrow();
    await vi.waitFor(async () => {
      expect((await m.Lesson.findById(lesson._id).lean())?.transcode).toBe('failed');
    });
    expect(objects.get(key)?.byteLength).toBeGreaterThan(0);
    expect((await m.Lesson.findById(lesson._id).lean())?.lowKey ?? null).toBeNull();
  });

  it('leaves a lesson alone when its video was replaced before the job ran, and a failure marks only that file', async () => {
    const old = `lesson-video/${newId()}/${newId()}/old.mp4`;
    const current = `lesson-video/${newId()}/${newId()}/current.mp4`;
    objects.set(old, Buffer.from('not a real mp4'));
    const lesson = await m.Lesson.create({
      offeringId: newId(),
      moduleId: newId(),
      order: 1,
      kind: 'video',
      title: 'Replaced lecture',
      published: false,
      fileKey: current,
      fileName: 'current.mp4',
      contentType: 'video/mp4',
      size: 1,
      durationSec: 3,
      transcode: 'pending',
    });
    const job = await m
      .mediaQueue()
      .add(
        'transcodeLesson',
        { lessonId: String(lesson._id), fileKey: old },
        { attempts: 1, jobId: `stale-${lesson._id}` },
      );
    await job.waitUntilFinished(events);
    const saved = await m.Lesson.findById(lesson._id).lean();
    expect(saved?.transcode).toBe('pending');
    expect(saved?.frameKey ?? null).toBeNull();
    expect(saved?.lowKey ?? null).toBeNull();
  });
});
