#!/usr/bin/env bash
# Generate supplier + buyer keypairs under agents/keys/ and fund them on devnet.
#
# Funding strategy per wallet:
#   1. solana airdrop 5 — up to 2 attempts, 5s apart.
#   2. Fallback: solana transfer 5 SOL from the default wallet (~/.config/solana/id.json).
#   3. Require balance >= 4 SOL before proceeding (margin for fees).
#   4. If both paths fail, exit 1 and point at the default wallet's balance.
#
# Idempotent: existing keypairs + existing balance are reused.
set -euo pipefail

cd "$(dirname "$0")/.."

KEYS_DIR="agents/keys"
SUPPLIER_KEY="$KEYS_DIR/supplier-solana.json"
BUYER_KEY="$KEYS_DIR/buyer-solana.json"
DEFAULT_WALLET="$HOME/.config/solana/id.json"
TARGET_SOL=5
MIN_SOL=4

mkdir -p "$KEYS_DIR"

ensure_keypair() {
  local path=$1
  local name=$2
  if [[ ! -f "$path" ]]; then
    solana-keygen new --no-bip39-passphrase --silent --outfile "$path" >/dev/null
    echo "[setup] generated $name keypair at $path"
  else
    echo "[setup] reusing $name keypair at $path"
  fi
}

balance_sol() {
  local pub=$1
  solana balance --url devnet "$pub" 2>/dev/null | awk '{print $1}' | head -1
}

has_min_balance() {
  local pub=$1
  local bal
  bal=$(balance_sol "$pub")
  bal=${bal:-0}
  awk "BEGIN{exit !($bal >= $MIN_SOL)}"
}

try_airdrop() {
  local pub=$1
  local name=$2
  for i in 1 2; do
    echo "[setup] $name airdrop attempt $i: requesting $TARGET_SOL SOL"
    if solana airdrop --url devnet "$TARGET_SOL" "$pub" >/dev/null 2>&1; then
      sleep 2
      if has_min_balance "$pub"; then
        echo "[setup] $name airdrop succeeded"
        return 0
      fi
    fi
    sleep 5
  done
  return 1
}

try_transfer_fallback() {
  local pub=$1
  local name=$2
  if [[ ! -f "$DEFAULT_WALLET" ]]; then
    echo "[setup] $name transfer fallback unavailable: $DEFAULT_WALLET missing"
    return 1
  fi
  local src_bal
  src_bal=$(solana balance --url devnet --keypair "$DEFAULT_WALLET" 2>/dev/null | awk '{print $1}' | head -1)
  src_bal=${src_bal:-0}
  echo "[setup] $name transfer fallback: source wallet has ${src_bal} SOL"
  if ! awk "BEGIN{exit !($src_bal >= $TARGET_SOL + 0.01)}"; then
    echo "[setup] $name transfer fallback unavailable: source wallet balance ${src_bal} SOL < ${TARGET_SOL} + fees"
    return 1
  fi
  echo "[setup] $name transferring $TARGET_SOL SOL from default wallet"
  if solana transfer --url devnet \
      --keypair "$DEFAULT_WALLET" \
      --fee-payer "$DEFAULT_WALLET" \
      --allow-unfunded-recipient \
      "$pub" "$TARGET_SOL" >/dev/null 2>&1; then
    sleep 2
    if has_min_balance "$pub"; then
      echo "[setup] $name transfer fallback succeeded"
      return 0
    fi
  fi
  return 1
}

fund_wallet() {
  local pub=$1
  local name=$2
  if has_min_balance "$pub"; then
    echo "[setup] $name already funded ($(balance_sol "$pub") SOL) — skipping"
    return 0
  fi
  if try_airdrop "$pub" "$name"; then
    return 0
  fi
  echo "[setup] $name airdrop rate-limited — falling back to transfer"
  if try_transfer_fallback "$pub" "$name"; then
    return 0
  fi
  echo ""
  echo "[setup] ERROR: could not fund $name wallet ($pub)"
  echo "[setup]   airdrop rate-limited AND transfer fallback failed"
  if [[ -f "$DEFAULT_WALLET" ]]; then
    echo "[setup]   default wallet ($DEFAULT_WALLET): $(solana balance --url devnet --keypair "$DEFAULT_WALLET" 2>/dev/null || echo "unreadable")"
  else
    echo "[setup]   default wallet $DEFAULT_WALLET is missing — create one with 'solana-keygen new' and fund it"
  fi
  exit 1
}

ensure_keypair "$SUPPLIER_KEY" supplier
ensure_keypair "$BUYER_KEY" buyer

SUPPLIER_PUB=$(solana-keygen pubkey "$SUPPLIER_KEY")
BUYER_PUB=$(solana-keygen pubkey "$BUYER_KEY")

echo ""
echo "Supplier pubkey: $SUPPLIER_PUB"
echo "Buyer    pubkey: $BUYER_PUB"
echo ""

fund_wallet "$SUPPLIER_PUB" supplier
fund_wallet "$BUYER_PUB" buyer

echo ""
echo "=== final balances ==="
printf "supplier  %s  %s SOL\n" "$SUPPLIER_PUB" "$(balance_sol "$SUPPLIER_PUB")"
printf "buyer     %s  %s SOL\n" "$BUYER_PUB" "$(balance_sol "$BUYER_PUB")"
