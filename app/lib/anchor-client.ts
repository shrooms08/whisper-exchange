// Browser-side Anchor Program factory for the connected wallet.
//
// `lib/chain.ts` already builds a Program for read-only server-side use
// with a dummy wallet. This module is for *write* operations from the
// browser — the connected wallet adapter signs, the user's RPC connection
// is the same one the wallet adapter handed us via useConnection().
//
// The IDL JSON ships alongside this module (lib/whisper-idl.json) so the
// Vercel build doesn't reach into programs/. Type information comes from
// lib/idl/whisper-types.ts (Anchor's anchor build emits both).

import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import type { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

import idlJson from './whisper-idl.json';
import type { Whisper } from './idl/whisper-types';

/**
 * Minimal wallet shape the AnchorProvider expects. Matches what the wallet
 * adapter returns from useWallet() once a wallet is connected — pubkey
 * plus the two sign methods (signTransaction + signAllTransactions).
 */
export interface AnchorWalletLike {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(
    txs: T[],
  ) => Promise<T[]>;
}

/**
 * Build an Anchor Program tied to the connected wallet. Caller passes the
 * Connection + wallet from the wallet adapter hooks; the Program returned
 * is ready to issue `program.methods.foo(...).accounts({...}).rpc()` calls
 * that pop the wallet's signing UI.
 */
export function buildProgram(
  connection: Connection,
  wallet: AnchorWalletLike,
): Program<Whisper> {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  return new Program(idlJson as Idl, provider) as unknown as Program<Whisper>;
}
