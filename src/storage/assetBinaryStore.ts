const DB_NAME = 'pds-assets-v1';
const DB_VERSION = 1;
const STORE_NAME = 'binaries';

export type StoredAssetBinary = {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  importedAt: string;
  bytes: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function assetBinaryKey(assetId: string, version: string): string {
  return `${assetId}@${version}`;
}

export async function putAssetBinary(assetId: string, version: string, file: File, bytes?: ArrayBuffer): Promise<string> {
  const db = await openDb();
  const key = assetBinaryKey(assetId, version);
  const record: StoredAssetBinary = {
    key,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    importedAt: new Date().toISOString(),
    bytes: bytes ?? await file.arrayBuffer(),
  };
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await requestAsPromise(tx.objectStore(STORE_NAME).put(record));
  db.close();
  return key;
}

export async function getAssetBinary(assetId: string, version: string): Promise<StoredAssetBinary | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const result = await requestAsPromise(tx.objectStore(STORE_NAME).get(assetBinaryKey(assetId, version))) as StoredAssetBinary | undefined;
  db.close();
  return result;
}

export async function deleteAssetBinary(assetId: string, version: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await requestAsPromise(tx.objectStore(STORE_NAME).delete(assetBinaryKey(assetId, version)));
  db.close();
}
