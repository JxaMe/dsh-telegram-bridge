import { randomUUID } from 'node:crypto';
export function createRpcId() {
    return randomUUID();
}
