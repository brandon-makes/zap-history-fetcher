# zap-history-fetcher

Export public Nostr zap receipts (kind 9735) for any npub/hex pubkey to a clean CSV. Zero npm dependencies — plain Node.js 18+.

## Usage

```bash
node index.js <npub-or-hex> [--relay wss://relay.damus.io] [--limit 500] [--out zaps.csv]
```

Example:

```bash
node index.js npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m --out jack-zaps.csv
```

## Output columns

| column | meaning |
|---|---|
| `id` | zap receipt event id |
| `date` | ISO-8601 timestamp |
| `created_at` | unix timestamp |
| `sender_pubkey` | zapper (from the zap request in the `description` tag) |
| `recipient_pubkey` | zapped profile |
| `event_id` | zapped note (if any) |
| `amount_sats` | amount in satoshis |
| `amount_msats` | amount in millisatoshis |
| `content` | zap message |

## How it works

1. Decodes the `npub` bech32 string to a hex pubkey.
2. Opens a WebSocket to a Nostr relay and sends a NIP-01 filter `{kinds: [9735], "#p": [pubkey]}`.
3. Parses each receipt's tags (`amount`, `description`, `bolt11` fallback) and writes a CSV with proper escaping.

## Tests

```bash
node test.js
```

Runs offline against a saved sample receipt: npub decoding, receipt parsing, bolt11 amount fallback, and CSV escaping.

## License

MIT
