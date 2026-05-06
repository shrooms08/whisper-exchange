# Continuous-activity loop runner — single Fly.io VM.
#
# Image layout:
#   /app/agents/         — supplier.ts, buyer.ts, signals.ts, crypto.ts, etc.
#   /app/agents/node_modules/
#   /app/target/idl/whisper.json     — referenced by ../target/idl from agents/
#   /app/target/types/whisper.ts
#   /app/loop/runner.ts  — orchestrator
#
# Children are spawned with cwd=/app/agents so their relative imports resolve.
# Runner runs from /app/agents too so npx finds tsx in agents/node_modules and
# @solana/web3.js resolves cleanly. NODE_PATH is set as belt-and-braces.

FROM node:20-slim

# Native modules (bigint-buffer used transitively by @solana/web3.js) need a
# C toolchain when prebuilt binaries don't match. Slim is glibc-based so the
# bigint binding loads without the "pure JS will be used" fallback we saw on
# alpine in earlier experiments.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install agent deps first (separate layer so they cache across source changes).
# Don't omit dev deps — tsx is in devDependencies and the runner needs it.
COPY agents/package.json agents/package-lock.json* /app/agents/
WORKDIR /app/agents
RUN npm install

# Copy source.
WORKDIR /app
COPY agents /app/agents
COPY target/idl /app/target/idl
COPY target/types /app/target/types
COPY loop /app/loop

ENV NODE_ENV=production
ENV NODE_PATH=/app/agents/node_modules

# Final cwd — npx resolves tsx from agents/node_modules; runner imports from
# the same module tree.
WORKDIR /app/agents

CMD ["npx", "tsx", "/app/loop/runner.ts"]
