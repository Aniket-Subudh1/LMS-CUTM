import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// 09 §7. Each milestone adds the secret variables it introduces here.
const SECRET_VARS = [
  'SESSION_PASSWORD',
  'SMTP_PASSWORD',
  'MONGODB_URI',
  'REDIS_URL',
  'S3_SECRET_ACCESS_KEY',
  'LIVEKIT_API_SECRET',
];
const FORBIDDEN_NAMES = ['SESSION_PASSWORD', 'S3_SECRET', 'PRIVATE_KEY', 'OPENAI_API_KEY'];

const values = SECRET_VARS.flatMap((name) => {
  const value = process.env[name];
  return value && value.length >= 8 ? [{ name, value }] : [];
});
const entries = await readdir('.next/static', { recursive: true, withFileTypes: true });
const files = entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
if (files.length === 0) {
  console.error('check-bundle: .next/static is empty. Run `npm run build` first.');
  process.exit(1);
}

const findings: string[] = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const name of FORBIDDEN_NAMES) if (text.includes(name)) findings.push(`${file}: contains "${name}"`);
  for (const { name, value } of values)
    if (text.includes(value)) findings.push(`${file}: contains the value of ${name}`);
}
if (findings.length > 0) {
  console.error(`check-bundle: secrets found in the client bundle\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(
  `check-bundle: ${files.length} files scanned for ${FORBIDDEN_NAMES.length} names and ${values.length} secret values; clean`,
);
