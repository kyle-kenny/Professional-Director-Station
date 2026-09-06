const DB_NAME = 'pds-media-v1';
const DB_VERSION = 1;
const STORE_NAME = 'audio';

export type StoredAudioMedia = {
  clipId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  importedAt: string;
  duration: number;
  sampleRate: number;
  channels: number;
  waveform: number[];
  bytes: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'clipId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function putAudioMedia(record: StoredAudioMedia): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function getAudioMedia(clipId: string): Promise<StoredAudioMedia | undefined> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    return await requestAsPromise(tx.objectStore(STORE_NAME).get(clipId)) as StoredAudioMedia | undefined;
  } finally {
    db.close();
  }
}

export async function deleteAudioMedia(clipId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(clipId);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function hasAudioMedia(clipId: string): Promise<boolean> {
  return Boolean(await getAudioMedia(clipId));
}
