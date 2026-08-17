import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCallbackStoreForTests, decodeCallback, decodeData, encodeCallback, encodeData } from '../lib/callback.js';

test('callback data encodes and decodes special characters', () => {
  const parts = ['model', 'provider/a', 'deepseek-v4.flash', '中文 值'];
  const encoded = encodeData(parts);
  assert.equal(encoded.includes('|'), true);
  assert.deepEqual(decodeData(encoded), parts);
});

test('callback data survives URI reserved characters', () => {
  const parts = ['effort', 'p', 'm', 'high&max'];
  assert.deepEqual(decodeData(encodeData(parts)), parts);
});

test('callback tokens stay under 64 bytes and are one-time', () => {
  clearCallbackStoreForTests();
  const parts = ['model', 'very-long-provider-name', 'very-long-model-name-with-more-details', '中文配置'];
  const token = encodeCallback(parts);
  assert.ok(token.length <= 64);
  assert.deepEqual(decodeCallback(token), parts);
  assert.equal(decodeCallback(token), undefined);
});
