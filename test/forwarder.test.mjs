import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventForwarder, formatTelegramHtml, splitTelegramMessage } from '../lib/forwarder.js';
import { PendingStatus } from '../lib/pending-status.js';
import { StateStore } from '../lib/state.js';

function makeStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-bridge-forwarder-'));
  return { dir, store: new StateStore(dir) };
}

test('EventForwarder sends escaped HTML and records usage stats', async () => {
  const { dir, store } = makeStore();
  store.setChatState(1, { sessionId: 's1', createdAt: 1 });

  let listener;
  const ctx = {
    on: (event, fn) => {
      if (event === 'session/event') listener = fn;
    },
  };
  const sent = [];
  const bot = {
    api: {
      sendMessage: async (chatId, text, opts) => {
        sent.push({ chatId, text, opts });
        return { message_id: 1 };
      },
      deleteMessage: async () => {},
    },
  };
  const pending = new PendingStatus();
  const queue = { queueLength: () => 0 };
  const forwarder = new EventForwarder(ctx, bot, store, pending, queue);
  forwarder.start();

  listener(
    { id: 's1' },
    {
      type: 'assistant/message',
      data: {
        message: { content: [{ type: 'text', text: 'hi <b>' }] },
        usage: { inputTokens: 12, outputTokens: 3 },
      },
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, 'hi &lt;b&gt;');
  assert.equal(sent[0].opts.parse_mode, 'HTML');
  const stats = store.getChatStats(1);
  assert.equal(stats.assistantMessages, 1);
  assert.equal(stats.inputTokens, 12);
  assert.equal(stats.outputTokens, 3);
  rmSync(dir, { recursive: true, force: true });
});

test('formatTelegramHtml escapes plain text and preserves fenced code blocks', () => {
  const html = formatTelegramHtml('a < b\n```js\nconst x = "<&";\n```\nc > d');
  assert.match(html, /a &lt; b/);
  assert.match(html, /<pre>/);
  assert.match(html, /const x = &quot;&lt;&amp;&quot;;/);
  assert.match(html, /c &gt; d/);
});

test('splitTelegramMessage does not split inside a short code block', () => {
  const chunks = splitTelegramMessage('a\n```js\nconst x = 1;\n```\nb', 20);
  assert.ok(chunks.some((c) => c.includes('<pre>')));
  for (const chunk of chunks) {
    assert.equal((chunk.match(/<pre>/g) ?? []).length, (chunk.match(/<\/pre>/g) ?? []).length);
  }
});
