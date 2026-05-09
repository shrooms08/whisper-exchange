// Generates the personalized starter agent script that the user downloads
// from Step 4 of /become-an-agent. The script is the smallest working
// thing that proves "I am alive on Whisper Exchange" — connects to
// devnet, fetches the user's Agent account, prints state, exits.
//
// Production agents (in agents/supplier.ts and agents/buyer.ts) do far
// more, but they live in the repo. This file is what we hand to anyone
// who completes the browser onboarding.
//
// Hardcoded into the output:
//   - handle           (display name on the marketplace)
//   - walletPubkey     (the wallet that owns the Agent — read-only here)
//   - agentPda         (deterministic from wallet, but baked in to skip RPC math)
//   - x25519 pubkey    (so the user can verify it matches what's on-chain)
//   - x25519 privkey   (BAKED IN — needed to decrypt sealed payloads)
//
// The script's only npm dep is @solana/web3.js. Agent-account decode is
// hand-rolled borsh — keeps the script self-contained and the schema
// transparent to anyone reading it. Decryption helpers (commented-out
// example) use Node's built-in crypto module + tiny manual x25519 via
// @noble/curves IF the user uncomments and installs it.

import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = '6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H';
const DEVNET_RPC_DEFAULT = 'https://api.devnet.solana.com';

export interface StarterScriptInput {
  handle: string;
  walletPubkey: string;
  agentPda: PublicKey;
  x25519PublicKey: Uint8Array;
  x25519PrivateKey: Uint8Array;
}

function bytesToBase64(b: Uint8Array): string {
  // Browser-side equivalent of Buffer.from(b).toString('base64'). Goes
  // straight into the generated source as a string literal that Node's
  // Buffer.from(...,'base64') decodes back to the same bytes.
  let bin = '';
  for (let i = 0; i < b.length; i += 1) bin += String.fromCharCode(b[i]!);
  return btoa(bin);
}

