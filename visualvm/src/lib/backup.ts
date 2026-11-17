import { strFromU8, strToU8, unzip, zip } from 'fflate';
import type { TranscriptSource, Voicemail } from '../types';
import { getAudio, listVoicemails, putAudio, putVoicemail } from './db';

const FORMAT = 'visualvm.inbox';
const VERSION = 1;
const MANIFEST = 'inbox.json';
const AUDIO_DIR = 'audio/';

const SOURCES = ['takeout', 'file', 'relay', 'gmail'] as const;
const TRANSCRIPT_SOURCES: TranscriptSource[] = ['google', 'whisper', 'relay', 'manual'];

type Progress = (label: string, progress: number) => void;

type BackupFile = {
  app: string;
  version: number;
  exportedAt: number;
  items: Voicemail[];
};

export type ExportSummary = {
  voicemails: number;
  withAudio: number;
  bytes: number;
  name: string;
};

export type RestoreSummary = {
  added: number;
  skipped: number;
  audio: number;
};

const EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/amr': 'amr',
  'audio/3gpp': '3gp',
};

function extensionFor(mime: string): string {
  return EXTENSIONS[(mime || '').toLowerCase()] ?? 'bin';
}

function stamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Saves a blob through an anchor click, which works in a tab and in an installed window. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportInbox(onProgress: Progress = () => {}): Promise<{
  blob: Blob;
  summary: ExportSummary;
}> {
  const rows = await listVoicemails();
  if (!rows.length) throw new Error('There is nothing to export yet.');

  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  let withAudio = 0;

  for (const [index, row] of rows.entries()) {
    const audio = await getAudio(row.id);
    if (audio) {
      // Audio is already compressed, so storing it keeps the export fast.
      files[`${AUDIO_DIR}${row.id}.${extensionFor(row.mime)}`] = [
        new Uint8Array(await audio.arrayBuffer()),
        { level: 0 },
      ];
      withAudio += 1;
    }
    onProgress(
      audio ? `Packing ${row.caller || 'voicemail'}` : `Writing ${row.caller || 'voicemail'} without audio`,
      (index + 1) / (rows.length + 1),
    );
  }

  const manifest: BackupFile = {
    app: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    items: rows,
  };
  files[MANIFEST] = [strToU8(JSON.stringify(manifest)), { level: 6 }];

  onProgress('Compressing', 0.95);
  // fflate widens the buffer to ArrayBufferLike; a freshly built archive is always
  // backed by a plain ArrayBuffer, which is what Blob accepts.
  const zipped = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) =>
      error ? reject(error) : resolve(data as Uint8Array<ArrayBuffer>),
    );
  });

  const name = `visualvm-inbox-${stamp()}.zip`;
  const blob = new Blob([zipped], { type: 'application/zip' });
  return { blob, summary: { voicemails: rows.length, withAudio, bytes: blob.size, name } };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Keeps a restored row to the shape the app knows, so a hand edited file cannot poison the store. */
function normalise(input: unknown): Voicemail | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Partial<Voicemail>;
  if (typeof row.id !== 'string' || !row.id) return null;

  const source = SOURCES.includes(row.source as (typeof SOURCES)[number])
    ? (row.source as Voicemail['source'])
    : 'file';
  const transcriptSource = TRANSCRIPT_SOURCES.includes(row.transcriptSource as TranscriptSource)
    ? (row.transcriptSource as TranscriptSource)
    : null;

  const peaks = Array.isArray(row.peaks)
    ? row.peaks.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : undefined;

  return {
    id: row.id,
    caller: asString(row.caller, 'Unknown caller'),
    number: asString(row.number),
    receivedAt: asNumber(row.receivedAt, Date.now()),
    durationMs: asNumber(row.durationMs),
    transcript: asString(row.transcript),
    transcriptSource,
    source,
    sourceRef: typeof row.sourceRef === 'string' ? row.sourceRef : undefined,
    mime: asString(row.mime, 'application/octet-stream'),
    bytes: asNumber(row.bytes),
    read: row.read === true,
    starred: row.starred === true,
    peaks: peaks && peaks.length ? peaks : undefined,
    link: typeof row.link === 'string' ? row.link : undefined,
  };
}

export async function restoreInbox(file: File, onProgress: Progress = () => {}): Promise<RestoreSummary> {
  onProgress('Reading backup', 0.05);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(
      bytes,
      { filter: (entry) => entry.name === MANIFEST || entry.name.startsWith(AUDIO_DIR) },
      (error, out) => (error ? reject(new Error('That file is not a readable zip archive.')) : resolve(out)),
    );
  });

  const manifest = entries[MANIFEST];
  if (!manifest) throw new Error('That archive is not a visualvm backup: inbox.json is missing.');

  let parsed: BackupFile;
  try {
    parsed = JSON.parse(strFromU8(manifest)) as BackupFile;
  } catch {
    throw new Error('The inbox.json in that backup could not be read.');
  }
  if (parsed?.app !== FORMAT || !Array.isArray(parsed.items)) {
    throw new Error('That backup was not written by visualvm.');
  }
  if (asNumber(parsed.version, VERSION) > VERSION) {
    throw new Error('That backup comes from a newer version of visualvm.');
  }

  const audioById = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith(AUDIO_DIR)) continue;
    const base = name.slice(AUDIO_DIR.length);
    const dot = base.lastIndexOf('.');
    audioById.set(dot > 0 ? base.slice(0, dot) : base, data);
  }

  const present = new Set((await listVoicemails()).map((row) => row.id));
  let added = 0;
  let skipped = 0;
  let audio = 0;

  for (const [index, entry] of parsed.items.entries()) {
    const row = normalise(entry);
    if (!row) {
      skipped += 1;
      continue;
    }
    if (present.has(row.id)) {
      skipped += 1;
      continue;
    }

    const media = audioById.get(row.id);
    if (media) {
      const copy = new Uint8Array(media.length);
      copy.set(media);
      await putAudio(row.id, new Blob([copy], { type: row.mime }));
      audio += 1;
    }
    await putVoicemail(row);
    present.add(row.id);
    added += 1;
    onProgress(`Restoring ${row.caller || 'voicemail'}`, 0.1 + ((index + 1) / parsed.items.length) * 0.85);
  }

  return { added, skipped, audio };
}
