import { unzip, strFromU8 } from 'fflate';
import type { ImportResult, Voicemail } from '../types';
import { analyse, mimeForName } from './audio';
import { uid } from './util';

const AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg|oga|amr|3gp)$/i;
const HTML_RE = /\.html?$/i;

type Progress = (label: string, progress: number) => void;

function baseName(path: string): string {
  return path.replace(AUDIO_RE, '').replace(HTML_RE, '');
}

function parseStamp(base: string): number {
  const name = base.split('/').pop() ?? base;

  const dashed = name.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})[-:](\d{2})[-:](\d{2})/);
  if (dashed) {
    return Date.UTC(+dashed[1], +dashed[2] - 1, +dashed[3], +dashed[4], +dashed[5], +dashed[6]);
  }

  const compact = name.match(/^(\d{4})(\d{2})(\d{2})[T_-]?(\d{2})(\d{2})(\d{2})/);
  if (compact) {
    return Date.UTC(+compact[1], +compact[2] - 1, +compact[3], +compact[4], +compact[5], +compact[6]);
  }

  const dateOnly = name.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return Date.UTC(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]);

  return Number.NaN;
}

type HtmlMeta = {
  transcript: string;
  caller: string;
  number: string;
  receivedAt: number;
};

function parseHtml(html: string): HtmlMeta {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const first = (selectors: string[]): string => {
    for (const selector of selectors) {
      const value = doc.querySelector(selector)?.textContent?.trim();
      if (value) return value;
    }
    return '';
  };

  const transcript = first([
    'span.full-text',
    '.full-text',
    '[data-transcript]',
    '.transcript',
    '.message-text',
    '#transcript',
  ]);

  const caller = first(['.contributor', '.participant', '.caller', '.name', 'h1']);

  const bodyText = doc.body?.textContent ?? '';
  const numberMatch = bodyText.match(/\+?\d[\d\s().-]{6,}\d/);

  const stamp =
    doc.querySelector('time[datetime]')?.getAttribute('datetime') ??
    doc.querySelector('[datetime]')?.getAttribute('datetime') ??
    '';
  const parsed = stamp ? Date.parse(stamp) : Number.NaN;

  return {
    transcript,
    caller,
    number: numberMatch ? numberMatch[0].trim() : '',
    receivedAt: Number.isFinite(parsed) ? parsed : Number.NaN,
  };
}

async function build(
  audio: { name: string; blob: Blob }[],
  html: Map<string, string>,
): Promise<ImportResult> {
  const items: Voicemail[] = [];
  const blobs = new Map<string, Blob>();

  for (const entry of audio) {
    const base = baseName(entry.name);
    const meta = html.has(base) ? parseHtml(html.get(base) ?? '') : null;

    let durationMs = 0;
    let peaks: number[] | undefined;
    try {
      const analysis = await analyse(entry.blob);
      durationMs = analysis.durationMs;
      peaks = analysis.peaks;
    } catch {
      // A codec the browser cannot decode still plays; it just has no waveform.
    }

    const stamp = parseStamp(base);
    const receivedAt =
      [meta?.receivedAt, stamp].find((value) => Number.isFinite(value)) ?? Date.now();

    const nameFromFile = (base.split('/').pop() ?? '').replace(/^[\dTZ:_.-]+/, '').trim();
    const numberMatch = nameFromFile.match(/\+?\d{7,15}/);
    const number = meta?.number || (numberMatch ? numberMatch[0] : '');
    const rawCaller = meta?.caller ?? '';
    const caller =
      rawCaller && !/^google voice$/i.test(rawCaller) ? rawCaller : number || 'Unknown caller';

    const id = uid();
    items.push({
      id,
      caller,
      number,
      receivedAt,
      durationMs,
      transcript: meta?.transcript ?? '',
      transcriptSource: meta?.transcript ? 'google' : null,
      source: 'takeout',
      sourceRef: `takeout:${entry.name}`,
      mime: entry.blob.type || mimeForName(entry.name),
      bytes: entry.blob.size,
      read: false,
      starred: false,
      peaks,
    });
    blobs.set(id, entry.blob);
  }

  items.sort((a, b) => b.receivedAt - a.receivedAt);
  return { items, audio: blobs };
}

export async function importTakeoutZip(
  file: File,
  onProgress: Progress = () => {},
): Promise<ImportResult> {
  onProgress('Reading archive', 0.02);
  const bytes = new Uint8Array(await file.arrayBuffer());

  onProgress('Unpacking archive', 0.1);
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, { filter: (entry) => AUDIO_RE.test(entry.name) || HTML_RE.test(entry.name) }, (error, out) => {
      if (error) reject(error);
      else resolve(out);
    });
  });

  const names = Object.keys(entries);
  const audioNames = names.filter((name) => AUDIO_RE.test(name));

  if (!audioNames.length) {
    throw new Error('No voicemail audio found in that archive. In Takeout, choose Voice and download as .zip.');
  }

  const html = new Map<string, string>();
  for (const name of names) {
    if (!HTML_RE.test(name)) continue;
    html.set(baseName(name), strFromU8(entries[name]));
  }

  const audio: { name: string; blob: Blob }[] = [];
  audioNames.forEach((name, index) => {
    const data = entries[name];
    const copy = new Uint8Array(data.length);
    copy.set(data);
    audio.push({
      name,
      blob: new Blob([copy], { type: mimeForName(name) }),
    });
    onProgress(name.split('/').pop() ?? name, 0.25 + (index / audioNames.length) * 0.6);
  });

  onProgress('Indexing voicemail', 0.9);
  return build(audio, html);
}

export async function importFiles(
  files: File[],
  onProgress: Progress = () => {},
): Promise<ImportResult> {
  const html = new Map<string, string>();
  const audio: { name: string; blob: Blob }[] = [];

  for (const file of files) {
    if (HTML_RE.test(file.name)) {
      html.set(baseName(file.name), await file.text());
    } else if (AUDIO_RE.test(file.name) || file.type.startsWith('audio/')) {
      audio.push({ name: file.name, blob: file });
    }
  }

  if (!audio.length) {
    throw new Error('Those files contained no audio the app could read.');
  }

  audio.forEach((entry, index) => {
    onProgress(entry.name, (index / audio.length) * 0.85);
  });

  return build(audio, html);
}
