export type StoredObject = { uri: string; bytes: Uint8Array; contentType?: string; updatedAt: string };

export interface StorageProvider {
  readonly scheme: string;
  put(uri: string, bytes: Uint8Array, contentType?: string): Promise<void>;
  get(uri: string): Promise<StoredObject | undefined>;
  has(uri: string): Promise<boolean>;
  delete(uri: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export class MemoryStorageProvider implements StorageProvider {
  readonly scheme = 'memory';
  private objects = new Map<string, StoredObject>();
  async put(uri: string, bytes: Uint8Array, contentType?: string) { this.objects.set(uri, { uri, bytes: Uint8Array.from(bytes), contentType, updatedAt: new Date().toISOString() }); }
  async get(uri: string) { const value = this.objects.get(uri); return value ? { ...value, bytes: Uint8Array.from(value.bytes) } : undefined; }
  async has(uri: string) { return this.objects.has(uri); }
  async delete(uri: string) { this.objects.delete(uri); }
  async list(prefix: string) { return [...this.objects.keys()].filter((uri) => uri.startsWith(prefix)).sort(); }
}

const DB = 'pds-pipeline-storage-v1';
const STORE = 'objects';

type IndexedRecord = { uri: string; bytes: ArrayBuffer; contentType?: string; updatedAt: string };

export class IndexedDbStorageProvider implements StorageProvider {
  readonly scheme = 'pds';
  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'uri' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open pipeline storage.'));
    });
  }
  async put(uri: string, bytes: Uint8Array, contentType?: string) {
    const db = await this.open();
    await txComplete(db, 'readwrite', (store) => store.put({ uri, bytes: bytes.slice().buffer, contentType, updatedAt: new Date().toISOString() } satisfies IndexedRecord));
    db.close();
  }
  async get(uri: string): Promise<StoredObject | undefined> {
    const db = await this.open();
    const value = await requestValue<IndexedRecord | undefined>(db, 'readonly', (store) => store.get(uri)); db.close();
    return value ? { uri: value.uri, bytes: new Uint8Array(value.bytes), contentType: value.contentType, updatedAt: value.updatedAt } : undefined;
  }
  async has(uri: string) { return Boolean(await this.get(uri)); }
  async delete(uri: string) { const db = await this.open(); await txComplete(db, 'readwrite', (store) => store.delete(uri)); db.close(); }
  async list(prefix: string) {
    const db = await this.open();
    const keys = await requestValue<IDBValidKey[]>(db, 'readonly', (store) => store.getAllKeys()); db.close();
    return keys.map(String).filter((uri) => uri.startsWith(prefix)).sort();
  }
}

function txComplete(db: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => { const tx = db.transaction(STORE, mode); action(tx.objectStore(STORE)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error('Storage transaction failed.')); tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted.')); });
}
function requestValue<T>(db: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { const tx = db.transaction(STORE, mode); const request = action(tx.objectStore(STORE)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('Storage request failed.')); });
}
