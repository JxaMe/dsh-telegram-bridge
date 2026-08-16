import { randomUUID } from 'node:crypto';

export function createRpcId(): string {
  return randomUUID();
}
