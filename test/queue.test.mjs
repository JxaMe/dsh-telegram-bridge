import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { QueueManager } from '../lib/queue.js';
import { StateStore } from '../lib/state.js';

function makeStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-bridge-queue-'));
  return { dir, store: new StateStore(dir) };
}

test('QueueManager rejects messages over the limit', () => {
  const { dir, store } = makeStore();
  // Keep the first item in-flight so the pending queue length is observable.
  const queue = new QueueManager(
    { sessions: { prompt: async () => ({ result: { ok: true, value: { accepted: true } } }) } },
    { ensureSession: () => new Promise(() => {}) },
    store,
    undefined,
    1,
  );

  assert.equal(queue.enqueue(1, 'a'), true);
  assert.equal(queue.enqueue(1, 'b'), true);
  assert.equal(queue.enqueue(1, 'c'), false);
  assert.equal(queue.queueLength(1), 1);

  queue.clear(1);
  assert.equal(queue.queueLength(1), 0);
  rmSync(dir, { recursive: true, force: true });
});

test('QueueManager retries with a fresh session on session-not-found', async () => {
  const { dir, store } = makeStore();
  let promptCalls = 0;
  let resets = 0;
  const api = {
    sessions: {
      prompt: async (req) => {
        promptCalls += 1;
        if (promptCalls === 1 && req.payload.sessionId === 'old') {
          return { result: { ok: false, error: { code: 'session-not-found' } } };
        }
        return { result: { ok: true, value: { accepted: true } } };
      },
    },
  };
  const sessions = {
    ensureSession: async () => 'old',
    resetSession: async () => {
      resets += 1;
      return 'new';
    },
  };

  const queue = new QueueManager(api, sessions, store, undefined, 10);
  queue.enqueue(1, 'hello');
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(resets, 1);
  assert.equal(promptCalls, 2);
  assert.equal(queue.queueLength(1), 0);
  rmSync(dir, { recursive: true, force: true });
});
