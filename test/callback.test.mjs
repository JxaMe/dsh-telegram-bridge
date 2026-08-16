import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeData, encodeData } from '../lib/callback.js';

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
