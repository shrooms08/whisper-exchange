// Client-side wallet adapter wrapper. Wraps children in:
//
//   ConnectionProvider — exposes a Solana Connection (devnet, our QuickNode
//                        endpoint via NEXT_PUBLIC_QUICKNODE_RPC_URL with
//                        clusterApiUrl('devnet') as fallback).
//   WalletProvider     — registers wallet adapters (Phantom for now; the
//                        wallet adapter ecosystem auto-detects the rest via
//                        the Standard Wallet protocol).
//   WalletModalProvider — gives <WalletMultiButton> its modal.
//
// Used by app/layout.tsx via a thin <Providers> component (Next.js App
// Router pattern: server-rendered layout → client provider tree).

'use client';

import { useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

import '@solana/wallet-adapter-react-ui/styles.css';

const FALLBACK_ENDPOINT = clusterApiUrl('devnet');

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // QuickNode devnet — exposed client-side via NEXT_PUBLIC_QUICKNODE_RPC_URL.
  // Acceptable per Day 5 design: it's a devnet read endpoint, and the same
  // URL is already shipped to every visitor through /api/chain's reads.
  // Falls back to the public devnet cluster if the env var is missing so
  // the dev experience stays smooth in fresh checkouts.
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_QUICKNODE_RPC_URL ?? FALLBACK_ENDPOINT,
    [],
  );

  // Wallet adapters. Phantom + Solflare registered explicitly so the modal
  // surfaces them by name even on browsers without the wallet extension
  // installed (the adapter falls back to a "Detected" state on click).
  // Other wallet-standard wallets (Backpack, Glow, etc.) get picked up
  // automatically at runtime via the standard wallet protocol.
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
