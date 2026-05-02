# Helius Webhook — Manual Setup

Reproducibility note for the Frontier track. We use a single Helius enhanced webhook to ingest real Solana mainnet SWAP events. This doc records the exact API call so the webhook can be recreated from scratch (e.g. if the existing one gets deleted, the auth header rotates, or we move tunnels).

No setup script in the repo (`scripts/setup-helius-webhooks.ts` was not written for Day 1 — the webhook is created once and persists). If the team shape changes and we need it idempotent, port this curl into a TypeScript script.

## Current live webhook

| field | value |
|---|---|
| webhookID | `d90672f3-e445-40be-8733-586b866410f2` |
| webhookURL | `https://undeferred-nontraditionally-margorie.ngrok-free.dev/helius/events` |
| transactionTypes | `["SWAP"]` |
| webhookType | `enhanced` |
| txnStatus | `success` |
| active | `true` |

The webhook URL points at the dev ngrok tunnel. **It will need to migrate to a stable tunnel (Cloudflare Tunnel) or a public IP before Day 4 / 24-7 continuous-loop work** — see Day 4 in [frontier-track-plan.md](frontier-track-plan.md).

## Subscribed mainnet program IDs (whale source)

Each verified executable + owned by `BPFLoaderUpgradeab1e11111111111111111111111` on mainnet at the time of subscription:

| program | ID |
|---|---|
| Jupiter v6 aggregator | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` |
| Raydium AMM v4 | `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8` |
| Orca Whirlpool | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` |

We dropped Raydium CPMM/CLMM (Jupiter routes through them anyway), SPL Token Program (too noisy), and Metaplex Token Metadata (NFT mint signal isn't a useful alpha source for v1). Jupiter routes the vast majority of large-notional traffic, so this trio captures effectively all swap-shaped whale activity.

## Recreate from scratch

Required env vars in `agents/.env`:

```
HELIUS_API_KEY=<from dashboard.helius.dev>
HELIUS_WEBHOOK_AUTH_HEADER=<openssl rand -hex 32>
WEBHOOK_PUBLIC_URL=<your tunnel URL, e.g. https://xyz.ngrok-free.dev>
```

Generate the auth secret if creating fresh:

```bash
openssl rand -hex 32
```

Verify the program IDs are still live before subscribing:

```bash
for id in JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 \
         675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8 \
         whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc; do
  curl -s https://api.mainnet-beta.solana.com -X POST -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$id\",{\"encoding\":\"base64\",\"dataSlice\":{\"offset\":0,\"length\":0}}]}"
done
```

Each response should show `"executable":true` and `"owner":"BPFLoaderUpgradeab1e11111111111111111111111"`.

## Create webhook

```bash
set -a && source agents/.env && set +a
curl -s -w "\n---HTTP_STATUS=%{http_code}---\n" \
  "https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"webhookURL\": \"${WEBHOOK_PUBLIC_URL}/helius/events\",
    \"transactionTypes\": [\"SWAP\"],
    \"accountAddresses\": [
      \"JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4\",
      \"675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8\",
      \"whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc\"
    ],
    \"webhookType\": \"enhanced\",
    \"txnStatus\": \"success\",
    \"authHeader\": \"${HELIUS_WEBHOOK_AUTH_HEADER}\"
  }"
```

Expect: HTTP 201 with a JSON body containing `webhookID` and `active: true`. Save the `webhookID` somewhere recoverable.

## Update existing webhook (if URL or auth changes)

```bash
set -a && source agents/.env && set +a
WEBHOOK_ID=d90672f3-e445-40be-8733-586b866410f2

curl -s -w "\n---HTTP_STATUS=%{http_code}---\n" \
  "https://api.helius.xyz/v0/webhooks/${WEBHOOK_ID}?api-key=${HELIUS_API_KEY}" \
  -X PUT \
  -H "Content-Type: application/json" \
  -d "{
    \"webhookURL\": \"${WEBHOOK_PUBLIC_URL}/helius/events\",
    \"transactionTypes\": [\"SWAP\"],
    \"accountAddresses\": [
      \"JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4\",
      \"675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8\",
      \"whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc\"
    ],
    \"webhookType\": \"enhanced\",
    \"txnStatus\": \"success\",
    \"authHeader\": \"${HELIUS_WEBHOOK_AUTH_HEADER}\"
  }"
```

## Helius free tier constraints

- 5 webhooks max per account (we use 1)
- 100,000 addresses max per webhook (we use 3)
- Event delivery counts against monthly credits (no published per-event cost on free; monitor the receiver's `events_received_today` and trim address scope if Helius starts throttling)
- No SLA — webhooks may delay or duplicate. The receiver dedups by transaction signature with a 5-min TTL.
