import type { Voicemail } from '../types';

// Deliberately still the app's former name: renaming it would orphan every
// voicemail already stored in a user's browser.
const DB_NAME = 'xion-vvm';
const DB_VERSION = 1;
const META = 'meta';
const MEDIA = 'media';

let handle: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (handle) return handle;
  handle = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage'));
  });
  return handle;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = operation(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error('Local storage request failed'));
      }),
  );
}

export async function listVoicemails(): Promise<Voicemail[]> {
  const rows = await run<Voicemail[]>(META, 'readonly', (store) => store.getAll());
  return rows.sort((a, b) => b.receivedAt - a.receivedAt);
}

export function putVoicemail(voicemail: Voicemail): Promise<unknown> {
  return run(META, 'readwrite', (store) => store.put(voicemail));
}

export async function deleteVoicemail(id: string): Promise<void> {
  await run(META, 'readwrite', (store) => store.delete(id));
  await run(MEDIA, 'readwrite', (store) => store.delete(id));
}

export function putAudio(id: string, blob: Blob): Promise<unknown> {
  return run(MEDIA, 'readwrite', (store) => store.put(blob, id));
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  return run<Blob | undefined>(MEDIA, 'readonly', (store) => store.get(id));
}
