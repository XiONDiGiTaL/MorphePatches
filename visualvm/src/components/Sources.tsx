import { useState } from 'react';
import type { GmailConfig, RelayConfig } from '../types';
import { Icon } from './Icons';

type Counts = {
  total: number;
  relay: number;
  takeout: number;
  file: number;
  gmail: number;
};

type Props = {
  relay: RelayConfig;
  onRelayChange: (next: RelayConfig) => void;
  onSync: () => Promise<string>;
  syncing: boolean;
  gmail: GmailConfig;
  onGmailChange: (next: GmailConfig) => void;
  onGmailImport: () => Promise<string>;
  gmailBusy: boolean;
  gmailProgress: string | null;
  onImport: () => void;
  counts: Counts;
};

export function Sources({
  relay,
  onRelayChange,
  onSync,
  syncing,
  gmail,
  onGmailChange,
  onGmailImport,
  gmailBusy,
  gmailProgress,
  onImport,
  counts,
}: Props) {
  const [relayStatus, setRelayStatus] = useState<string | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<string | null>(null);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  async function sync() {
    setRelayError(null);
    setRelayStatus(null);
    try {
      setRelayStatus(await onSync());
    } catch (caught) {
      setRelayError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function importGmail() {
    setGmailError(null);
    setGmailStatus(null);
    try {
      setGmailStatus(await onGmailImport());
    } catch (caught) {
      setGmailError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="sources">
      <header className="sources-head">
        <span className="micro">Sources</span>
        <h2>Where your voicemail comes from</h2>
        <p className="lede">
          This inbox lives on your device. There is no account of ours, no server of ours, and no upload:
          audio and transcripts sit in your browser's local storage.
        </p>
      </header>

      <div className="source-grid">
        <section className="card source-card">
          <div className="source-top">
            <span className="source-icon">
              <Icon name="mail" size={20} />
            </span>
            <div>
              <h3>Gmail</h3>
              <p className="hint">{counts.gmail} pulled from email</p>
            </div>
          </div>
          <p>
            Turn on <em>Get voicemail via email</em> in Google Voice settings, then pull the notifications
            straight out of Gmail. Transcript, caller, date and length come with them, no Takeout export,
            and it only fetches new ones after the first run.
          </p>

          <label className="field">
            <span>Google OAuth client ID</span>
            <input
              type="text"
              inputMode="url"
              spellCheck={false}
              placeholder="1234567890-abc123.apps.googleusercontent.com"
              value={gmail.clientId}
              onChange={(event) => onGmailChange({ ...gmail, clientId: event.target.value })}
            />
          </label>

          <label className="field">
            <span>Gmail search</span>
            <input
              type="text"
              spellCheck={false}
              value={gmail.query}
              onChange={(event) => onGmailChange({ ...gmail, query: event.target.value })}
            />
          </label>

          <button type="button" className="btn btn-primary" onClick={importGmail} disabled={gmailBusy}>
            <Icon name={gmailBusy ? 'sync' : 'import'} size={16} />
            {gmailBusy ? gmailProgress || 'Reading Gmail…' : 'Import from Gmail'}
          </button>

          <button type="button" className="ghost-btn" onClick={() => setShowSetup((value) => !value)}>
            {showSetup ? 'Hide setup' : 'How do I get a client ID?'}
          </button>

          {showSetup && (
            <ol className="steps">
              <li>
                Google Cloud Console → new project → <em>APIs &amp; Services</em> → enable <strong>Gmail API</strong>.
              </li>
              <li>
                <em>OAuth consent screen</em> → External → add yourself under <strong>Test users</strong>.
              </li>
              <li>
                <em>Credentials</em> → Create OAuth client ID → <strong>Web application</strong>.
              </li>
              <li>
                Under <strong>Authorised JavaScript origins</strong> add this page's origin exactly, e.g.{' '}
                <span className="mono">{typeof window !== 'undefined' ? window.location.origin : ''}</span>.
              </li>
              <li>Paste the client ID above. The consent screen shows a read-only Gmail scope.</li>
            </ol>
          )}

          {gmailStatus && <p className="banner ok">{gmailStatus}</p>}
          {gmailError && <p className="banner error">{gmailError}</p>}
          {gmailBusy && <p className="hint">Approve the Google prompt in a proper browser tab. Popups are blocked inside app frames.</p>}
        </section>

        <section className="card source-card">
          <div className="source-top">
            <span className="source-icon">
              <Icon name="download" size={20} />
            </span>
            <div>
              <h3>Google Voice Takeout</h3>
              <p className="hint">{counts.takeout} imported from Takeout</p>
            </div>
          </div>
          <p>
            The archive route, and the only one that brings the actual recordings. Export Voice from Takeout
            once and import the zip. Audio, caller, date and Google's transcript all come along.
          </p>
          <ol className="steps">
            <li>
              Open <span className="mono">takeout.google.com</span>, deselect all, tick <em>Voice</em>.
            </li>
            <li>Export once as <span className="mono">.zip</span> and download it.</li>
            <li>Import the archive here.</li>
          </ol>
          <button type="button" className="btn" onClick={onImport}>
            <Icon name="import" size={16} />
            Import Takeout zip
          </button>
        </section>

        <section className="card source-card">
          <div className="source-top">
            <span className="source-icon">
              <Icon name="phone" size={20} />
            </span>
            <div>
              <h3>Your carrier number</h3>
              <p className="hint">{counts.relay} synced from relay</p>
            </div>
          </div>
          <p>
            Carriers deliver visual voicemail (VVM) to an IMAP mailbox, and a browser cannot speak IMAP. Run
            the small relay from <span className="mono">visualvm/relay</span> on any always-on machine, point
            it at that mailbox, then paste its address below.
          </p>

          <label className="field">
            <span>Relay URL</span>
            <input
              type="url"
              inputMode="url"
              placeholder="http://192.168.1.20:8787"
              value={relay.url}
              onChange={(event) => onRelayChange({ ...relay, url: event.target.value })}
            />
          </label>

          <label className="field">
            <span>Token</span>
            <input
              type="password"
              placeholder="VVM_TOKEN from the relay"
              value={relay.token}
              onChange={(event) => onRelayChange({ ...relay, token: event.target.value })}
            />
          </label>

          <button type="button" className="btn" onClick={sync} disabled={syncing || !relay.url.trim()}>
            <Icon name="sync" size={16} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>

          {relayStatus && <p className="banner ok">{relayStatus}</p>}
          {relayError && <p className="banner error">{relayError}</p>}
        </section>

        <section className="card source-card">
          <div className="source-top">
            <span className="source-icon">
              <Icon name="wave" size={20} />
            </span>
            <div>
              <h3>Files</h3>
              <p className="hint">{counts.file} added by hand</p>
            </div>
          </div>
          <p>
            Anything the phone can play: a forwarded voicemail, an MMS audio clip, a recording shared from
            another app. Drop it in and transcribe it on device.
          </p>
          <button type="button" className="btn" onClick={onImport}>
            <Icon name="import" size={16} />
            Add files
          </button>
        </section>
      </div>

      <div className="sources-foot">
        <span className="micro">{counts.total} voicemails on this device</span>
        <p className="hint">
          Clearing site data removes this inbox. Use download on a message to keep a copy elsewhere.
        </p>
      </div>
    </div>
  );
}
