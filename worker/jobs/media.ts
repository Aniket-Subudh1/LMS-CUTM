import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker, type Job } from 'bullmq';
import ffmpegPath from 'ffmpeg-static';
import { Redis } from 'ioredis';
import { derivedKey, frameAtSec } from '@/lib/domain/uploads';
import { deleteObjects, downloadToFile, uploadFromFile } from '@/lib/integrations/storage';
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

// The thumbnail: one frame, 640 px wide, a tenth into the video (M03b).
const FRAME_ARGS = (input: string, output: string, atSec: number) => [
  ...['-loglevel', 'error', '-y', '-ss', String(atSec), '-i', input],
  ...['-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', output],
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

// Every write names the file the job was made for. If the teacher replaced the video meanwhile, nothing is written
// and what this job uploaded is deleted, so the new video keeps its own frame and copy.
async function keep(lessonId: string, fileKey: string, fields: Record<string, string>, uploaded: string) {
  const { matchedCount } = await Lesson.updateOne({ _id: lessonId, fileKey }, { $set: fields });
  if (matchedCount === 0) await deleteObjects([uploaded]);
  return matchedCount > 0;
}

async function transcodeLesson({ lessonId, fileKey }: MediaJob): Promise<void> {
  const lesson = await Lesson.findOne({ _id: lessonId, fileKey }, { kind: 1, durationSec: 1 }).lean();
  if (!lesson || lesson.kind !== 'video') return;
  // Both share the original's prefix, so /api/files authorizes them by the same rule (T8b).
  const frameKey = derivedKey(fileKey, '-frame.jpg');
  const lowKey = derivedKey(fileKey, '-480p.mp4');
  const dir = await mkdtemp(join(tmpdir(), 'lms-transcode-'));
  try {
    const input = join(dir, 'original');
    const frame = join(dir, 'frame.jpg');
    const output = join(dir, 'low.mp4');
    await downloadToFile(fileKey, input);
    await ffmpeg(FRAME_ARGS(input, frame, frameAtSec(lesson.durationSec ?? 0)));
    await uploadFromFile(frameKey, frame, 'image/jpeg');
    if (!(await keep(lessonId, fileKey, { frameKey }, frameKey))) return;
    await ffmpeg(ARGS(input, output));
    await uploadFromFile(lowKey, output, 'video/mp4');
    await keep(lessonId, fileKey, { lowKey, transcode: 'ready' }, lowKey);
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
    const { lessonId, fileKey } = payload.data;
    Lesson.updateOne({ _id: lessonId, fileKey }, { $set: { transcode: 'failed' } }).catch((cause: unknown) =>
      log.error('transcode failure not recorded', { lessonId, error: cause }),
    );
  });
  return worker;
}
