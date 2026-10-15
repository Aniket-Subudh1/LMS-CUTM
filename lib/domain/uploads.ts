import { uploadPurpose, type UploadPurpose } from '@/lib/schemas/uploads';

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/heic': 'heic',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

// <purpose>/<contextId>/<userId>/<file> (02 §4.3); the file part never contains a slash.
const KEY = /^([a-z-]+)\/([a-f\d]{24})\/([a-f\d]{24})\/[\w-]+\.[a-z\d]+$/i;

// The extension comes from the content type, never from the person's file name (06 §5).
export function extFor(contentType: string): string {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new Error(`Unsupported content type: ${contentType}`);
  return ext;
}

export function buildKey(
  purpose: UploadPurpose,
  contextId: string,
  userId: string,
  uuid: string,
  contentType: string,
): string {
  return `${purpose}/${contextId}/${userId}/${uuid}.${extFor(contentType)}`;
}

export function parseKey(key: string): { purpose: UploadPurpose; contextId: string; userId: string } | null {
  const match = KEY.exec(key);
  const purpose = uploadPurpose.safeParse(match?.[1]);
  if (!match || !purpose.success) return null;
  return { purpose: purpose.data, contextId: match[2], userId: match[3] };
}

// Strips path separators, reserved and control characters, collapses spaces and keeps at most 120 characters,
// shortening the name in front of its extension.
export function sanitizeFileName(name: string): string {
  const cleaned =
    name
      .replace(/\s+/g, ' ')
      .replace(/[\p{Cc}/\\:*?"<>|]/gu, '')
      .trim()
      .replace(/^\.+/, '') || 'file';
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  const base = ext ? cleaned.slice(0, dot) : cleaned;
  return base.slice(0, 120 - ext.length) + ext;
}
