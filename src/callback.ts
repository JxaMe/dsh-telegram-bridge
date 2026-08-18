import { randomUUID } from 'node:crypto';

interface CallbackEntry {
  data: string[];
  timestamp: number;
}

const callbackStore = new Map<string, CallbackEntry>();
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function cleanupCallbackStore(): void {
  const now = Date.now();
  for (const [key, entry] of callbackStore) {
    if (now - entry.timestamp > TOKEN_TTL_MS) {
      callbackStore.delete(key);
    }
  }
}

export function encodeData(parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join('|');
}

export function decodeData(data: string): string[] {
  return data.split('|').map((part) => decodeURIComponent(part));
}

export function encodeCallback(parts: string[]): string {
  cleanupCallbackStore();
  const kind = parts[0] ?? 'cb';
  const token = randomUUID().replace(/-/g, '').slice(0, 12);
  const key = `${kind}:${token}`;
  callbackStore.set(key, { data: parts, timestamp: Date.now() });
  return key;
}

export function decodeCallback(data: string): string[] | undefined {
  if (callbackStore.has(data)) {
    const entry = callbackStore.get(data)!;
    callbackStore.delete(data);
    return entry.data;
  }
  if (data.includes('|')) return decodeData(data);
  return undefined;
}

export function clearCallbackStoreForTests(): void {
  callbackStore.clear();
}

export function setCallbackEntryTimestampForTests(key: string, timestamp: number): void {
  const entry = callbackStore.get(key);
  if (entry) {
    entry.timestamp = timestamp;
  }
}
