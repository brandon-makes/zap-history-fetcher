// Test the parsing/CSV logic with a saved sample zap receipt (no network).
const { npubToHex, receiptToRow, toCsv, amountFromBolt11 } = require('./index.js');
const assert = require('assert');

// 1. npub decode — jack's well-known npub
const hex = npubToHex('npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m');
assert.strictEqual(hex, '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2');
console.log('npub decode OK:', hex);

// 2. sample kind-9735 receipt
const sample = {
  id: 'a'.repeat(64),
  pubkey: 'b'.repeat(64),
  created_at: 1696118400,
  kind: 9735,
  content: 'Great post!',
  tags: [
    ['p', 'c'.repeat(64)],
    ['e', 'd'.repeat(64)],
    ['amount', '21000'],
    ['bolt11', 'lnbc210n1pj...'],
    ['description', JSON.stringify({ pubkey: 'e'.repeat(64), content: 'Great post!' })],
  ],
  sig: 'f'.repeat(128),
};
const row = receiptToRow(sample);
assert.strictEqual(row.amount_sats, 21);
assert.strictEqual(row.sender_pubkey, 'e'.repeat(64));
assert.strictEqual(row.recipient_pubkey, 'c'.repeat(64));
assert.strictEqual(row.date, '2023-10-01T00:00:00.000Z');
console.log('receiptToRow OK:', row.amount_sats, 'sats from', row.sender_pubkey.slice(0, 8));

// 4. CSV escaping with commas/quotes/newlines
const nasty = { ...sample, content: 'has, "quotes"\nand newline' };
const csv = toCsv([receiptToRow(nasty), row]);
const lines = csv.split('\n');
assert.ok(csv.startsWith('id,date,created_at,'));
assert.ok(csv.includes('"has, ""quotes""\nand newline"'));
console.log('CSV escaping OK');
console.log('--- sample CSV ---');
console.log(csv);
console.log('ALL TESTS PASSED');
