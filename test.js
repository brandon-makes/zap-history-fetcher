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
assert.ok(csv.includes('"has, ""quotes"" and newline"'));
console.log('CSV escaping OK');

// hex pubkey input passes through unchanged (lowercased)
assert.strictEqual(npubToHex('A'.repeat(64)), 'a'.repeat(64));
assert.strictEqual(npubToHex('f'.repeat(64)), 'f'.repeat(64));

// BOLT11 with no multiplier = whole BTC (100000000000 msats per BTC)
assert.strictEqual(amountFromBolt11('lnbc1xxx'), 100000000000);
assert.strictEqual(amountFromBolt11('lnbc2xxx'), 200000000000);

// uppercase npub decodes the same as lowercase
assert.strictEqual(npubToHex('NPUB180CVV07TJDDR2G8NXVQY02LA9J8XKG5K5FRRK74VAJ7G4ZXPR8QZ5XPEQJ'.toLowerCase()),
  npubToHex('NPUB180CVV07TJDDR2G8NXVQY02LA9J8XKG5K5FRRK74VAJ7G4ZXPR8QZ5XPEQJ'));

// absurd bolt11 amounts (overflow) return null instead of garbage
assert.strictEqual(amountFromBolt11('lnbc99999999999999999999999999xxx'), null);

// 5. empty zap history → header-only CSV
const emptyCsv = toCsv([]);
assert.strictEqual(emptyCsv.split('\n').filter(Boolean).length, 1);
assert.ok(emptyCsv.startsWith('id,date,created_at,'));
console.log('empty history OK');

// 6. malformed receipt: missing tags, no description, no bolt11
const bare = { id: 'x'.repeat(64), pubkey: 'y'.repeat(64), created_at: 0, kind: 9735, content: '', tags: [] };
const bareRow = receiptToRow(bare);
assert.strictEqual(bareRow.amount_sats, '');
assert.strictEqual(bareRow.sender_pubkey, '');
assert.strictEqual(bareRow.recipient_pubkey, '');
console.log('malformed receipt OK');

// 7. broken description JSON does not throw
const brokenDesc = { ...sample, tags: [['description', '{not-json'], ['bolt11', 'lnbc210n1pj...']] };
const brokenRow = receiptToRow(brokenDesc);
assert.strictEqual(brokenRow.sender_pubkey, '');
assert.strictEqual(brokenRow.amount_sats, 21);
console.log('broken description OK');

// 8. bolt11 unit prefixes
assert.strictEqual(amountFromBolt11('lnbc1m1xxx'), 100000000);      // 1 mBTC = 100k sats
assert.strictEqual(amountFromBolt11('lnbc1u1xxx'), 100000);         // 1 uBTC = 100k msats
assert.strictEqual(amountFromBolt11('lnbc10n1xxx'), 1000);          // 10 nBTC
assert.strictEqual(amountFromBolt11('lnbc1p1xxx'), 1);              // 1 pBTC
assert.strictEqual(amountFromBolt11('notaninvoice'), null);
console.log('bolt11 units OK');

// 9. sender falls back to P tag when description missing
const pTag = { ...sample, tags: [['P', 'f'.repeat(64)], ['p', 'c'.repeat(64)], ['bolt11', 'lnbc210n1pj...']] };
assert.strictEqual(receiptToRow(pTag).sender_pubkey, 'f'.repeat(64));
console.log('P-tag fallback OK');

// 10. invalid npub throws
assert.throws(() => npubToHex('nsec1qqqqqqqqqq'));
console.log('invalid npub OK');

console.log('--- sample CSV ---');
console.log(csv);
console.log('ALL TESTS PASSED');
