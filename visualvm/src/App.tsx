import { useEffect, useMemo, useState } from 'react';
import type { GmailConfig, ImportResult, RelayConfig, Voicemail } from './types';
import * as db from './lib/db';
import { base64ToBlob, fetchRelay } from './lib/relay';
import { DEFAULT_QUERY, fetchVoicemailEmails, getAccessToken } from './lib/gmail';
import { analyse } from './lib/audio';
import {
  avatarHue,
  formatDuration,
  formatRelative,
  initials,
  uid,
} from './lib/util';
import { Icon } from './components/Icons';
import { VoicemailDetail } from './components/VoicemailDetail';
import { ImportPanel } from './components/ImportPanel';
import { Sources } from './components/Sources';

type Filter = 'all' | 'unread' | 'starred';
type Tab = 'inbox' | 'sources';

const RELAY_KEY = 'xion-vvm.relay';
const GMAIL_KEY = 'xion-vvm.gmail';

function loadRelay(): RelayConfig {
  try {
    const raw = localStorage.getItem(RELAY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RelayConfig>;
      return { url: parsed.url ?? '', token: parsed.token ?? '' };
    }
  } catch {
    /* ignore a corrupt entry */
  }
  return { url: '', token: '' };
}

function loadGmail(): GmailConfig {
  try {
    const raw = localStorage.getItem(GMAIL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GmailConfig>;
      return { clientId: parsed.clientId ?? '', query: parsed.query || DEFAULT_QUERY };
    }
  } catch {
    /* ignore a corrupt entry */
  }
  return { clientId: '', query: DEFAULT_QUERY };
}

