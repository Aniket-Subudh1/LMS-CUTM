import 'server-only';
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_PASSWORD: z.string().min(32),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(3),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

let parsed: z.infer<typeof Env> | undefined;

export function env(): z.infer<typeof Env> {
  parsed ??= Env.parse(process.env);
  return parsed;
}
