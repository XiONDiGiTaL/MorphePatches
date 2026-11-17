import type { RelayConfig } from '../types';

export type RelayMessage = {
  id: string;
  from?: string;
  number?: string;
  receivedAt?: number | string;
  durationMs?: number;
  transcript?: string;
  mime?: string;
  audio: string;
};

export async function fetchRelay(config: RelayConfig): Promise<RelayMessage[]> {
  const base = config.url.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Add your relay URL first.');

  let response: Response;
  try {
    response = await fetch(`${base}/vvm`, {
      headers: config.token ? { authorization: `Bearer ${config.token}` } : {},
    });
  } catch {
    throw new Error(
      'Could not reach the relay. Check that it is running and that its CORS origin allows this page.',
    );
  }

  if (response.status === 401) throw new Error('Relay rejected the token.');
  if (!response.ok) throw new Error(`Relay responded ${response.status}.`);

  const payload: unknown = await response.json();
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { messages?: unknown })?.messages)
      ? ((payload as { messages: unknown[] }).messages)
      : [];

  return list as RelayMessage[];
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'audio/wav' });
}