export default function App() {
  const [items, setItems] = useState<Voicemail[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('inbox');
  const [importOpen, setImportOpen] = useState(false);
  const [relay, setRelay] = useState<RelayConfig>(loadRelay);
  const [syncing, setSyncing] = useState(false);
  const [gmail, setGmail] = useState<GmailConfig>(loadGmail);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailProgress, setGmailProgress] = useState<string | null>(null);

  useEffect(() => {
    db.listVoicemails()
      .then((rows) => setItems(rows))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RELAY_KEY, JSON.stringify(relay));
    } catch {
      /* storage may be blocked; the relay config simply will not persist */
    }
  }, [relay]);

  useEffect(() => {
    try {
      localStorage.setItem(GMAIL_KEY, JSON.stringify(gmail));
    } catch {
      /* the Gmail config simply will not persist */
    }
  }, [gmail]);

  const visible = useMemo(() => {
    const rows = items ?? [];
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'unread' && row.read) return false;
      if (filter === 'starred' && !row.starred) return false;
      if (!needle) return true;
      return `${row.caller} ${row.number} ${row.transcript}`.toLowerCase().includes(needle);
    });
  }, [items, filter, query]);

  const selected = useMemo(
    () => (items ?? []).find((row) => row.id === selectedId) ?? null,
    [items, selectedId],
  );

  const counts = useMemo(() => {
    const rows = items ?? [];
    return {
      all: rows.length,
      unread: rows.filter((row) => !row.read).length,
      starred: rows.filter((row) => row.starred).length,
    };
  }, [items]);

  const sourceCounts = useMemo(() => {
    const rows = items ?? [];
    return {
      total: rows.length,
      relay: rows.filter((row) => row.source === 'relay').length,
      takeout: rows.filter((row) => row.source === 'takeout').length,
      file: rows.filter((row) => row.source === 'file').length,
      gmail: rows.filter((row) => row.source === 'gmail').length,
    };
  }, [items]);

  async function updateVoicemail(id: string, patch: Partial<Voicemail>) {
    const current = (items ?? []).find((row) => row.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    await db.putVoicemail(next);
    setItems((previous) => (previous ?? []).map((row) => (row.id === id ? next : row)));
  }

  async function removeVoicemail(id: string) {
    await db.deleteVoicemail(id);
    const rows = await db.listVoicemails();
    setItems(rows);
    setSelectedId((current) => (current === id ? (rows[0]?.id ?? null) : current));
  }

  async function reloadInbox() {
    const rows = await db.listVoicemails();
    setItems(rows);
    setSelectedId((current) =>
      current && rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? null),
    );
  }

  function openVoicemail(id: string) {
    setSelectedId(id);
    const row = (items ?? []).find((item) => item.id === id);
    if (row && !row.read) void updateVoicemail(id, { read: true });
  }

  async function handleImported(result: ImportResult) {
    const seen = new Set(
      (items ?? []).map((row) => row.sourceRef).filter((value): value is string => Boolean(value)),
    );

    for (const voicemail of result.items) {
      if (voicemail.sourceRef && seen.has(voicemail.sourceRef)) continue;
      const blob = result.audio.get(voicemail.id);
      if (blob) await db.putAudio(voicemail.id, blob);
      await db.putVoicemail(voicemail);
      if (voicemail.sourceRef) seen.add(voicemail.sourceRef);
    }

    const rows = await db.listVoicemails();
    setItems(rows);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
  }

  async function syncRelay(): Promise<string> {
    setSyncing(true);
    try {
      const messages = await fetchRelay(relay);
      const seen = new Set(
        (items ?? []).map((row) => row.sourceRef).filter((value): value is string => Boolean(value)),
      );
      let added = 0;

      for (const message of messages) {
        if (!message?.audio) continue;
        const ref = `relay:${message.id ?? `${message.number}-${message.receivedAt}`}`;
        if (seen.has(ref)) continue;

        const mime = message.mime || 'audio/wav';
        const blob = base64ToBlob(message.audio, mime);

        let peaks: number[] | undefined;
        let durationMs = Number(message.durationMs) || 0;
        try {
          const analysis = await analyse(blob);
          peaks = analysis.peaks;
          if (!durationMs) durationMs = analysis.durationMs;
        } catch {
          /* an undecodable clip still plays through the audio element */
        }

        const parsed = message.receivedAt ? new Date(message.receivedAt).getTime() : Number.NaN;
        const id = uid();
        const voicemail: Voicemail = {
          id,
          caller: message.from?.trim() || message.number || 'Unknown caller',
          number: message.number ?? '',
          receivedAt: Number.isFinite(parsed) ? parsed : Date.now(),
          durationMs,
          transcript: message.transcript ?? '',
          transcriptSource: message.transcript ? 'relay' : null,
          source: 'relay',
          sourceRef: ref,
          mime,
          bytes: blob.size,
          read: false,
          starred: false,
          peaks,
        };

        await db.putAudio(id, blob);
        await db.putVoicemail(voicemail);
        seen.add(ref);
        added += 1;
      }

      setItems(await db.listVoicemails());
      return `Synced ${messages.length} from the relay · ${added} new`;
    } finally {
      setSyncing(false);
    }
  }

  async function importFromGmail(): Promise<string> {
    setGmailBusy(true);
    setGmailProgress(null);
    try {
      const token = await getAccessToken(gmail.clientId);
      const result = await fetchVoicemailEmails(token, gmail.query, 40, (done, total) => {
        setGmailProgress(total ? `Reading ${done + 1} of ${total}` : 'Searching Gmail…');
      });

      if (!result.items.length) {
        return 'No voicemail emails matched that search.';
      }

      await handleImported(result);
      return `Found ${result.items.length} in Gmail`;
    } finally {
      setGmailBusy(false);
      setGmailProgress(null);
    }
  }

  if (items === null) {
    return (
      <div className="boot">
        <span className="mark-lg">visualvm</span>
        <p className="micro">Opening inbox</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">V</span>
          <div className="brand-text">
            <span className="brand-word">
              visual<em>vm</em>
            </span>
            <span className="brand-tag">visual voicemail · on device</span>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="tabs">
            <button
              type="button"
              className={tab === 'inbox' ? 'is-active' : ''}
              onClick={() => setTab('inbox')}
            >
              Inbox
            </button>
            <button
              type="button"
              className={tab === 'sources' ? 'is-active' : ''}
              onClick={() => setTab('sources')}
            >
              Sources
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
            <Icon name="import" size={16} />
            Import
          </button>
        </div>
      </header>

      {tab === 'inbox' ? (
        <div className={`workspace${selected ? ' has-selection' : ''}`}>
          <aside className="rail">
            <div className="hero">
              <div className="hero-top">
                <span className="micro">Inbox</span>
                <span className="hero-badge">{counts.unread} unread</span>
              </div>
              <div className="hero-figure">
                <strong>{counts.all}</strong>
                <span>voicemail{counts.all === 1 ? '' : 's'} on device</span>
              </div>
              <div className="hero-foot">
                <span className="mono">everything local</span>
                <span className="mono">
                  {(items ?? [])[0] ? formatRelative((items ?? [])[0].receivedAt) : 'empty'}
                </span>
              </div>
            </div>

            <div className="search">
              <Icon name="search" size={16} />
              <input
                type="search"
                placeholder="Search caller or transcript"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search voicemail"
              />
            </div>

            <div className="filters">
              {(
                [
                  ['all', 'All', counts.all],
                  ['unread', 'Unread', counts.unread],
                  ['starred', 'Starred', counts.starred],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  className={`pill${filter === key ? ' is-active' : ''}`}
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>

            <div className="list">
              {visible.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`row${row.id === selectedId ? ' is-active' : ''}${row.read ? '' : ' is-unread'}`}
                  onClick={() => openVoicemail(row.id)}
                >
                  <span
                    className="avatar"
                    style={{
                      background: `hsl(${avatarHue(row.caller + row.number)} 60% 16%)`,
                      color: `hsl(${avatarHue(row.caller + row.number)} 92% 76%)`,
                    }}
                    aria-hidden="true"
                  >
                    {initials(row.caller)}
                  </span>
                  <span className="row-main">
                    <span className="row-top">
                      <span className="row-name">{row.caller}</span>
                      <span className="row-time">{formatRelative(row.receivedAt)}</span>
                    </span>
                    <span className="row-sub">
                      {row.transcript
                        ? row.transcript
                        : row.number
                          ? row.number
                          : 'No transcript yet'}
                    </span>
                    <span className="row-foot">
                      <span className="mono">{formatDuration(row.durationMs)}</span>
                      {row.starred && <Icon name="star" size={13} />}
                      {!row.read && <span className="dot" aria-label="Unread" />}
                    </span>
                  </span>
                </button>
              ))}

              {!visible.length && (
                <p className="list-empty">
                  {(items ?? []).length ? 'Nothing matches that search.' : 'No voicemail yet.'}
                </p>
              )}
            </div>
          </aside>

          <section className="pane">
            {selected ? (
              <VoicemailDetail
                key={selected.id}
                voicemail={selected}
                onBack={() => setSelectedId(null)}
                onUpdate={(patch) => void updateVoicemail(selected.id, patch)}
                onDelete={() => void removeVoicemail(selected.id)}
              />
            ) : (
              <div className="empty">
                <span className="empty-mark">
                  <Icon name="inbox" size={30} />
                </span>
                <span className="micro">Inbox</span>
                <h2>
                  Your voicemail, <em>transcribed.</em>
                </h2>
                <p>
                  Import a Google Voice export, sync a carrier mailbox through the relay, or drop in audio
                  files. Everything is transcribed on this device. Nothing gets uploaded.
                </p>
                <div className="empty-actions">
                  <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
                    <Icon name="import" size={16} />
                    Import voicemail
                  </button>
                  <button type="button" className="btn" onClick={() => setTab('sources')}>
                    <Icon name="sources" size={16} />
                    Connect a number
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <Sources
          relay={relay}
          onRelayChange={setRelay}
          onSync={syncRelay}
          syncing={syncing}
          gmail={gmail}
          onGmailChange={setGmail}
          onGmailImport={importFromGmail}
          gmailBusy={gmailBusy}
          gmailProgress={gmailProgress}
          onImport={() => setImportOpen(true)}
          onRestored={reloadInbox}
          counts={sourceCounts}
        />
      )}

      {importOpen && (
        <ImportPanel onClose={() => setImportOpen(false)} onImported={handleImported} />
      )}
    </div>
  );
}
