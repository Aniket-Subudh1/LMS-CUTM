import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker, type Job } from 'bullmq';
import ffmpegPath from 'ffmpeg-static';
import { Redis } from 'ioredis';
import { downloadToFile, uploadFromFile } from '@/lib/integrations/storage';
import { log } from '@/lib/log';
import { Lesson } from '@/lib/models/lesson';
import { MediaJob } from '@/lib/schemas/jobs';

// NFR-07, ADR-19: H.264 Main, yuv420p, ~0.7 Mbps cap, moov atom first, so phones on mobile data start quickly.
const ARGS = (input: string, output: string) => [
  ...['-loglevel', 'error', '-y', '-i', input, '-vf', 'scale=-2:480'],
  ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-preset', 'veryfast', '-crf', '28'],
  ...['-maxrate', '700k', '-bufsize', '1400k', '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart'],
  output,
];

function ffmpeg(args: string[]): Promise<void> {
  const binary = ffmpegPath;
  if (!binary) return Promise.reject(new Error('ffmpeg-static has no binary for this platform.'));
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited with ${code}`)),
    );
  });
}

async function transcodeLesson({ lessonId }: MediaJob): Promise<void> {
  const lesson = await Lesson.findById(lessonId, { kind: 1, fileKey: 1 }).lean();
  if (!lesson || lesson.kind !== 'video' || !lesson.fileKey) return;
  // The copy shares the original's prefix, so /api/files authorizes it by the same rule (T8b).
  const lowKey = lesson.fileKey.replace(/\.[a-z\d]+$/i, '-480p.mp4');
  const dir = await mkdtemp(join(tmpdir(), 'lms-transcode-'));
  try {
    const input = join(dir, 'original');
    const output = join(dir, 'low.mp4');
    await downloadToFile(lesson.fileKey, input);
    await ffmpeg(ARGS(input, output));
    await uploadFromFile(lowKey, output, 'video/mp4');
    await Lesson.updateOne({ _id: lessonId }, { $set: { lowKey, transcode: 'ready' } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function startMediaWorker(redisUrl: string): Worker<MediaJob, void, 'transcodeLesson'> {
  const worker = new Worker<MediaJob, void, 'transcodeLesson'>(
    'media',
    (job: Job<MediaJob, void, 'transcodeLesson'>) => transcodeLesson(MediaJob.parse(job.data)),
    // CPU-bound: one transcode at a time per worker instance (02 §8).
    { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }), concurrency: 1 },
  );
  worker.on('failed', (job, error) => {
    log.error('job failed', { queue: 'media', id: job?.id, attemptsMade: job?.attemptsMade, error });
    const payload = MediaJob.safeParse(job?.data);
    // After the last retry the lesson records that it has no data-saver copy; the original still plays.
    if (!job || !payload.success || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    Lesson.updateOne({ _id: payload.data.lessonId }, { $set: { transcode: 'failed' } }).catch((cause: unknown) =>
      log.error('transcode failure not recorded', { lessonId: payload.data.lessonId, error: cause }),
    );
  });
  return worker;
}
