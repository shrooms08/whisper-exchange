#!/usr/bin/env bash
# Build, key-sync, deploy whisper to devnet. Uses the default Solana wallet
# (~/.config/solana/id.json) as the deployer.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[deploy] anchor build"
anchor build

echo "[deploy] anchor keys sync"
anchor keys sync

echo "[deploy] anchor deploy --provider.cluster devnet"
anchor deploy --provider.cluster devnet

PROGRAM_ID=$(solana-keygen pubkey target/deploy/whisper-keypair.json)
echo ""
echo "=== deploy complete ==="
echo "Program ID: $PROGRAM_ID"
echo "Explorer:   https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
