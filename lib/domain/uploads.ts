import { uploadPurpose, type UploadPurpose } from '@/lib/schemas/uploads';

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/heic': 'heic',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
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

// The worker's files sit beside the original under its prefix, so /api/files authorizes them by its rule (06 §6).
export function derivedKey(fileKey: string, suffix: '-480p.mp4' | '-frame.jpg'): string {
  return fileKey.replace(/\.[a-z\d]+$/i, suffix);
}

// The upload's own id: the last part of its key without the extension. One media job per file (06 §6).
export function fileUuid(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1).replace(/\.[a-z\d]+$/i, '');
}

// Where the thumbnail frame is taken: a tenth into the video, at least 1 s in, never past its last second.
export function frameAtSec(durationSec: number): number {
  return Math.min(Math.max(1, Math.round(durationSec / 10)), Math.max(0, durationSec - 1));
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
