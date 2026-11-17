import { useRef, useState } from 'react';
import type { ImportResult } from '../types';
import { importFiles, importTakeoutZip } from '../lib/takeout';
import { Icon } from './Icons';

type Props = {
  onClose: () => void;
  onImported: (result: ImportResult) => Promise<void>;
};

export function ImportPanel({ onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handle(files: File[]) {
    if (!files.length || busy) return;
    setError(null);
    setBusy(true);
    setProgress(0);
    setLabel('Starting');

    try {
      const archive = files.find((file) => /\.zip$/i.test(file.name));
      const onProgress = (nextLabel: string, nextProgress: number) => {
        setLabel(nextLabel);
        setProgress(nextProgress);
      };

      const result = archive
        ? await importTakeoutZip(archive, onProgress)
        : await importFiles(files, onProgress);

      setLabel('Saving to this device');
      setProgress(0.95);
      await onImported(result);

      setProgress(1);
      setLabel(`Added ${result.items.length} voicemail${result.items.length === 1 ? '' : 's'}`);
      window.setTimeout(onClose, 650);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setLabel(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import voicemail">
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="micro">Import</span>
            <h3>Bring your voicemail in</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handle(Array.from(event.dataTransfer.files));
          }}
          onClick={() => !busy && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
          }}
        >
          <Icon name="import" size={26} />
          <strong>{busy ? 'Working…' : 'Drop audio files or a Takeout .zip'}</strong>
          <span className="hint">
            MP3, M4A, WAV, OGG, AMR, plus the matching .html files if you have them. Nothing is uploaded.
          </span>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".mp3,.m4a,.aac,.wav,.ogg,.oga,.amr,.3gp,.zip,.html,audio/*"
          onChange={(event) => {
            void handle(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />

        {label && (
          <div className="import-status">
            <p>{label}</p>
            <div className="progress">
              <span style={{ width: `${Math.max(3, progress * 100)}%` }} />
            </div>
          </div>
        )}

        {error && <p className="banner error">{error}</p>}

        <p className="hint modal-note">
          Google Takeout: <span className="mono">takeout.google.com</span> → deselect all → Voice → export .zip,
          then drop the whole archive here.
        </p>
      </div>
    </div>
  );
}
