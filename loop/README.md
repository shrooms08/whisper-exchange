# loop/ — Continuous activity orchestrator (v2)

4-agent loop runner intended for 24/7 hosted deployment so the live dashboard
at https://whisper-exchange.vercel.app stays active for cold visitors.

**Status:** Built + locally tested, not deployed for Frontier submission.
See [`docs/frontier-track-plan.md`](../docs/frontier-track-plan.md) Day 4 for
the deferral rationale.

## What it does

- Boots `night-oracle`, `dawn-watcher`, `alpha-hunter`, `cipher-rook`
  concurrently using the existing [agents/supplier.ts](../agents/supplier.ts)
  and [agents/buyer.ts](../agents/buyer.ts) — no agent code changes needed,
  the runner only orchestrates.
- Runs them for 25-minute sessions (`SESSION_DURATION_MS`, override via env).
- SIGINT-cleans children (45s grace before SIGTERM, accommodates web3.js
  429-backoff lag), idles 5 minutes, restarts.
- Periodic refunds from `night-oracle` to buyers + `dawn-watcher` if any
  drops below threshold. Skipped silently if `night-oracle` itself is too
  low to cover refunds + 0.5 SOL reserve.
- Reconstructs all 8 keypairs from Fly secrets at boot — no key files in
  the image.

## Tested locally

60-second session cycle — all 4 agents spawn, suppliers create listings,
balance check fires (refund or skip), clean SIGINT shutdown, no money
leaked. See Day 4 Gate 2 in the conversation log for the full output.

## Files

| file | purpose |
|---|---|
| [`runner.ts`](runner.ts) | orchestrator — spawn, watch, signal, refund, loop |
| [`Dockerfile`](Dockerfile) | `node:20-slim`, agent deps installed under `/app/agents/`, runner runs from there so npx + Node module resolution works without env hacks |
| [`fly.toml`](fly.toml) | single shared-cpu-1x VM, 512MB, env defaults, no http_service (worker-only) |
| `package.json` | metadata only — runtime deps are pulled from `agents/node_modules` (Dockerfile copies the agents tree) |

## To deploy on Fly.io (when budget allows)

```bash
cd loop

# Create the app (requires payment method on file even for free-tier
# allowance — this was the blocker for Frontier submission).
fly launch --no-deploy --copy-config --name whisper-exchange-loop \
  --region iad --no-db --no-redis --no-public-ips --no-github-workflow --yes

# Set 11 secrets in one batched command.
fly secrets set \
  NIGHT_ORACLE_SOLANA="$(cat ../agents/keys/supplier-solana.json)" \
  NIGHT_ORACLE_X25519="$(cat ../agents/keys/supplier-x25519.json)" \
  DAWN_WATCHER_SOLANA="$(cat ../agents/keys/dawn-watcher-solana.json)" \
  DAWN_WATCHER_X25519="$(cat ../agents/keys/dawn-watcher-x25519.json)" \
  ALPHA_HUNTER_SOLANA="$(cat ../agents/keys/buyer-solana.json)" \
  ALPHA_HUNTER_X25519="$(cat ../agents/keys/buyer-x25519.json)" \
  CIPHER_ROOK_SOLANA="$(cat ../agents/keys/cipher-rook-solana.json)" \
  CIPHER_ROOK_X25519="$(cat ../agents/keys/cipher-rook-x25519.json)" \
  BASE_RPC="$(grep '^BASE_RPC=' ../agents/.env | cut -d= -f2-)" \
  HELIUS_API_KEY="$(grep '^HELIUS_API_KEY=' ../agents/.env | cut -d= -f2-)" \
  PROGRAM_ID="6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H"

fly deploy
fly logs        # tail boot + cycle activity
fly status      # 1 machine, started, healthy=passing
```

Estimated cost: **~$1-3** for a 7-day continuous run on shared-cpu-1x VM
(within Fly's $5/month free allowance, but billing requires CC on file).

## Local development

For typecheck or local cycle test from inside this directory:

```bash
# Symlink agents/node_modules into loop/ so module resolution works locally.
# Already gitignored at repo root (.gitignore: node_modules).
ln -sfn ../agents/node_modules node_modules

# Source secrets from agents/keys + agents/.env, then run with short windows.
SESSION_DURATION_MS=60000 IDLE_BETWEEN_SESSIONS_MS=10000 \
AGENTS_CWD="$(cd .. && pwd)/agents" \
KEYS_DIR="/tmp/whisper-keys-test-$$" \
NIGHT_ORACLE_SOLANA="$(cat ../agents/keys/supplier-solana.json)" \
NIGHT_ORACLE_X25519="$(cat ../agents/keys/supplier-x25519.json)" \
DAWN_WATCHER_SOLANA="$(cat ../agents/keys/dawn-watcher-solana.json)" \
DAWN_WATCHER_X25519="$(cat ../agents/keys/dawn-watcher-x25519.json)" \
ALPHA_HUNTER_SOLANA="$(cat ../agents/keys/buyer-solana.json)" \
ALPHA_HUNTER_X25519="$(cat ../agents/keys/buyer-x25519.json)" \
CIPHER_ROOK_SOLANA="$(cat ../agents/keys/cipher-rook-solana.json)" \
CIPHER_ROOK_X25519="$(cat ../agents/keys/cipher-rook-x25519.json)" \
PROGRAM_ID="6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H" \
  $(grep -h '^BASE_RPC=\|^HELIUS_API_KEY=' ../agents/.env | xargs) \
  npx tsx runner.ts
```

Send SIGINT to the runner PID (not the `tee` PID if you're piping) to
trigger graceful shutdown.

## Configuration knobs (env vars, all optional)

| var | default | meaning |
|---|---|---|
| `SESSION_DURATION_MS` | `1500000` (25 min) | how long each agent session runs before SIGINT |
| `IDLE_BETWEEN_SESSIONS_MS` | `300000` (5 min) | pause between sessions |
| `SHUTDOWN_GRACE_MS` | `45000` (45s) | SIGINT-to-SIGTERM grace per session shutdown |
| `USE_PRIVATE_PURCHASE` | `true` | route buyer purchases through MagicBlock ER |
| `KEYS_DIR` | `/tmp/keys` | where to materialize keypair files at boot |
| `AGENTS_CWD` | `/app/agents` | spawn cwd for child agents (set to local agents dir for local test) |
| `BASE_RPC` | required | QuickNode devnet endpoint, propagated to children |
| `HELIUS_API_KEY` | required | gate-checked by `agents/supplier.ts` and `agents/buyer.ts` at startup; not used for traffic since Day 1.5 |
| `PROGRAM_ID` | required | Whisper Exchange devnet program ID |
