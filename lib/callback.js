import { randomUUID } from 'node:crypto';
const callbackStore = new Map();
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export function cleanupCallbackStore() {
    const now = Date.now();
    for (const [key, entry] of callbackStore) {
        if (now - entry.timestamp > TOKEN_TTL_MS) {
            callbackStore.delete(key);
        }
    }
}
export function encodeData(parts) {
    return parts.map((part) => encodeURIComponent(part)).join('|');
}
export function decodeData(data) {
    return data.split('|').map((part) => decodeURIComponent(part));
}
export function encodeCallback(parts) {
    cleanupCallbackStore();
    const kind = parts[0] ?? 'cb';
    const token = randomUUID().replace(/-/g, '').slice(0, 12);
    const key = `${kind}:${token}`;
    callbackStore.set(key, { data: parts, timestamp: Date.now() });
    return key;
}
export function decodeCallback(data) {
    const entry = callbackStore.get(data);
    if (entry) {
        callbackStore.delete(data);
        if (Date.now() - entry.timestamp > TOKEN_TTL_MS) {
            return undefined;
        }
        return entry.data;
    }
    if (data.includes('|'))
        return decodeData(data);
    return undefined;
}
export function clearCallbackStoreForTests() {
    callbackStore.clear();
}
export function setCallbackEntryTimestampForTests(key, timestamp) {
    const entry = callbackStore.get(key);
    if (entry) {
        entry.timestamp = timestamp;
    }
}
