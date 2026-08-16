import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StateStore } from '../lib/state.js';

function makeStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-bridge-state-'));
  return { dir, store: new StateStore(dir) };
}

test('StateStore persists chat state and settings', () => {
  const { dir, store } = makeStore();
  store.setChatState(1, { sessionId: 's1', createdAt: 123 });
  store.setChatSettings(1, { provider: 'p', model: 'm', reasoningEffort: 'high', agentPreset: 'code' });

  const reloaded = new StateStore(dir);
  assert.deepEqual(reloaded.getChatState(1), { sessionId: 's1', createdAt: 123 });
  assert.deepEqual(reloaded.getChatSettings(1), { provider: 'p', model: 'm', reasoningEffort: 'high', agentPreset: 'code' });
  rmSync(dir, { recursive: true, force: true });
});

test('StateStore tracks user and assistant stats', () => {
  const { dir, store } = makeStore();
  store.incrementUserMessage(1);
  store.incrementUserMessage(1);
  store.addAssistantMessage(1, { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2 });
  store.addAssistantMessage(1);

  const stats = store.getChatStats(1);
  assert.equal(stats.userMessages, 2);
  assert.equal(stats.assistantMessages, 2);
  assert.equal(stats.inputTokens, 10);
  assert.equal(stats.outputTokens, 5);
  assert.equal(stats.cacheReadTokens, 2);

  const reloaded = new StateStore(dir);
  assert.equal(reloaded.getChatStats(1).userMessages, 2);
  rmSync(dir, { recursive: true, force: true });
});
