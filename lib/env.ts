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
  COURSEWARE_URL: z.url().default('https://courseware.cutm.ac.in'),
  // 11 §2: the browser connects to LIVEKIT_URL (ws/wss); the server calls the room service at LIVEKIT_API_URL.
  LIVEKIT_URL: z.url(),
  LIVEKIT_API_URL: z.url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(32),
  // M04b (TP-09, 06 §4.4): a Judge0 CE server. Until the university runs its own (11 §2), Judge0's free public server,
  // which needs no token; students' code is sent to it (Q-55).
  CODE_RUNNER_URL: z.url().default('https://ce.judge0.com'),
  CODE_RUNNER_TOKEN: z.string().min(1).optional(),
  // M04b (TP-10, 06 §4.7): OpenAI's key and model. Without the key the AI helpers say they are not set up; nothing else
  // needs it. The default model is a small, inexpensive one.
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-5.4-mini'),
  // M07 (06 §4.5): the GitHub App behind CSE projects. All optional: without them a GitHub project says GitHub is not set
  // up. The private key may be pasted with "\n" for its line breaks.
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_SLUG: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

let parsed: z.infer<typeof Env> | undefined;

export function env(): z.infer<typeof Env> {
  parsed ??= Env.parse(process.env);
  return parsed;
}
