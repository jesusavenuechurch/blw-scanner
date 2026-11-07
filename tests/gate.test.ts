import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, normalizeIso, searchText, startOfLocalDayIso } from '../src/lib/gate.ts';

const partner = { id: 1, is_registered: true, qr_token: 'secret' };

test('welcomes a registered partner with the right token', () => {
  assert.deepEqual(decide(partner, 'secret', []), { kind: 'welcome' });
});

test('accepts old passes and manual check-ins without a token', () => {
  assert.deepEqual(decide(partner, null, []), { kind: 'welcome' });
});

test('flags a pass whose token does not match', () => {
  assert.deepEqual(decide(partner, 'guess', []), { kind: 'forged' });
});

test('flags partners who never registered', () => {
  assert.deepEqual(decide({ ...partner, is_registered: false }, 'secret', []), { kind: 'not_registered' });
});

test('warns when the partner already came in today, showing the latest', () => {
  const last = { checked_in_at: '2026-11-07T09:00:00.000Z', device_name: 'Main entrance', origin: 'remote' as const };
  assert.deepEqual(decide(partner, 'secret', [last]), { kind: 'again', last });
});

test('a forged pass is caught before anything else', () => {
  assert.equal(decide({ ...partner, is_registered: false }, 'nope', []).kind, 'forged');
});

test('normalizes server timestamps so they sort as strings', () => {
  assert.equal(normalizeIso('2026-11-07T08:13:00+00:00'), '2026-11-07T08:13:00.000Z');
  assert.equal(normalizeIso('2026-11-07T10:13:00+02:00'), '2026-11-07T08:13:00.000Z');
});

test('start of the local day is at or before now', () => {
  const now = new Date();
  assert.ok(startOfLocalDayIso(now) <= now.toISOString());
});

test('search text ignores case and accents', () => {
  assert.equal(searchText('Chiamaka Àdébáyọ̀', null, 'CE Ikeja'), 'chiamaka adebayo ce ikeja');
});
