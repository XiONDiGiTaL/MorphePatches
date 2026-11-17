export type TranscriptSource = 'google' | 'whisper' | 'relay' | 'manual';

export type Voicemail = {
  id: string;
  caller: string;
  number: string;
  receivedAt: number;
  durationMs: number;
  transcript: string;
  transcriptSource: TranscriptSource | null;
  source: 'takeout' | 'file' | 'relay' | 'gmail';
  /** Stable identity for de-duplicating repeat imports. */
  sourceRef?: string;
  mime: string;
  bytes: number;
  read: boolean;
  starred: boolean;
  peaks?: number[];
  /** Deep link back to the original message when the audio was not included. */
  link?: string;
};

export type RelayConfig = {
  url: string;
  token: string;
};

export type GmailConfig = {
  clientId: string;
  query: string;
};

export type ImportResult = {
  items: Voicemail[];
  audio: Map<string, Blob>;
};
