// Normalize a Helius enhanced webhook event that already passed the threshold
// filter into the supplier's internal Signal shape (agents/signals.ts), with
// an extra `source` field so logs can distinguish real events from mock ones.
//
// The supplier consumes Signal as-is — no change to its evaluation logic.

import type { Signal, SignalCategory } from '../signals.js';
import { SOL_MINT, STABLE_MINTS, type FilterResult, type HeliusEvent } from './signal-filter.js';

export interface SourcedSignal extends Signal {
  source: 'helius' | 'mock';
  slot?: number;
}

const HUMAN_LABEL: Record<string, string> = {
  [SOL_MINT]: 'SOL',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
};

function labelMint(mint: string | undefined): string {
  if (!mint) return 'unknown';
  return HUMAN_LABEL[mint] ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function describeRoute(event: HeliusEvent): string {
  const transfers = event.tokenTransfers ?? [];
  if (transfers.length < 2) return 'unknown route';
  const first = transfers[0]!;
  const last = transfers[transfers.length - 1]!;
  return `${labelMint(first.mint)} → ${labelMint(last.mint)}`;
}

export function normalize(event: HeliusEvent, filter: FilterResult): SourcedSignal {
  const sig = event.signature ?? `unknown-${Date.now()}`;
  const sourceProgram = event.source ?? event.type ?? 'SWAP';
  const route = describeRoute(event);

  // Real-source events all classify as WHALE for v1. Future work: classify
  // MEV (sandwich pattern) vs WHALE (bare large swap) vs IMBAL (pool
  // imbalance) by inspecting tx structure.
  const category: SignalCategory = 'WHALE';

  return {
    id: `helius-${sig.slice(0, 16)}`,
    category,
    signal_ref: `slot ${event.slot ?? 0} sig ${sig}`,
    claim: `Whale swap detected on ${sourceProgram}: ${route} (${filter.matchedLeg ?? 'matched'})`,
    evidence: [
      {
        kind: 'helius_swap',
        signature: sig,
        slot: event.slot,
        source_program: sourceProgram,
        matched_leg: filter.matchedLeg,
        token_transfers: event.tokenTransfers ?? [],
        native_transfers: event.nativeTransfers ?? [],
      },
    ],
    recommended_action: 'monitor following slots for price impact',
    emitted_at: Date.now(),
    source: 'helius',
    slot: event.slot,
  };
}
