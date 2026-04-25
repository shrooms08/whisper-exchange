// Hardcoded mock data — steel-thread shell.
// Mirrors design-reference/data.jsx exactly. Will be replaced with on-chain reads
// once the user approves the chain-wiring step.

import type { SignalLite, ListingLite, TxLogEntry } from '../components/wireframe-parts';

export const MOCK_SIGNALS: SignalLite[] = [
  {
    id: 'sig-01',
    title: 'Whale swap detected · Raydium',
    body: 'Wallet 7xKX…Qh9 dumped 48,200 SOL into USDC across 3 pools.',
    meta: 'slot 287,491,203 · 14s ago',
    tag: 'WHALE',
  },
  {
    id: 'sig-02',
    title: 'Pool imbalance · Orca JUP/SOL',
    body: 'Reserve skew hit 71/29 after routed arb from Phoenix.',
    meta: 'slot 287,491,198 · 42s ago',
    tag: 'IMBAL',
  },
  {
    id: 'sig-03',
    title: 'New mint authority · WIF2',
    body: 'Metadata flagged: 8,500 holders in first 120s. Insider pattern.',
    meta: 'slot 287,491,150 · 2m ago',
    tag: 'MINT',
  },
];

export const MOCK_LISTINGS: ListingLite[] = [
  { id: 'L-0008', cat: 'WHALE', price: '2.40', rep: 5, seller: 'night-oracle' },
  { id: 'L-0007', cat: 'WHALE', price: '2.40', rep: 5, seller: 'night-oracle' },
  { id: 'L-0006', cat: 'WHALE', price: '2.40', rep: 5, seller: 'night-oracle' },
  { id: 'L-0005', cat: 'MEV', price: '5.80', rep: 4, seller: 'cipher-rook' },
  { id: 'L-0004', cat: 'MINT', price: '1.20', rep: 3, seller: 'fox-07' },
  { id: 'L-0003', cat: 'IMBAL', price: '0.80', rep: 2, seller: 'REDACTED' },
];

export const MOCK_TX_LOG: TxLogEntry[] = [
  { ts: '17:42:03', kind: 'SEALED', rest: 'L-0008 → buyer.0x91ae · 2.40 ◎ · envelope #e83', sig: '2RyjvyQd5LpgR7gGHSFesTnTUaJdNxqzvMNhAT9gxwxQCxaJkGh8dhwZLtm8QiVGdSnuxvQJskzeyQfS8P6ces9J' },
  { ts: '17:42:01', kind: 'LISTED', rest: 'L-0008 (cat=WHALE, rep=5) by night-oracle' },
  { ts: '17:41:58', kind: 'SIGNAL', rest: 'whale_swap.7xKX…Qh9 Δ=48,200 SOL slot 287,491,203' },
  { ts: '17:41:52', kind: 'DECRYPT', rest: 'L-0007 payload delivered → buyer.0x44df' },
  { ts: '17:41:50', kind: 'RATED', rest: 'L-0007 TIP_TRUE · outcome verified' },
  { ts: '17:41:49', kind: 'REP++', rest: 'night-oracle +0.12 (rep 4.00 → 4.12)' },
  { ts: '17:41:47', kind: 'SEALED', rest: 'L-0006 → buyer.0xb2c1 · 2.40 ◎' },
];
