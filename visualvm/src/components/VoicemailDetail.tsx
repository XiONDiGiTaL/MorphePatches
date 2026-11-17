import { useEffect, useState } from 'react';
import type { Voicemail } from '../types';
import * as db from '../lib/db';
import { decodeForSpeech } from '../lib/audio';
import { transcribe } from '../lib/transcribe';
import { formatBytes, formatClock, formatDuration } from '../lib/util';
import { Icon } from './Icons';
import { Player } from './Player';

type Props = {
  voicemail: Voicemail;
  onBack: () => void;
  onUpdate: (patch: Partial<Voicemail>) => void;
  onDelete: () => void;
};

type Busy = { stage: string; progress: number } | null;
type AudioState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'none' };

const SOURCE_LABEL: Record<string, string> = {
  takeout: 'Google Takeout',
  file: 'Imported file',
  relay: 'Carrier relay',
  gmail: 'Gmail',
};

const TRANSCRIPT_LABEL: Record<string, string> = {
  google: 'Google Voice transcript',
  whisper: 'Whisper · on device',
  relay: 'Carrier transcript',
  manual: 'Edited',
};

const VOICE_URL = 'https://voice.google.com/u/0/voicemail';

export function VoicemailDetail({ voicemail, onBack, onUpdate, onDelete }: Props) {
  const [audio, setAudio] = useState<AudioState>({ status: 'loading' });
  const [draft, setDraft] = useState(voicemail.transcript);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setAudio({ status: 'loading' });

    db.getAudio(voicemail.id)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setAudio({ status: 'none' });
          return;
        }
        created = URL.createObjectURL(blob);
        setAudio({ status: 'ready', url: created });
      })
      .catch(() => {
        if (!cancelled) setAudio({ status: 'none' });
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [voicemail.id]);

  useEffect(() => {
    setDraft(voicemail.transcript);
    setEditing(false);
    setError(null);
    setCopied(false);
  }, [voicemail.id, voicemail.transcript]);

  const hasAudio = audio.status === 'ready';
  const voiceLink = voicemail.link || VOICE_URL;

  async function runTranscription() {
    setError(null);
    setBusy({ stage: 'Preparing audio', progress: 0 });
    try {
      const blob = await db.getAudio(voicemail.id);
      if (!blob) throw new Error('The audio for this voicemail is missing from local storage.');

      const samples = await decodeForSpeech(blob);
      const text = await transcribe(samples, (event) => {
        setBusy({
          stage: event.stage === 'download' ? 'Loading model' : 'Transcribing',
          progress: event.progress,
        });
      });

      if (!text) throw new Error('No speech was detected in this recording.');
      onUpdate({ transcript: text, transcriptSource: 'whisper' });
      setDraft(text);
      setBusy(null);
    } catch (caught) {
      setBusy(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Clipboard access was blocked by the browser.');
    }
  }

  function saveDraft() {
    setEditing(false);
    const next = draft.trim();
    if (next === voicemail.transcript) return;
    onUpdate({
      transcript: next,
      transcriptSource: next ? (voicemail.transcriptSource ?? 'manual') : null,
    });
  }

  function download() {
    if (audio.status !== 'ready') return;
    const link = document.createElement('a');
    link.href = audio.url;
    link.download = `${voicemail.caller.replace(/[^\w+-]+/g, '-') || 'voicemail'}.${
      voicemail.mime.includes('mpeg') ? 'mp3' : 'audio'
    }`;
    link.click();
  }

  const transcriptLabel = voicemail.transcriptSource
    ? TRANSCRIPT_LABEL[voicemail.transcriptSource]
    : 'No transcript';

  return (
    <article className="detail">
      <div className="detail-bar">
        <button type="button" className="icon-btn only-mobile" onClick={onBack} aria-label="Back to inbox">
          <Icon name="arrow-left" />
        </button>
        <span className="micro">{SOURCE_LABEL[voicemail.source] ?? 'Voicemail'}</span>
        <div className="detail-bar-actions">
          <button
            type="button"
            className={`icon-btn${voicemail.starred ? ' is-on' : ''}`}
            onClick={() => onUpdate({ starred: !voicemail.starred })}
            aria-label={voicemail.starred ? 'Remove star' : 'Star voicemail'}
            aria-pressed={voicemail.starred}
          >
            <Icon name="star" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onUpdate({ read: !voicemail.read })}
            aria-label={voicemail.read ? 'Mark as unread' : 'Mark as read'}
          >
            <Icon name="check" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={download}
            disabled={!hasAudio}
            aria-label="Download audio"
          >
            <Icon name="download" />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            onClick={() => {
              if (window.confirm('Delete this voicemail from this device?')) onDelete();
            }}
            aria-label="Delete voicemail"
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <header className="detail-head">
        <h2>{voicemail.caller}</h2>
        <p className="detail-meta">
          {voicemail.number && voicemail.number !== voicemail.caller && (
            <span className="mono">{voicemail.number}</span>
          )}
          <span>{formatClock(voicemail.receivedAt)}</span>
          <span>{voicemail.durationMs ? formatDuration(voicemail.durationMs) : 'length unknown'}</span>
          {voicemail.bytes > 0 && <span>{formatBytes(voicemail.bytes)}</span>}
        </p>
      </header>

      {audio.status === 'ready' ? (
        <Player url={audio.url} peaks={voicemail.peaks} durationMs={voicemail.durationMs} seed={voicemail.id} />
      ) : audio.status === 'none' ? (
        <div className="listen-card">
          <a
            className="play-btn"
            href={voiceLink}
            target="_blank"
            rel="noreferrer"
            aria-label="Listen to this message in Google Voice"
          >
            <Icon name="play" size={22} />
          </a>
          <div className="listen-text">
            <strong>Listen in Google Voice</strong>
            <p className="hint">
              The notification carries the transcript, not the recording, so playback happens where the audio
              lives. Import a Takeout archive to keep the audio here too.
            </p>
          </div>
          <a className="btn" href={voiceLink} target="_blank" rel="noreferrer">
            Open message
          </a>
        </div>
      ) : null}

      <section className="card">
        <div className="card-head">
          <span className="micro">{editing ? 'Editing transcript' : transcriptLabel}</span>
          <div className="card-head-actions">
            <button type="button" className="ghost-btn" onClick={copyTranscript} disabled={!draft.trim()}>
              <Icon name="copy" size={15} />
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => (editing ? saveDraft() : setEditing(true))}
            >
              <Icon name={editing ? 'check' : 'edit'} size={15} />
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>
        </div>

        {editing ? (
          <textarea
            className="transcript"
            value={draft}
            placeholder="Type the message out, or transcribe it on device."
            onChange={(event) => setDraft(event.target.value)}
            onBlur={saveDraft}
            rows={Math.min(16, Math.max(5, Math.ceil(draft.length / 54) + 1))}
            spellCheck
            autoFocus
          />
        ) : (
          <div
            className={`transcript-read${draft.trim() ? '' : ' is-empty'}`}
            role="textbox"
            tabIndex={0}
            aria-readonly="true"
            onClick={() => setEditing(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setEditing(true);
              }
            }}
          >
            {draft.trim() || 'No transcript yet. Tap to write one, or transcribe the recording on this device.'}
          </div>
        )}

        <div className="transcript-foot">
          <button
            type="button"
            className="btn btn-primary"
            onClick={runTranscription}
            disabled={busy !== null || !hasAudio}
          >
            <Icon name="spark" size={16} />
            {busy
              ? `${busy.stage}${busy.progress > 0 ? ` ${Math.round(busy.progress * 100)}%` : '…'}`
              : voicemail.transcript
                ? 'Re-transcribe'
                : 'Transcribe on device'}
          </button>
          <p className="hint">
            {hasAudio
              ? 'Runs locally in a worker. The first run downloads a ~60 MB speech model once, then works offline.'
              : 'Transcription needs the audio file, which this message did not include.'}
          </p>
        </div>

        {busy && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round(busy.progress * 100)}>
            <span style={{ width: `${Math.max(4, busy.progress * 100)}%` }} />
          </div>
        )}

        {error && <p className="banner error">{error}</p>}
      </section>
    </article>
  );
}
