#!/usr/bin/env bash
# scripts/launch-multi.sh
#
# Launches the four-agent multi-agent demo concurrently against devnet:
#   night-oracle (supplier)  WHALE,MEV         price 2.4 SOL
#   dawn-watcher (supplier)  MINT,INSDR,IMBAL  price 1.8 SOL
#   alpha-hunter (buyer)     WHALE,MEV,IMBAL   max 3.0 SOL  min_rep 0
#   cipher-rook  (buyer)     MINT,INSDR,WHALE  max 2.5 SOL  min_rep 4
#
# Sources agents/.env so BASE_RPC (QuickNode, Day 1.5) and
# HELIUS_API_KEY (the gate-check value) reach every child. Each agent's
# stdout/stderr go to logs/multi-{handle}.log so they can be tailed
# independently. Ctrl+C propagates SIGINT to all four, with a SIGTERM
# fallback after a short grace.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f agents/.env ]]; then
  echo "[launch-multi] FATAL: agents/.env not found" >&2
  exit 1
fi
# Export every assignment in agents/.env into our environment so children inherit.
set -a
# shellcheck disable=SC1091
. agents/.env
set +a

mkdir -p logs

echo "[launch-multi] running pre-flight checks…"
if ! npx tsx scripts/preflight-multi.ts; then
  echo "[launch-multi] FATAL: pre-flight failed; agents NOT launched" >&2
  exit 1
fi

# Children must run from agents/ so their relative paths (./payloads, IDL
# at ../target/idl/whisper.json, etc) resolve correctly. Keypair env vars
# pass absolute paths so the cd doesn't break them.
KEYS_DIR="$ROOT/agents/keys"
LOG_DIR="$ROOT/logs"
cd "$ROOT/agents"

echo "[launch-multi] launching 4 agents…"

AGENT_HANDLE=night-oracle \
AGENT_SOLANA_KEYPAIR="$KEYS_DIR/supplier-solana.json" \
AGENT_X25519_KEYPAIR="$KEYS_DIR/supplier-x25519.json" \
AGENT_SIGNAL_CATEGORIES=WHALE,MEV \
AGENT_PRICE_LAMPORTS=2400000000 \
  npx tsx supplier.ts > "$LOG_DIR/multi-night-oracle.log" 2>&1 &
PID_S1=$!

AGENT_HANDLE=dawn-watcher \
AGENT_SOLANA_KEYPAIR="$KEYS_DIR/dawn-watcher-solana.json" \
AGENT_X25519_KEYPAIR="$KEYS_DIR/dawn-watcher-x25519.json" \
AGENT_SIGNAL_CATEGORIES=MINT,INSDR,IMBAL \
AGENT_PRICE_LAMPORTS=1800000000 \
  npx tsx supplier.ts > "$LOG_DIR/multi-dawn-watcher.log" 2>&1 &
PID_S2=$!

AGENT_HANDLE=alpha-hunter \
AGENT_SOLANA_KEYPAIR="$KEYS_DIR/buyer-solana.json" \
AGENT_X25519_KEYPAIR="$KEYS_DIR/buyer-x25519.json" \
AGENT_BUY_CATEGORIES=WHALE,MEV,IMBAL \
AGENT_MAX_PRICE_LAMPORTS=3000000000 \
AGENT_MIN_REPUTATION=0 \
  npx tsx buyer.ts > "$LOG_DIR/multi-alpha-hunter.log" 2>&1 &
PID_B1=$!

AGENT_HANDLE=cipher-rook \
AGENT_SOLANA_KEYPAIR="$KEYS_DIR/cipher-rook-solana.json" \
AGENT_X25519_KEYPAIR="$KEYS_DIR/cipher-rook-x25519.json" \
AGENT_BUY_CATEGORIES=MINT,INSDR,WHALE \
AGENT_MAX_PRICE_LAMPORTS=2500000000 \
AGENT_MIN_REPUTATION=8 \
  npx tsx buyer.ts > "$LOG_DIR/multi-cipher-rook.log" 2>&1 &
PID_B2=$!

PIDS=("$PID_S1" "$PID_S2" "$PID_B1" "$PID_B2")

echo "  night-oracle (supplier)  PID $PID_S1  log: logs/multi-night-oracle.log"
echo "  dawn-watcher (supplier)  PID $PID_S2  log: logs/multi-dawn-watcher.log"
echo "  alpha-hunter (buyer)     PID $PID_B1  log: logs/multi-alpha-hunter.log"
echo "  cipher-rook  (buyer)     PID $PID_B2  log: logs/multi-cipher-rook.log"
echo
echo "Tail all four:  tail -f logs/multi-*.log"
echo "Ctrl+C to stop."

# SIGINT/SIGTERM propagation. Send INT first (agents catch it for graceful
# shutdown), wait 5s, then SIGTERM stragglers.
shutdown() {
  echo
  echo "[launch-multi] Stopping all 4 agents…"
  for pid in "${PIDS[@]}"; do
    kill -INT "$pid" 2>/dev/null || true
  done
  for _ in 1 2 3 4 5; do
    sleep 1
    alive=0
    for pid in "${PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then alive=$((alive + 1)); fi
    done
    if [[ $alive -eq 0 ]]; then break; fi
  done
  for pid in "${PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "Stopped."
  exit 0
}
trap shutdown INT TERM

wait "${PIDS[@]}"
