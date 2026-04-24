import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalize, commit, toHex } from '../crypto.ts';

// Hardcoded payload — do NOT edit. If canonicalize() changes shape, this
// test breaks. That's the point: the on-chain payload_commitment is 32 bytes
// of sha256 over exactly this string. Supplier + buyer must agree byte-for-byte.
const SAMPLE = {
  category: 'WHALE',
  signal_ref: 'slot 287491203, wallet 7xKX...Qh9',
  claim: 'WHALE_SWAP predicted within 6 blocks',
  evidence: [
    { kind: 'balance_delta', wallet: '7xKX…Qh9', pool: 'Raydium JUP/SOL', sol: 120 },
  ],
  recommended_action: 'short JUP/SOL, size ≤ 120 SOL',
};

const EXPECTED_CANONICAL =
  '{"category":"WHALE","claim":"WHALE_SWAP predicted within 6 blocks","evidence":[{"kind":"balance_delta","pool":"Raydium JUP/SOL","sol":120,"wallet":"7xKX…Qh9"}],"recommended_action":"short JUP/SOL, size ≤ 120 SOL","signal_ref":"slot 287491203, wallet 7xKX...Qh9"}';

const EXPECTED_SHA256_HEX = '3aa1c58cd55f62d5d92ead7c287877f41eed1801dbc1920a85d62413c9a103ec';

test('canonicalize sorts keys deterministically at every depth', () => {
  assert.equal(canonicalize(SAMPLE), EXPECTED_CANONICAL);
});

test('canonicalize is order-independent in input', () => {
  const shuffled = {
    recommended_action: SAMPLE.recommended_action,
    claim: SAMPLE.claim,
    evidence: SAMPLE.evidence.map((e) => ({
      wallet: e.wallet,
      sol: e.sol,
      pool: e.pool,
      kind: e.kind,
    })),
    signal_ref: SAMPLE.signal_ref,
    category: SAMPLE.category,
  };
  assert.equal(canonicalize(shuffled), canonicalize(SAMPLE));
});

test('commit returns a stable 32-byte sha256 of the canonical form', () => {
  const digest = commit(SAMPLE);
  assert.equal(digest.length, 32);
  assert.equal(toHex(digest), EXPECTED_SHA256_HEX);
});
