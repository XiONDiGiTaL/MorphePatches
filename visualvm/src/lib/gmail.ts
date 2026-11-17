import type { ImportResult, Voicemail } from '../types';
import { analyse, mimeForName } from './audio';
import { parseVoiceEmail } from './voiceEmail';
import { uid } from './util';

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Google Voice sends every notification from this address. */
export const DEFAULT_QUERY = 'from:voice-noreply@google.com';

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleOauth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    }) => void;
    error_callback?: (error: { message?: string }) => void;
  }) => GoogleTokenClient;
};

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOauth2 } };
  }
}

let gisPromise: Promise<void> | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new Error('Could not load Google sign-in. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });

  return gisPromise;
}

/**
 * Access tokens live in memory only for the life of the tab; nothing is written
 * to storage, and no refresh token is ever requested.
 */
export async function getAccessToken(clientId: string): Promise<string> {
  if (!clientId.trim()) throw new Error('Add your Google OAuth client ID first.');
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google sign-in did not initialise. Reload the page and try again.');

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description || response.error || 'Google did not return an access token.',
            ),
          );
          return;
        }
        cachedToken = {
          value: response.access_token,
          expiresAt: Date.now() + (response.expires_in ? response.expires_in * 1000 : 3_000_000),
        };
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(new Error(error?.message || 'Google sign-in was dismissed.'));
      },
    });

    client.requestAccessToken({ prompt: '' });
  });
}

type GmailHeader = { name?: string; value?: string };

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
};

type GmailListResponse = { messages?: { id: string }[] };

async function api<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    cachedToken = null;
    throw new Error('Google session expired. Run the import again to re-authorise.');
  }
  if (!response.ok) throw new Error(`Gmail responded ${response.status}.`);

  return (await response.json()) as T;
}

function decodeBytes(data: string): Uint8Array {
  const normalised = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeText(data: string): string {
  return new TextDecoder().decode(decodeBytes(data));
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, head').forEach((node) => node.remove());
  return (doc.body?.textContent ?? '').replace(/\u00a0/g, ' ');
}

function walk(part: GmailPart | undefined, visit: (part: GmailPart) => void): void {
  if (!part) return;
  visit(part);
  part.parts?.forEach((child) => walk(child, visit));
}

export async function fetchVoicemailEmails(
  token: string,
  query: string,
  max = 40,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<ImportResult> {
  const listing = await api<GmailListResponse>(
    token,
    `messages?maxResults=${Math.min(max, 100)}&q=${encodeURIComponent(query)}`,
  );
  const ids = listing.messages?.map((message) => message.id) ?? [];

  const items: Voicemail[] = [];
  const audio = new Map<string, Blob>();

  for (let index = 0; index < ids.length; index += 1) {
    onProgress(index, ids.length);

    let message: GmailMessage;
    try {
      message = await api<GmailMessage>(token, `messages/${ids[index]}?format=full`);
    } catch {
      continue;
    }

    const header = (name: string): string =>
      message.payload?.headers?.find((entry) => entry.name?.toLowerCase() === name.toLowerCase())
        ?.value ?? '';

    const plain: string[] = [];
    const rich: string[] = [];
    const recordings: GmailPart[] = [];

    walk(message.payload, (part) => {
      const mime = part.mimeType ?? '';
      if (part.filename && mime.startsWith('audio/') && part.body?.attachmentId) recordings.push(part);
      if (mime === 'text/plain' && part.body?.data) plain.push(decodeText(part.body.data));
      else if (mime === 'text/html' && part.body?.data) rich.push(htmlToText(decodeText(part.body.data)));
    });

    const body = plain.length
      ? plain.join('\n')
      : rich.length
        ? rich.join('\n')
        : (message.snippet ?? '');
    const parsed = parseVoiceEmail(header('subject'), body);

    let blob: Blob | undefined;
    const recording = recordings[0];
    if (recording) {
      try {
        const attachment = await api<{ data?: string }>(
          token,
          `messages/${ids[index]}/attachments/${recording.body?.attachmentId}`,
        );
        if (attachment.data) {
          blob = new Blob([decodeBytes(attachment.data).buffer as ArrayBuffer], {
            type: recording.mimeType || mimeForName(recording.filename ?? ''),
          });
        }
      } catch {
        /* a missing attachment should not lose the transcript */
      }
    }

    let peaks: number[] | undefined;
    let durationMs = parsed.durationMs;
    if (blob) {
      try {
        const analysis = await analyse(blob);
        peaks = analysis.peaks;
        if (!durationMs) durationMs = analysis.durationMs;
      } catch {
        /* an undecodable clip still plays through the audio element */
      }
    }

    const id = uid();
    if (blob) audio.set(id, blob);

    items.push({
      id,
      caller: parsed.caller || 'Unknown caller',
      number: parsed.number,
      receivedAt: Number(message.internalDate) || Date.now(),
      durationMs,
      transcript: parsed.transcript,
      transcriptSource: parsed.transcript ? 'google' : null,
      source: 'gmail',
      sourceRef: `gmail:${message.id}`,
      mime: blob?.type || 'audio/mpeg',
      bytes: blob?.size ?? 0,
      read: false,
      starred: false,
      peaks,
      link: parsed.link || undefined,
    });
  }

  onProgress(ids.length, ids.length);
  return { items, audio };
}
