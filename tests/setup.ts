import { afterAll, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Redis } from 'ioredis';
import './next-request';

let memory: MongoMemoryReplSet | undefined;

beforeAll(async () => {
  if (process.env.TEST_MONGODB_URI) {
    const url = new URL(process.env.TEST_MONGODB_URI);
    url.pathname = `/lms_test_${process.pid}`;
    process.env.MONGODB_URI = url.toString();
  } else {
    memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = memory.getUri('lms_test');
  }
  Object.assign(process.env, {
    APP_URL: 'http://localhost:3000',
    REDIS_URL: 'redis://localhost:6379/1',
    SESSION_PASSWORD: 'test-session-password-at-least-32-chars',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'cutm-lms-test',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_FORCE_PATH_STYLE: 'true',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    MAIL_FROM: 'CUTM LMS <lms@test.local>',
    COURSEWARE_URL: 'http://courseware.test',
    LOG_LEVEL: 'error',
  });
  // Redis database 1 belongs to the tests: start every file without rate-limit counters or queued jobs.
  const redis = new Redis(process.env.REDIS_URL ?? '');
  await redis.flushdb();
  await redis.quit();
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await memory?.stop();
});
