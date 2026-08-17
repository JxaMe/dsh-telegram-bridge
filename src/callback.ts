import { randomUUID } from 'node:crypto';

const callbackStore = new Map<string, string[]>();

export function encodeData(parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join('|');
}

export function decodeData(data: string): string[] {
  return data.split('|').map((part) => decodeURIComponent(part));
}

export function encodeCallback(parts: string[]): string {
  const kind = parts[0] ?? 'cb';
  const token = randomUUID().replace(/-/g, '').slice(0, 12);
  const key = `${kind}:${token}`;
  callbackStore.set(key, parts);
  return key;
}

export function decodeCallback(data: string): string[] | undefined {
  if (callbackStore.has(data)) {
    const parts = callbackStore.get(data)!;
    callbackStore.delete(data);
    return parts;
  }
  if (data.includes('|')) return decodeData(data);
  return undefined;
}

export function clearCallbackStoreForTests(): void {
  callbackStore.clear();
}
