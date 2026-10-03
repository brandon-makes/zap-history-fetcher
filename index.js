#!/usr/bin/env node
/* zap-history-fetcher: export public Nostr zap receipts (kind 9735) to CSV.
 * Usage: node index.js <npub-or-hex> [--relay wss://...] [--limit N] [--out file.csv]
 * Zero dependencies, Node 18+. */
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Decode(str) {
  const pos = str.lastIndexOf('1');
  const hrp = str.slice(0, pos);
  const data = [...str.slice(pos + 1)].map(c => BECH32.indexOf(c));
  return { hrp, data: data.slice(0, -6) };
}
function convertBits(data, from, to, pad) {
  let acc = 0, bits = 0; const out = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad && bits > 0) out.push((acc << (to - bits)) & maxv);
  return out;
}
function npubToHex(npub) {
  if (/^[0-9a-f]{64}$/i.test(npub)) return npub.toLowerCase();
  const { hrp, data } = bech32Decode(npub);
  if (hrp !== 'npub') throw new Error('not an npub');
  return Buffer.from(convertBits(data, 5, 8, false)).toString('hex');
}
// Tagged template helper so tests can stub the relay layer.
function wsQuery(relay, filter) {
  // Minimal NIP-01 client over a WebSocket implemented on raw TLS+HTTP upgrade.
  return new Promise((resolve, reject) => {
    const u = new URL(relay);
    const key = crypto.randomBytes(16).toString('base64');
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname || '/',
      headers: { Connection: 'Upgrade', Upgrade: 'websocket',
        'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' },
    });
    const events = [];
    const subId = 'zapcsv-' + crypto.randomBytes(4).toString('hex');
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(events); } };
    req.on('upgrade', (res, socket) => {
      const send = (obj) => {
        const payload = Buffer.from(JSON.stringify(obj));
        const mask = crypto.randomBytes(4);
        let header;
        if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
        else if (payload.length < 65536) { header = Buffer.alloc(4); header[0]=0x81; header[1]=0xFE; header.writeUInt16BE(payload.length,2); }
        else { header = Buffer.alloc(10); header[0]=0x81; header[1]=0xFF; header.writeBigUInt64BE(BigInt(payload.length),2); }
        const masked = Buffer.from(payload);
        for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
        socket.write(Buffer.concat([header, mask, masked]));
      };
      send(['REQ', subId, filter]);
      let buf = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
          const fin = buf[0] & 0x80, op = buf[0] & 0x0f;
          let len = buf[1] & 0x7f, off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.slice(off, off + len);
          buf = buf.slice(off + len);
          if (op === 9) { const pong = Buffer.concat([Buffer.from([0x8a, 0x80]), crypto.randomBytes(4)]); socket.write(pong); continue; }
          if (!fin || op !== 1) continue;
          let msg; try { msg = JSON.parse(payload.toString()); } catch { continue; }
          if (msg[0] === 'EVENT' && msg[1] === subId) events.push(msg[2]);
          if (msg[0] === 'EOSE') { socket.end(); finish(); }
        }
      });
      socket.on('error', finish);
      setTimeout(() => { socket.end(); finish(); }, 20000);
    });
    req.on('error', reject);
    req.end();
  });
}
function tagValue(ev, name) {
  const t = (ev.tags || []).find(t => t[0] === name);
  return t ? t[1] : '';
}
function amountFromBolt11(bolt11) {
  const m = bolt11.match(/lnbc(\d+)([munp]?)/i);
  if (!m) return null;
  const mult = { '': 100000000000, m: 100000000, u: 100000, n: 100, p: 1 }[m[2]];
  return Math.round(parseInt(m[1], 10) * mult); // msats
}
function receiptToRow(ev) {
  let desc = {};
  try { desc = JSON.parse(tagValue(ev, 'description') || '{}'); } catch {}
  const bolt11 = tagValue(ev, 'bolt11');
  const msats = amountFromBolt11(bolt11);
  return {
    id: ev.id || '',
    date: ev.created_at ? new Date(ev.created_at * 1000).toISOString() : '',
    created_at: ev.created_at ?? '',
    sender_pubkey: desc.pubkey || tagValue(ev, 'P') || '',
    recipient_pubkey: tagValue(ev, 'p') || '',
    event_id: tagValue(ev, 'e') || '',
    amount_sats: msats == null ? '' : Math.floor(msats / 1000),
    amount_msats: msats == null ? '' : msats,
    content: ev.content || '',
  };
}
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows) {
  const cols = ['id','date','created_at','sender_pubkey','recipient_pubkey','event_id','amount_sats','amount_msats','content'];
  return cols.join(',') + '\n' + rows.map(r => cols.map(c => csvCell(r[c])).join(',')).join('\n') + '\n';
}
async function main() {
  const args = process.argv.slice(2);
  const target = args[0];
  if (!target) { console.error('usage: node index.js <npub-or-hex> [--relay wss://...] [--limit N] [--out file.csv]'); process.exit(1); }
  const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  const relay = opt('relay', 'wss://relay.nostr.band');
  const limit = parseInt(opt('limit', '500'), 10);
  const out = opt('out', 'zap-history.csv');
  const hex = npubToHex(target);
  const events = await wsQuery(relay, { kinds: [9735], '#p': [hex], limit });
  const rows = events.map(receiptToRow).sort((a, b) => a.created_at - b.created_at);
  fs.writeFileSync(out, toCsv(rows));
  console.log(`wrote ${rows.length} zap receipts to ${out}`);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { npubToHex, receiptToRow, toCsv, amountFromBolt11 };
