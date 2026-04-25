#!/usr/bin/env bash
# Wrapper: runs scripts/e2e-test.ts with node_modules resolved from agents/.
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_PATH="$(pwd)/agents/node_modules"
cd agents
exec npx tsx ../scripts/e2e-test.ts "$@"
