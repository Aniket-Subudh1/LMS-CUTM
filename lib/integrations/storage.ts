import 'server-only';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { log } from '@/lib/log';

let client: S3Client | undefined;

function s3(): S3Client {
  client ??= new S3Client({
    region: env().S3_REGION,
    endpoint: env().S3_ENDPOINT,
    forcePathStyle: env().S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env().S3_ACCESS_KEY_ID,
      secretAccessKey: env().S3_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

function integrationFailure(operation: string, fields: Record<string, unknown>, error: unknown): never {
  log.error('storage request failed', { operation, ...fields, error });
  throw new AppError('INTEGRATION', 'Object storage is unavailable. Try again in a minute.');
}

function sanitizeInlineName(fileName: string): string {
  return fileName.replace(/["\\\r\n]/g, '');
}

export async function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  try {
    return await getSignedUrl(
      s3(),
      new PutObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      }),
      { expiresIn: 300, signableHeaders: new Set(['content-type']) },
    );
  } catch (error) {
    integrationFailure('presignUpload', { key, contentType, size }, error);
  }
}

export async function presignDownload(key: string, fileName: string): Promise<string> {
  try {
    return await getSignedUrl(
      s3(),
      new GetObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        ResponseContentDisposition: `inline; filename="${sanitizeInlineName(fileName)}"`,
      }),
      { expiresIn: 600 },
    );
  } catch (error) {
    integrationFailure('presignDownload', { key }, error);
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    for (let index = 0; index < keys.length; index += 1000) {
      const chunk = keys.slice(index, index + 1000);
      await s3().send(
        new DeleteObjectsCommand({
          Bucket: env().S3_BUCKET,
          Delete: { Objects: chunk.map((Key) => ({ Key })) },
        }),
      );
    }
  } catch (error) {
    integrationFailure('deleteObjects', { count: keys.length }, error);
  }
}

// Worker only (transcode). Both stream through the disk: a lecture original can be 2 GB.
export async function downloadToFile(key: string, path: string): Promise<void> {
  try {
    const { Body } = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
    // Under Node the SDK returns the HTTP response stream (a Readable).
    if (!(Body instanceof Readable)) throw new Error('The object body is not a Node stream.');
    await pipeline(Body, createWriteStream(path));
  } catch (error) {
    integrationFailure('downloadToFile', { key, path }, error);
  }
}

export async function uploadFromFile(key: string, path: string, contentType: string): Promise<void> {
  try {
    const { size } = await stat(path);
    await s3().send(
      new PutObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    integrationFailure('uploadFromFile', { key, path, contentType }, error);
  }
}
