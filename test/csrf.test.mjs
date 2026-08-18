import test from 'node:test';
import assert from 'node:assert/strict';
import { CSRF_WINDOW_MS, csrfTokenFor, csrfWindows, verifyCsrfToken } from '../lib/csrf.js';

test('csrf token is deterministic within the same window', () => {
  const now = Date.now();
  const window = csrfWindows(now)[0];
  const token = csrfTokenFor('bot-token', window);
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 64);
  assert.equal(csrfTokenFor('bot-token', window), token);
});

test('verifyCsrfToken accepts current and previous window tokens', () => {
  const now = Date.now();
  const [current, previous] = csrfWindows(now);
  assert.equal(verifyCsrfToken(csrfTokenFor('bot-token', current), 'bot-token', now), true);
  assert.equal(verifyCsrfToken(csrfTokenFor('bot-token', previous), 'bot-token', now), true);
});

test('verifyCsrfToken rejects wrong token, wrong botToken, and non-string input', () => {
  const now = Date.now();
  const token = csrfTokenFor('secret-a', csrfWindows(now)[0]);
  assert.equal(verifyCsrfToken(token, 'secret-b', now), false);
  assert.equal(verifyCsrfToken('not-a-token', 'secret-a', now), false);
  assert.equal(verifyCsrfToken('', 'secret-a', now), false);
  assert.equal(verifyCsrfToken(undefined, 'secret-a', now), false);
  assert.equal(verifyCsrfToken(null, 'secret-a', now), false);
  assert.equal(verifyCsrfToken(12345, 'secret-a', now), false);
});

test('csrf window advances and old window expires after two windows', () => {
  const start = Date.now();
  const [oldWindow] = csrfWindows(start);
  const afterTwoWindows = start + CSRF_WINDOW_MS * 2 + 1;
  const token = csrfTokenFor('bot-token', oldWindow);
  assert.equal(verifyCsrfToken(token, 'bot-token', afterTwoWindows), false);
});
