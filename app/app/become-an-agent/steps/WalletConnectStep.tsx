// Step 1 — Connect wallet, confirm devnet, check balance, advance.
//
// Plumbing:
//   - <WalletMultiButton> from @solana/wallet-adapter-react-ui handles
//     install-prompts, connect, disconnect.
//   - useWallet() exposes the connected pubkey + adapter state.
//   - useConnection() gives us the Connection bound to whichever endpoint
//     WalletProvider was constructed with (devnet QuickNode in our case).
//
// Network confirmation: Day 5's first attempt used connection.getGenesisHash()
// to auto-detect the wallet's network. It always returned the *app's* RPC
// genesis hash (devnet QuickNode), not the wallet's actual selected network
// — Solflare on mainnet showed green "devnet" anyway, false positive.
//
// Wallet Standard's chains[] also doesn't help: Phantom + Solflare both
// advertise support for ['solana:mainnet','solana:devnet','solana:testnet']
// regardless of the user's selection, as a privacy/security choice. There's
// no cross-wallet way to read the *active* network from a dapp's side.
//
// So we ship explicit user confirmation: a checkbox the user ticks after
// switching their wallet to devnet. Bulletproof, no false positives, and
// honest about the constraint. Helper text points at the wallet's settings.

'use client';

import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const MIN_SOL = 0.01;

export function WalletConnectStep({
  onAdvance,
}: {
  onAdvance: (pubkey: string, balanceSol: number) => void;
}) {
  const { connection } = useConnection();
  const { publicKey, connected, wallet } = useWallet();

  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [networkConfirmed, setNetworkConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh balance whenever the wallet pubkey changes or first connects.
  useEffect(() => {
    if (!publicKey) {
      setBalanceSol(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        if (cancelled) return;
        setBalanceSol(lamports / LAMPORTS_PER_SOL);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(`balance read failed: ${String(err).slice(0, 120)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, connection]);

  // If the user disconnects, reset the network confirmation so they have to
  // re-tick after reconnecting (covers the "switch wallet, forgot to flip
  // network" case).
  useEffect(() => {
    if (!connected) setNetworkConfirmed(false);
  }, [connected]);

  const onCopy = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore — not all browsers expose clipboard API */
    }
  };

  const balanceOk = balanceSol != null && balanceSol >= MIN_SOL;
  const canContinue = connected && networkConfirmed && balanceOk && !loading;

  // Wallet-specific help text for the network switch. Only Phantom and
  // Solflare are explicitly registered in WalletProvider; everyone else
  // gets a generic line.
  const walletName = wallet?.adapter.name ?? 'your wallet';
  const switchHelp =
    walletName === 'Phantom'
      ? 'Phantom → Settings (gear) → Developer Settings → Testnet Mode → Devnet'
      : walletName === 'Solflare'
        ? 'Solflare → Settings → Network → Devnet'
        : `In ${walletName}, switch the network to Solana devnet.`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
      {/* Connect / disconnect button. The wallet adapter UI provides its own
          modal; we just style the button to fit the dashboard aesthetic by
          overriding via CSS class scope (see globals.css). */}
      <div className="onboarding-wallet-button" style={{ display: 'flex' }}>
        <WalletMultiButton />
      </div>

      {/* Connection summary — only shown post-connect. */}
      {connected && publicKey && (
        <div
          className="wf"
          style={{
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: '#0d0d12',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label" style={{ minWidth: 60 }}>WALLET</span>
            <span
              className="addr mono"
              style={{ fontSize: 11, color: 'var(--ink)', wordBreak: 'break-all' }}
            >
              {publicKey.toBase58()}
            </span>
            <button
              className="btn ghost"
              style={{ marginLeft: 'auto', fontSize: 9, padding: '3px 8px' }}
              onClick={onCopy}
            >
              {copied ? '✓ copied' : 'copy'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label" style={{ minWidth: 60 }}>BALANCE</span>
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: balanceOk ? 'var(--ok)' : 'var(--danger)',
              }}
            >
              {loading
                ? '…'
                : balanceSol != null
                  ? `${balanceSol.toFixed(4)} SOL`
                  : '—'}
              {!loading && balanceSol != null && !balanceOk && (
                <span className="mono" style={{ color: 'var(--ink-3)', marginLeft: 8 }}>
                  ⚠ minimum {MIN_SOL} SOL required
                </span>
              )}
            </span>
          </div>

          {/* Network confirmation checkbox. We can't reliably read the
              wallet's active network from a dapp (Phantom + Solflare both
              hide it), so the honest UX is to ask the user to confirm
              after they've switched. Resets on disconnect/reconnect. */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '6px 0 0',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={networkConfirmed}
              onChange={(e) => setNetworkConfirmed(e.target.checked)}
              style={{
                marginTop: 2,
                accentColor: 'var(--accent)',
                width: 13,
                height: 13,
                cursor: 'pointer',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink)' }}>
                I confirm my wallet is set to Solana <strong>devnet</strong>
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {switchHelp}
              </span>
            </div>
          </label>
        </div>
      )}

      {error && (
        <div className="mono" style={{ fontSize: 10, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button
          className={canContinue ? 'btn' : 'btn ghost'}
          disabled={!canContinue}
          style={{
            opacity: canContinue ? 1 : 0.5,
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
          onClick={() => {
            if (!canContinue || !publicKey || balanceSol == null) return;
            onAdvance(publicKey.toBase58(), balanceSol);
          }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
