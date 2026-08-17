import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionManager } from '../lib/session.js';
import { StateStore } from '../lib/state.js';

function makeStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-bridge-session-'));
  return { dir, store: new StateStore(dir) };
}

test('createSession falls back to the model default when a stored reasoning effort is unsupported', async () => {
  const { dir, store } = makeStore();
  const calls = [];
  const api = {
    sessions: {
      create: async () => ({ result: { ok: true, value: { sessionId: 's-new' } } }),
      selectModel: async (req) => {
        calls.push(req.payload);
        if (req.payload.reasoningEffort === 'max') {
          return { result: { ok: false, error: { code: 'model-unavailable', message: 'does not support reasoning effort "max"' } } };
        }
        return { result: { ok: true, value: { selected: {} } } };
      },
    },
  };
  const sessions = new SessionManager(api, store, '/tmp', {}, undefined, 5);
  const sessionId = await sessions.createSession(1, {
    provider: 'tokenrhythm',
    model: 'deepseek-v4-flash-0731',
    reasoningEffort: 'max',
  });

  assert.equal(sessionId, 's-new');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].reasoningEffort, 'max');
  assert.equal('reasoningEffort' in calls[1], false);
  const stored = store.getChatSettings(1);
  assert.equal(stored.provider, 'tokenrhythm');
  assert.equal(stored.model, 'deepseek-v4-flash-0731');
  assert.equal('reasoningEffort' in stored, false);
  rmSync(dir, { recursive: true, force: true });
});

test('createSession keeps a supported reasoning effort untouched', async () => {
  const { dir, store } = makeStore();
  const calls = [];
  const api = {
    sessions: {
      create: async () => ({ result: { ok: true, value: { sessionId: 's-ok' } } }),
      selectModel: async (req) => {
        calls.push(req.payload);
        return { result: { ok: true, value: { selected: {} } } };
      },
    },
  };
  const sessions = new SessionManager(api, store, '/tmp', {}, undefined, 5);
  const sessionId = await sessions.createSession(1, { provider: 'p', model: 'm', reasoningEffort: 'high' });

  assert.equal(sessionId, 's-ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reasoningEffort, 'high');
  assert.equal(store.getChatSettings(1).reasoningEffort, 'high');
  rmSync(dir, { recursive: true, force: true });
});
