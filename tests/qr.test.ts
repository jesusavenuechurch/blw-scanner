import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiUrl, normalizePairingCode, parseScannedCode } from '../src/lib/qr.ts';

test('reads a new pass with its token', () => {
  assert.deepEqual(parseScannedCode('https://lounge.example.org/partner/verify/42?t=abc123'), { kind: 'partner', id: 42, token: 'abc123' });
});

test('reads an old pass without a token', () => {
  assert.deepEqual(parseScannedCode('http://192.168.1.20:8000/partner/verify/7'), { kind: 'partner', id: 7, token: null });
});

test('reads a typed partner number', () => {
  assert.deepEqual(parseScannedCode(' 105 '), { kind: 'partner', id: 105, token: null });
});

test('does not mistake other links for passes', () => {
  assert.equal(parseScannedCode('https://example.org/partner/verify/12abc').kind, 'unknown');
  assert.equal(parseScannedCode('https://example.org/hello').kind, 'unknown');
  assert.equal(parseScannedCode('').kind, 'unknown');
});

test('reads the workspace pairing code', () => {
  const raw = JSON.stringify({ type: 'blw-scanner-pair', api: 'https://lounge.example.org/api', code: 'ab3-xyz' });
  assert.deepEqual(parseScannedCode(raw), { kind: 'pair', api: 'https://lounge.example.org/api', code: 'AB3XYZ' });
});

test('ignores unrelated JSON', () => {
  assert.equal(parseScannedCode('{"type":"something-else"}').kind, 'unknown');
  assert.equal(parseScannedCode('{not json').kind, 'unknown');
});

test('normalizes server addresses', () => {
  assert.equal(normalizeApiUrl('192.168.1.20:8000'), 'http://192.168.1.20:8000/api');
  assert.equal(normalizeApiUrl('https://lounge.example.org/'), 'https://lounge.example.org/api');
  assert.equal(normalizeApiUrl('https://lounge.example.org/api/'), 'https://lounge.example.org/api');
});

test('normalizes pairing codes', () => {
  assert.equal(normalizePairingCode(' ab c-12 3 '), 'ABC123');
});
