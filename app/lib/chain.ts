// Server-side chain reads. Runs only inside Next.js API routes; HELIUS_API_KEY
// is NOT exposed to the client bundle.

import 'server-only';

import { AnchorProvider, Program, web3 } from '@coral-xyz/anchor';
import type { Idl, Wallet } from '@coral-xyz/anchor';

import idlJson from './whisper-idl.json';

export const PROGRAM_ID = new web3.PublicKey(
  '6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H',
);

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
if (!HELIUS_API_KEY) {
  console.warn(
    '[chain] HELIUS_API_KEY missing in env; falling back to public devnet RPC. ' +
      'gPA calls will likely 429.',
  );
}
const RPC_URL = HELIUS_API_KEY
  ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'https://api.devnet.solana.com';

const connection = new web3.Connection(RPC_URL, 'confirmed');

// Read-only provider — no real wallet. Anchor's Program needs *some* wallet to
// satisfy the type, but we never sign. The dummy keypair is generated once at
// module load and never used.
const dummyWallet = {
  publicKey: web3.Keypair.generate().publicKey,
  signTransaction: async () => {
    throw new Error('read-only');
  },
  signAllTransactions: async () => {
    throw new Error('read-only');
  },
} as unknown as Wallet;

const provider = new AnchorProvider(connection, dummyWallet, {
  commitment: 'confirmed',
});

export const program = new Program(idlJson as Idl, provider);

// ---------- fetchAllSafe (port of agents/anchor-helpers.ts) ----------

export interface SafeAccount<T> {
  publicKey: web3.PublicKey;
  account: T;
}

export interface SafeAllResult<T> {
  results: SafeAccount<T>[];
  skipped: number;
}

// Anchor 0.31 client normalizes IDL account names to camelCase internally —
// passing PascalCase like 'Listing' throws "Account not found". Always
// lowercase the first letter before talking to coder.accounts.
async function fetchAllSafe<T = unknown>(accountName: string): Promise<SafeAllResult<T>> {
  const camel = accountName.charAt(0).toLowerCase() + accountName.slice(1);
  const memcmp = (program.coder.accounts as any).memcmp(camel);
  const raw = await connection.getProgramAccounts(program.programId, {
    filters: [{ memcmp: { offset: memcmp.offset ?? 0, bytes: memcmp.bytes } }],
  });
  const results: SafeAccount<T>[] = [];
  let skipped = 0;
  for (const { pubkey, account } of raw) {
    try {
      const decoded = program.coder.accounts.decode<T>(camel, account.data);
      results.push({ publicKey: pubkey, account: decoded });
    } catch {
      skipped += 1;
    }
  }
  return { results, skipped };
}

export const fetchListings = () => fetchAllSafe<any>('Listing');
export const fetchPurchases = () => fetchAllSafe<any>('Purchase');
export const fetchAgents = () => fetchAllSafe<any>('Agent');
export const fetchRatings = () => fetchAllSafe<any>('Rating');
export const fetchCurrentSlot = () => connection.getSlot('confirmed');
