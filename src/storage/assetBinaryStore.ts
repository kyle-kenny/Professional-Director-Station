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

function ensureIndexedDb() {
  if (typeof indexedDB === 'undefined') throw new Error('当前运行环境不支持 IndexedDB，无法持久化本地资产二进制。');
}

function openDb(): Promise<IDBDatabase> {
  ensureIndexedDb();
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

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

export function assetBinaryKey(assetId: string, version: string): string {
  return `${assetId}@${version}`;
}

export async function putAssetBinary(assetId: string, version: string, file: File, bytes?: ArrayBuffer): Promise<string> {
  const db = await openDb();
  try {
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
    const done = transactionDone(tx);
    await requestAsPromise(tx.objectStore(STORE_NAME).put(record));
    await done;
    return key;
  } finally {
    db.close();
  }
}

export async function getAssetBinary(assetId: string, version: string): Promise<StoredAssetBinary | undefined> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(tx);
    const result = await requestAsPromise(tx.objectStore(STORE_NAME).get(assetBinaryKey(assetId, version))) as StoredAssetBinary | undefined;
    await done;
    return result;
  } finally {
    db.close();
  }
}

export async function hasAssetBinary(assetId: string, version: string): Promise<boolean> {
  return Boolean(await getAssetBinary(assetId, version));
}

export async function deleteAssetBinary(assetId: string, version: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(tx);
    await requestAsPromise(tx.objectStore(STORE_NAME).delete(assetBinaryKey(assetId, version)));
    await done;
  } finally {
    db.close();
  }
}
