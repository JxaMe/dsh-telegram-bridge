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

test('formatTelegramHtml renders dsh-ui list/steps with object items', () => {
  const spec = {
    items: [
      { type: 'list', items: ['plain item', { title: 'DshWslManager', desc: 'WSL 管理器' }] },
      { type: 'steps', items: ['plain step', { title: '改代码', desc: 'src/forwarder.ts' }] },
    ],
  };
  const html = formatTelegramHtml('```dsh-ui\n' + JSON.stringify(spec) + '\n```');
  assert.match(html, /• plain item/);
  assert.match(html, /• <b>DshWslManager<\/b> — WSL 管理器/);
  assert.match(html, /1\. plain step/);
  assert.match(html, /2\. <b>改代码<\/b> — src\/forwarder\.ts/);
});

test('splitTelegramMessage does not split inside a short code block', () => {
  const chunks = splitTelegramMessage('a\n```js\nconst x = 1;\n```\nb', 20);
  assert.ok(chunks.some((c) => c.includes('<pre>')));
  for (const chunk of chunks) {
    assert.equal((chunk.match(/<pre>/g) ?? []).length, (chunk.match(/<\/pre>/g) ?? []).length);
  }
});

test('formatTelegramHtml renders dsh-ui table/todo/section', () => {
  const spec = {
    items: [
      { type: 'table', headers: ['Name', 'Status'], rows: [['A', 'ok'], ['B', 'warn']] },
      { type: 'todo', items: [{ title: 'done', done: true }, { title: 'pending', done: false }] },
      { type: 'section', title: 'Results' },
    ],
  };
  const html = formatTelegramHtml('```dsh-ui\n' + JSON.stringify(spec) + '\n```');
  assert.match(html, /Name \| Status/);
  assert.match(html, /✅ done/);
  assert.match(html, /⬜ pending/);
  assert.match(html, /<b>Results<\/b>/);
});

test('formatTelegramHtml supports rich text and truncates long code blocks', () => {
  const html = formatTelegramHtml('**bold** and *italic* and `code`');
  assert.match(html, /<b>bold<\/b>/);
  assert.match(html, /<i>italic<\/i>/);
  assert.match(html, /<code>code<\/code>/);

  const longCode = '```js\n' + Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n') + '\n```';
  const truncated = formatTelegramHtml(longCode);
  assert.match(truncated, /已截断，共 60 行/);
});
