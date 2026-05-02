// Native-token threshold filter for incoming Helius SWAP events.
//
// Catches "whale" trades by inspecting the parsed tokenTransfers[] array
// for a SOL leg ≥ 100 SOL or a stable leg ≥ 25k USDC/USDT. No price oracle,
// no external dependency — pure function over the Helius enhanced payload.

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const STABLE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT mainnet
]);

const SOL_DECIMALS = 9;
const STABLE_DECIMALS = 6;
const SOL_THRESHOLD = 100 * 10 ** SOL_DECIMALS; // 100 SOL in lamports
const STABLE_THRESHOLD = 25_000 * 10 ** STABLE_DECIMALS; // 25k base units

export interface FilterResult {
  passes: boolean;
  reason?: string;
  matchedLeg?: string;
}

// Helius enhanced webhook tokenTransfer entry. Only the fields we use.
export interface TokenTransfer {
  mint?: string;
  tokenAmount?: number | string;
  fromUserAccount?: string;
  toUserAccount?: string;
  fromTokenAccount?: string;
  toTokenAccount?: string;
}

export interface HeliusEvent {
  signature?: string;
  slot?: number;
  timestamp?: number;
  type?: string;
  source?: string;
  description?: string;
  tokenTransfers?: TokenTransfer[];
  nativeTransfers?: { fromUserAccount?: string; toUserAccount?: string; amount?: number }[];
}

// Helius reports tokenAmount in human units (e.g. 120.5 SOL, not lamports).
// Converted to integer base units for threshold comparison.
function toBaseUnits(amount: number | string | undefined, decimals: number): number {
  if (amount === undefined || amount === null) return 0;
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * 10 ** decimals);
}

export function passesThreshold(event: HeliusEvent): FilterResult {
  const transfers = event.tokenTransfers ?? [];

  for (const t of transfers) {
    if (!t.mint) continue;

    if (t.mint === SOL_MINT) {
      const lamports = toBaseUnits(t.tokenAmount, SOL_DECIMALS);
      if (lamports >= SOL_THRESHOLD) {
        return { passes: true, matchedLeg: `SOL:${lamports}` };
      }
    } else if (STABLE_MINTS.has(t.mint)) {
      const base = toBaseUnits(t.tokenAmount, STABLE_DECIMALS);
      if (base >= STABLE_THRESHOLD) {
        return { passes: true, matchedLeg: `${t.mint}:${base}` };
      }
    }
  }

  // Also inspect nativeTransfers — Jupiter sometimes reports SOL as a native
  // SOL transfer rather than a wrapped-SOL token transfer.
  for (const n of event.nativeTransfers ?? []) {
    const lamports = n.amount ?? 0;
    if (lamports >= SOL_THRESHOLD) {
      return { passes: true, matchedLeg: `nativeSOL:${lamports}` };
    }
  }

  return { passes: false, reason: 'below_threshold' };
}
