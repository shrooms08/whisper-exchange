// register_agent — browser-side wrapper around the Anchor instruction.
//
// Mirrors what agents/supplier.ts does at startup (ensureRegistered), but
// the signer is the connected wallet rather than a local keypair file.
// Pre-flight checks rule out the two common error classes (already
// registered, insufficient funds) before pushing a tx the user'd just
// have to reject.

import { BN, web3 } from '@coral-xyz/anchor';
import type { Program } from '@coral-xyz/anchor';
import type { Connection, PublicKey } from '@solana/web3.js';
import type { Whisper } from './idl/whisper-types';

const AGENT_SEED = new TextEncoder().encode('agent');
// Conservative upper bound on rent + fees for a freshly-registered Agent.
// Real cost lands ~0.0015 SOL; this is the floor we refuse to attempt below.
const MIN_LAMPORTS = 2_000_000;

export interface RegisterAgentInput {
  program: Program<Whisper>;
  connection: Connection;
  wallet: { publicKey: PublicKey };
  handle: string;
  x25519PublicKey: Uint8Array;
}

export interface RegisterAgentResult {
  signature: string;
  agentPda: PublicKey;
  explorerUrl: string;
}

/**
 * Discriminated error type. Caller switches on `kind` to pick the right
 * UI copy. Anything we don't recognize bubbles up as `kind: 'unknown'`
 * with the raw message preserved.
 */
export type RegisterAgentError =
  | { kind: 'invalid_handle'; message: string }
  | { kind: 'already_registered'; agentPda: PublicKey }
  | { kind: 'insufficient_funds'; haveLamports: number; needLamports: number }
  | { kind: 'user_rejected'; message: string }
  | { kind: 'unknown'; message: string };

/**
 * Derive the Agent PDA for a given wallet authority. Mirrors the program's
 * `[b"agent", authority.key().as_ref()]` seed — same as
 * agents/supplier.ts agentPda().
 */
export function deriveAgentPda(
  programId: PublicKey,
  authority: PublicKey,
): [PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [AGENT_SEED, authority.toBuffer()],
    programId,
  );
}

const HANDLE_RE = /^[A-Za-z0-9_-]{3,32}$/;

/**
 * Throws RegisterAgentError if the input fails validation. Returns
 * normalized handle on success. Pure, no I/O.
 */
export function validateHandle(handle: string): string {
  const trimmed = handle.trim();
  if (!HANDLE_RE.test(trimmed)) {
    throw {
      kind: 'invalid_handle',
      message:
        'Handle must be 3-32 characters, alphanumeric plus dash or underscore.',
    } satisfies RegisterAgentError;
  }
  return trimmed;
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAddressUrl(pda: PublicKey): string {
  return `https://explorer.solana.com/address/${pda.toBase58()}?cluster=devnet`;
}

/**
 * Submit register_agent. Pre-flight: balance + uniqueness. On success,
 * resolves with signature + PDA + explorer URL. On failure, rejects with
 * a RegisterAgentError discriminated union.
 */
export async function registerAgent({
  program,
  connection,
  wallet,
  handle,
  x25519PublicKey,
}: RegisterAgentInput): Promise<RegisterAgentResult> {
  // 1. Validate inputs first so we don't waste an RPC round-trip.
  validateHandle(handle);
  if (x25519PublicKey.length !== 32) {
    throw {
      kind: 'unknown',
      message: `Internal: x25519 pubkey must be 32 bytes, got ${x25519PublicKey.length}`,
    } satisfies RegisterAgentError;
  }

  const [agentPda] = deriveAgentPda(program.programId, wallet.publicKey);

  // 2. Already-registered check — single getAccountInfo call.
  const existing = await connection.getAccountInfo(agentPda, 'confirmed');
  if (existing) {
    throw {
      kind: 'already_registered',
      agentPda,
    } satisfies RegisterAgentError;
  }

  // 3. Balance pre-flight. Cheap; saves the user from the wallet popup
  // when we know the tx will fail anyway.
  const lamports = await connection.getBalance(wallet.publicKey, 'confirmed');
  if (lamports < MIN_LAMPORTS) {
    throw {
      kind: 'insufficient_funds',
      haveLamports: lamports,
      needLamports: MIN_LAMPORTS,
    } satisfies RegisterAgentError;
  }

  // 4. Build + submit. Same shape as agents/supplier.ts — Anchor's TS
  // client camelCases the rust snake_case method.
  let signature: string;
  try {
    signature = await program.methods
      .registerAgent(handle, Array.from(x25519PublicKey))
      .accounts({
        agent: agentPda,
        authority: wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      } as Parameters<ReturnType<typeof program.methods.registerAgent>['accounts']>[0])
      .rpc();
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    // WalletSendTransactionError / "User rejected the request." / "User canceled"
    if (/reject|cancel|denied|declined/i.test(message)) {
      throw {
        kind: 'user_rejected',
        message: 'Signing canceled. Click Register to try again.',
      } satisfies RegisterAgentError;
    }
    throw {
      kind: 'unknown',
      message,
    } satisfies RegisterAgentError;
  }

  // Cheap suppress of unused BN import warning; BN is re-exported from
  // anchor and may be needed if we add fields with BN args later.
  void BN;

  return {
    signature,
    agentPda,
    explorerUrl: explorerTxUrl(signature),
  };
}
