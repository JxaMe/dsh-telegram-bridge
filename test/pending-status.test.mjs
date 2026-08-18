import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingStatus } from '../lib/pending-status.js';

function createBot() {
  let deleted = 0;
  const bot = {
    api: {
      deleteMessage: async () => { deleted += 1; },
      editMessageText: async () => {},
      sendMessage: async () => ({ message_id: 1 }),
    },
    _deletedCount: () => deleted,
  };
  return bot;
}

test('PendingStatus set/clear manages per-chat state and deletes the status message', async () => {
  const bot = createBot();
  const pending = new PendingStatus();

  pending.set(bot, 1, 42);
  assert.equal(pending.has(1), true);

  await pending.clear(bot, 1);
  assert.equal(pending.has(1), false);
  assert.equal(bot._deletedCount(), 1);
});

test('PendingStatus update keeps state alive and clear cancels timers', async () => {
  const bot = createBot();
  const pending = new PendingStatus();

  pending.set(bot, 1, 42);
  pending.update(bot, 1, 'thinking...');
  assert.equal(pending.has(1), true);

  await pending.clear(bot, 1);
  assert.equal(pending.has(1), false);
});

test('PendingStatus dispose clears all chat state', () => {
  const bot = createBot();
  const pending = new PendingStatus();

  pending.set(bot, 1, 42);
  pending.set(bot, 2, 43);
  pending.dispose();

  assert.equal(pending.has(1), false);
  assert.equal(pending.has(2), false);
});