export function generateStarterScript(input: StarterScriptInput): string {
  const {
    handle,
    walletPubkey,
    agentPda,
    x25519PublicKey,
    x25519PrivateKey,
  } = input;

  // String-escape the handle (defense in depth — RegisterStep already
  // validated, but this template runs with whatever it's handed).
  const handleEsc = JSON.stringify(handle);
  const x25519PubB64 = bytesToBase64(x25519PublicKey);
  const x25519PrivB64 = bytesToBase64(x25519PrivateKey);

  return `// =====================================================================
// Whisper Exchange — starter agent for ${handle}
// generated ${new Date().toISOString()}
//
// ⚠  WARNING — this file contains your x25519 PRIVATE KEY.
//    Save it locally. DO NOT commit to git. DO NOT share.
//    Suggested: add this file to .gitignore, OR rename to
//    whisper-agent.local.ts and gitignore *.local.ts.
//
// What this script does:
//   1. Connects to Solana devnet
//   2. Fetches your on-chain Agent account
//   3. Prints handle, reputation, listings_created, x25519 pubkey
//   4. Exits
//
// What it does NOT do (yet):
//   - List signals, purchase, deliver, rate. Those need to be signed by
//     your wallet (Phantom/Solflare), which this script can't do
//     headlessly. To run a fully autonomous agent that lists + delivers,
//     see the reference agents in the Whisper Exchange repo:
//       https://github.com/shrooms08/whisper-exchange
//     and the protocol spec at docs/agent-protocol.md.
//
// Run:
//   npm install @solana/web3.js
//   npx tsx whisper-agent-${handle}.ts
//
// =====================================================================

import { Connection, PublicKey } from '@solana/web3.js';

// ---------- baked-in identity ----------

const HANDLE = ${handleEsc};
const WALLET_PUBKEY = ${JSON.stringify(walletPubkey)};
const AGENT_PDA = ${JSON.stringify(agentPda.toBase58())};
const PROGRAM_ID = ${JSON.stringify(PROGRAM_ID)};

// x25519 keys live here as base64 — same scheme used by the browser
// onboarding flow. Decoded at runtime to Uint8Array for use.
const X25519_PUBKEY_B64 = ${JSON.stringify(x25519PubB64)};
const X25519_PRIVKEY_B64 = ${JSON.stringify(x25519PrivB64)};

const X25519_PUBKEY = Buffer.from(X25519_PUBKEY_B64, 'base64');
const X25519_PRIVKEY = Buffer.from(X25519_PRIVKEY_B64, 'base64');

// ---------- borsh-decode the Agent account ----------
//
// Schema (from programs/whisper/src/state.rs Agent struct):
//
//   8 bytes  Anchor account discriminator
//  32 bytes  authority: Pubkey
//   4 bytes  handle length (u32 LE)
//   N bytes  handle: String (UTF-8)
//  32 bytes  pubkey_x25519: [u8; 32]
//   8 bytes  reputation_num: u64 LE
//   8 bytes  reputation_den: u64 LE
//   8 bytes  listings_created: u64 LE
//   8 bytes  created_at: i64 LE (unix seconds)
//   1 byte   bump: u8

interface AgentState {
  authority: PublicKey;
  handle: string;
  pubkeyX25519: Uint8Array;
  reputationNum: bigint;
  reputationDen: bigint;
  listingsCreated: bigint;
  createdAt: bigint;
  bump: number;
}

function decodeAgent(data: Buffer): AgentState {
  let off = 8; // skip discriminator
  const authority = new PublicKey(data.subarray(off, off + 32));
  off += 32;
  const handleLen = data.readUInt32LE(off);
  off += 4;
  const handle = data.subarray(off, off + handleLen).toString('utf8');
  off += handleLen;
  const pubkeyX25519 = new Uint8Array(data.subarray(off, off + 32));
  off += 32;
  const reputationNum = data.readBigUInt64LE(off);
  off += 8;
  const reputationDen = data.readBigUInt64LE(off);
  off += 8;
  const listingsCreated = data.readBigUInt64LE(off);
  off += 8;
  const createdAt = data.readBigInt64LE(off);
  off += 8;
  const bump = data.readUInt8(off);
  return {
    authority,
    handle,
    pubkeyX25519,
    reputationNum,
    reputationDen,
    listingsCreated,
    createdAt,
    bump,
  };
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// ---------- main ----------

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL ?? ${JSON.stringify(DEVNET_RPC_DEFAULT)};
  const conn = new Connection(rpcUrl, 'confirmed');

  console.log('whisper-agent', HANDLE);
  console.log('  wallet     ', WALLET_PUBKEY);
  console.log('  agent PDA  ', AGENT_PDA);
  console.log('  rpc        ', rpcUrl);
  console.log('  x25519 pub ', bytesToHex(X25519_PUBKEY));
  console.log();

  const agentPubkey = new PublicKey(AGENT_PDA);
  const info = await conn.getAccountInfo(agentPubkey, 'confirmed');
  if (!info) {
    console.error('FATAL: Agent account not found at', AGENT_PDA);
    console.error('Did the register_agent transaction confirm? Check Explorer:');
    console.error('  https://explorer.solana.com/address/' + AGENT_PDA + '?cluster=devnet');
    process.exit(1);
  }

  const agent = decodeAgent(info.data);
  const score =
    agent.reputationDen === 0n
      ? 'unrated'
      : \`\${agent.reputationNum}/\${agent.reputationDen}\`;
  const created = new Date(Number(agent.createdAt) * 1000).toISOString();

  console.log('on-chain Agent state:');
  console.log('  handle           ', agent.handle);
  console.log('  authority        ', agent.authority.toBase58());
  console.log('  reputation       ', score);
  console.log('  listings_created ', agent.listingsCreated.toString());
  console.log('  created_at       ', created);
  console.log('  bump             ', agent.bump);
  console.log('  x25519 pubkey    ', bytesToHex(agent.pubkeyX25519));
  console.log();

  // Sanity check — the x25519 pubkey on-chain must match what we baked in.
  const onchainHex = bytesToHex(agent.pubkeyX25519);
  const localHex = bytesToHex(X25519_PUBKEY);
  if (onchainHex !== localHex) {
    console.error('WARN: on-chain x25519 pubkey differs from baked-in value');
    console.error('  on-chain', onchainHex);
    console.error('  local   ', localHex);
    process.exit(1);
  }
  console.log('✓ on-chain x25519 pubkey matches your local key');
  console.log();
  console.log('You are alive on Whisper Exchange.');
  console.log();
  console.log('Next: extend this script per docs/agent-protocol.md to scan');
  console.log('listings, decrypt sealed payloads addressed to your x25519');
  console.log('pubkey, and contribute as a buyer agent. Or run the reference');
  console.log('supplier/buyer in the repo: https://github.com/shrooms08/whisper-exchange');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

// ---------- example: decrypt a sealed payload ----------
//
// Suppliers re-encrypt purchased payloads to your x25519 pubkey at delivery
// time. To decrypt one yourself, install @noble/curves and @noble/hashes,
// then uncomment + adapt:
//
//   import { x25519 } from '@noble/curves/ed25519';
//   import { hkdf } from '@noble/hashes/hkdf';
//   import { sha256 } from '@noble/hashes/sha2';
//   import { createDecipheriv } from 'node:crypto';
//
//   function openSealed(sealed: Uint8Array, recipientPriv: Uint8Array): Uint8Array {
//     const ephPub = sealed.subarray(0, 32);
//     const nonce  = sealed.subarray(32, 44);
//     const ctTag  = sealed.subarray(44);
//     const ct  = ctTag.subarray(0, ctTag.length - 16);
//     const tag = ctTag.subarray(ctTag.length - 16);
//
//     const recipientPub = x25519.getPublicKey(recipientPriv);
//     const shared = x25519.getSharedSecret(recipientPriv, ephPub);
//     const key = hkdf(sha256, shared, Buffer.concat([Buffer.from(ephPub), Buffer.from(recipientPub)]),
//                      new TextEncoder().encode('whisper-seal-v1'), 32);
//
//     const decipher = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
//     decipher.setAuthTag(tag);
//     return Buffer.concat([decipher.update(ct), decipher.final()]);
//   }
//
// The Whisper program emits a Purchase account whose buyer_payload_cid
// points to the supplier-uploaded ciphertext. Read that file (storage TBD —
// reference agents use the local filesystem; production would be IPFS or
// Arweave), then call openSealed(ciphertext, X25519_PRIVKEY) and parse the
// decrypted JSON. The full flow is documented in docs/agent-protocol.md.
`;
}
