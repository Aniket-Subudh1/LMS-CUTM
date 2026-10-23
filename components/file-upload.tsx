'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ArrowClockwiseIcon, CheckCircleIcon, CloudArrowUpIcon, FileIcon, XIcon } from '@phosphor-icons/react';
import { createUpload } from '@/app/(app)/actions';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/cn';
import { formatBytes, formatDuration } from '@/lib/format';
import { UPLOAD_PURPOSES, type UploadedFile, type UploadPurpose } from '@/lib/schemas/uploads';

type Row = {
  id: string;
  // Null for a file saved earlier (`initial`), which has nothing left to upload.
  file: File | null;
  name: string;
  size: number;
  progress: number;
  state: 'uploading' | 'done' | 'failed';
  error?: string;
  value?: UploadedFile;
  // A picture's preview (an object URL of the resized JPEG).
  preview?: string;
};

// M03b: a thumbnail or cover is cropped to the purpose's frame in the browser and sent as a JPEG of about 100 KB,
// so a phone photo of several megabytes never travels and every picture has the same shape.
async function toJpeg(file: File, width: number, height: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const [w, h] = [width / scale, height / scale];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext('2d')
    ?.drawImage(bitmap, (bitmap.width - w) / 2, (bitmap.height - h) / 2, w, h, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('This picture could not be read. Try a JPEG or PNG.');
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'picture'}.jpg`, { type: 'image/jpeg' });
}

// T2: a video's length is read in the browser from its metadata before the upload starts.
function videoDuration(file: File): Promise<number | undefined> {
  if (!file.type.startsWith('video/')) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const done = (seconds?: number) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? Math.round(video.duration) : undefined);
    video.onerror = () => done(undefined);
    video.src = url;
  });
}

// The bytes go straight to object storage with a presigned PUT (S6); XMLHttpRequest reports upload progress.
function put(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
  xhrs: Map<string, XMLHttpRequest>,
  id: string,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrs.set(id, xhr);
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) =>
      event.lengthComputable && onProgress(Math.round((100 * event.loaded) / event.total));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('The upload was refused. Try again.')));
    xhr.onerror = () => reject(new Error('The connection dropped during the upload. Try again.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(file);
  }).finally(() => xhrs.delete(id));
}

export function FileUpload({
  name,
  purpose,
  contextId,
  multiple = false,
  required = false,
  max,
  initial = [],
  onChange,
}: {
  name: string;
  purpose: UploadPurpose;
  contextId: string;
  multiple?: boolean;
  required?: boolean;
  // How many files this box may still add (a lesson's notes).
  max?: number;
  // M04: files saved before (an answer being resumed), shown as uploaded.
  initial?: UploadedFile[];
  // M04: the uploaded files whenever one finishes or is removed, for a parent that saves as the person goes.
  onChange?: (files: UploadedFile[]) => void;
}) {
  const rule = UPLOAD_PURPOSES[purpose];
  const frame = 'image' in rule ? rule.image : undefined;
  const input = useRef<HTMLInputElement>(null);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((value) => ({
      id: value.key,
      file: null,
      name: value.fileName,
      size: value.size,
      progress: 100,
      state: 'done',
      value,
    })),
  );
  const update = (id: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const done = rows.flatMap((row) => (row.value ? [row.value] : []));
  const doneKeys = done.map((file) => file.key).join('|');
  const reported = useRef(doneKeys);
  const report = useEffectEvent(() => onChange?.(done));
  useEffect(() => {
    if (doneKeys === reported.current) return;
    reported.current = doneKeys;
    report();
  }, [doneKeys]);

  // The form cannot be submitted while a file is still uploading, or (when required) before one has finished.
  const uploading = rows.some((row) => row.state === 'uploading');
  const finished = rows.some((row) => row.state === 'done');
  useEffect(() => {
    input.current?.setCustomValidity(
      uploading ? 'Wait for the upload to finish.' : required && !finished ? 'Upload the file first.' : '',
    );
  }, [uploading, finished, required]);

  async function start(original: Row) {
    if (!original.file) return;
    let file = original.file;
    const { id } = original;
    update(id, { state: 'uploading', progress: 0, error: undefined });
    try {
      if (frame) {
        file = await toJpeg(file, frame.width, frame.height);
        update(id, { file, name: file.name, size: file.size, preview: URL.createObjectURL(file) });
      }
      const durationSec = await videoDuration(file);
      if (file.type.startsWith('video/') && !durationSec) {
        throw new Error('This video could not be read. Export it again as MP4 and upload that file.');
      }
      const ticket = await createUpload({
        purpose,
        contextId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      if (!ticket.ok) throw new Error(ticket.message);
      await put(ticket.data.url, file, (progress) => update(id, { progress }), xhrs.current, id);
      const { name: fileName, type: contentType, size } = file;
      update(id, {
        state: 'done',
        progress: 100,
        value: { key: ticket.data.key, fileName, contentType, size, durationSec },
      });
    } catch (error) {
      update(id, {
        state: 'failed',
        error: error instanceof Error ? error.message : 'The upload failed. Try again.',
      });
    }
  }

  function choose(files: FileList) {
    const room = max === undefined ? files.length : Math.max(0, max - rows.length);
    const added = Array.from(files)
      .slice(0, room)
      .map((file): Row => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        state: 'uploading',
      }));
    if (!multiple) for (const xhr of xhrs.current.values()) xhr.abort();
    setRows((current) => (multiple ? [...current, ...added] : added));
    for (const row of added) void start(row);
  }

  function remove(id: string) {
    xhrs.current.get(id)?.abort();
    setRows((current) => current.filter((row) => row.id !== id));
  }

  const showPicker = (multiple || rows.length === 0) && (max === undefined || rows.length < max);
  return (
    <div className="grid gap-3">
      <div
        className={cn(
          'border-input hover:border-primary/50 hover:bg-primary/3 focus-within:border-primary focus-within:ring-ring/30 relative flex items-center gap-4 rounded-md border border-dashed px-4 py-4 transition-colors focus-within:ring-[3px]',
          !showPicker && 'sr-only',
        )}
      >
        <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
          <CloudArrowUpIcon weight="duotone" className="size-5" />
        </span>
        <span className="grid gap-0.5 text-sm">
          <span className="font-medium">
            <span className="text-primary">Choose a file</span> or drop it here
          </span>
          <span className="text-muted-foreground text-xs">
            {rule.accepts}, up to {formatBytes(rule.maxBytes)}
          </span>
        </span>
        <input
          ref={input}
          type="file"
          accept={rule.contentTypes.join(',')}
          multiple={multiple}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => {
            if (event.target.files?.length) choose(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {rows.map((row) => (
        <div key={row.id} className="ring-border grid gap-2.5 rounded-md p-3.5 ring-1">
          <div className="flex items-start gap-3">
            {row.preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- an object URL of the picture being uploaded
              <img src={row.preview} alt="" className="aspect-video w-24 shrink-0 rounded-lg object-cover" />
            ) : (
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  row.state === 'done' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                )}
              >
                {row.state === 'done' ? (
                  <CheckCircleIcon weight="fill" className="size-5" />
                ) : (
                  <FileIcon className="size-5" />
                )}
              </span>
            )}
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className="truncate text-sm font-medium">{row.name}</p>
              <p className="text-muted-foreground text-xs">
                {formatBytes(row.size)}
                {row.value?.durationSec ? ` · ${formatDuration(row.value.durationSec)}` : ''}
                {row.state === 'uploading' && ` · Uploading ${row.progress}%`}
                {row.state === 'done' && ' · Uploaded'}
              </p>
            </div>
            {row.state === 'failed' && (
              <Button type="button" variant="outline" size="sm" onClick={() => void start(row)}>
                <ArrowClockwiseIcon />
                Retry
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={row.state === 'uploading' ? `Cancel uploading ${row.name}` : `Remove ${row.name}`}
              onClick={() => remove(row.id)}
            >
              <XIcon />
            </Button>
          </div>
          {row.state === 'uploading' && <Progress value={row.progress} className="bg-muted h-1.5" />}
          {row.error && (
            <p role="alert" className="text-destructive text-sm">
              {row.error}
            </p>
          )}
          {row.value && <input type="hidden" name={`${name}[]`} value={JSON.stringify(row.value)} />}
        </div>
      ))}
    </div>
  );
}
