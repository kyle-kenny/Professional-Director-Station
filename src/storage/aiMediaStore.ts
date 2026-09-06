import { IndexedDbStorageProvider } from './storageProvider';

const storage = new IndexedDbStorageProvider();

export async function putAiGeneratedMedia(uri: string, bytes: Uint8Array, contentType?: string): Promise<void> {
  if (!uri.startsWith('pds://ai/')) throw new Error('AI generated media must use a pds://ai/ URI.');
  await storage.put(uri, bytes, contentType);
}

export async function getAiGeneratedMedia(uri: string) {
  if (!uri.startsWith('pds://ai/')) return undefined;
  return storage.get(uri);
}

export async function hasAiGeneratedMedia(uri: string): Promise<boolean> {
  return uri.startsWith('pds://ai/') ? storage.has(uri) : false;
}

export async function deleteAiGeneratedMedia(uri: string): Promise<void> {
  if (uri.startsWith('pds://ai/')) await storage.delete(uri);
}
