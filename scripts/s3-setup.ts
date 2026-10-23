import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';
import { log } from '@/lib/log';

function client(): S3Client {
  return new S3Client({
    region: env().S3_REGION,
    endpoint: env().S3_ENDPOINT,
    forcePathStyle: env().S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env().S3_ACCESS_KEY_ID,
      secretAccessKey: env().S3_SECRET_ACCESS_KEY,
    },
  });
}

function bucketMissing(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'NotFound' || error.name === 'NoSuchBucket';
}

const s3 = client();
const { APP_URL, S3_BUCKET } = env();

try {
  await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  log.info('storage bucket exists', { bucket: S3_BUCKET });
} catch (error) {
  if (!bucketMissing(error)) throw error;
  await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
  log.info('storage bucket created', { bucket: S3_BUCKET });
}

await s3.send(
  new PutBucketCorsCommand({
    Bucket: S3_BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [APP_URL],
          AllowedMethods: ['GET', 'PUT', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3000,
        },
      ],
    },
  }),
);
log.info('storage cors updated', { bucket: S3_BUCKET, origin: APP_URL });
