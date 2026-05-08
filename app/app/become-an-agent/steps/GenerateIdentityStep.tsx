// Step 2 — Sign the onboarding message, derive an x25519 keypair from
// the signature, surface the public key for review.
//
// The private key never leaves React state — no DOM, no console, no
// persistence to localStorage / cookies / URL. Lives in a ref-and-state
// pair until Step 3 consumes it for the register_agent transaction
// (Day 7), at which point the parent retains it for Step 4's starter
// agent script generation.
//
// Determinism: ed25519 signing is RFC 8032-deterministic. Same wallet,
// same message → same signature → same x25519 keypair. The user can
// re-run this step on a fresh device and get identical bytes.

'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

import {
  ONBOARDING_MESSAGE,
  deriveX25519FromSignature,
  onboardingMessageBytes,
  type DerivedX25519,
} from '@/lib/wallet-onboarding';

export function GenerateIdentityStep({
  onAdvance,
}: {
  onAdvance: (derived: DerivedX25519) => void;
}) {
  const { signMessage, connected } = useWallet();

  const [derived, setDerived] = useState<DerivedX25519 | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onSign = async () => {
    if (!signMessage) {
      setError('this wallet does not support message signing');
      return;
    }
    setError(null);
    setSigning(true);
    try {
      const signature = await signMessage(onboardingMessageBytes());
      const result = deriveX25519FromSignature(signature);
      setDerived(result);
    } catch (err) {
      // Phantom + Solflare both throw a "user rejected" or similar.
      // Anything else (signature length wrong, etc.) falls into the same
      // catch — surface a short hint.
      const msg = String(err);
      if (/reject/i.test(msg)) {
        setError('Signing required to continue. Click Sign Message to retry.');
      } else {
        setError(msg.slice(0, 200));
      }
    } finally {
      setSigning(false);
    }
  };

  const onCopy = async () => {
    if (!derived) return;
    try {
      await navigator.clipboard.writeText(pubkeyBase58(derived.publicKey));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard API unavailable — silent */
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
      {/* Pre-sign: explanation + Sign button. */}
      {!derived && (
        <>
          <div
            className="wf"
            style={{
              padding: '12px 14px',
              background: '#0d0d12',
              fontSize: 11,
              color: 'var(--ink-2)',
              lineHeight: 1.55,
            }}
          >
            Your wallet will pop up asking you to sign:
            <div
              className="mono"
              style={{
                marginTop: 8,
                padding: '8px 10px',
                background: 'var(--paper)',
                color: 'var(--ink)',
                border: '1px solid var(--rule)',
                fontSize: 11,
              }}
            >
              {ONBOARDING_MESSAGE}
            </div>
            <div style={{ marginTop: 8, color: 'var(--ink-3)' }}>
              The signature derives your encryption keypair deterministically.
              Same wallet on any device produces the same identity, so there&apos;s
              nothing to back up. No transaction fee — this is an off-chain
              signature.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn"
              disabled={!connected || signing}
              onClick={onSign}
              style={{
                opacity: connected && !signing ? 1 : 0.5,
                cursor: connected && !signing ? 'pointer' : 'not-allowed',
              }}
            >
              {signing ? 'waiting for wallet…' : 'Sign Message'}
            </button>
          </div>
          {error && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--danger)' }}>
              {error}
            </div>
          )}
        </>
      )}

      {/* Post-sign: derived pubkey display + Continue. */}
      {derived && (
        <>
          <div
            className="wf"
            style={{
              padding: '12px 14px',
              background: '#0d0d12',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="label" style={{ minWidth: 88 }}>X25519 PUBKEY</span>
              <span
                className="addr mono"
                style={{ fontSize: 11, color: 'var(--ink)', wordBreak: 'break-all' }}
              >
                {pubkeyBase58(derived.publicKey)}
              </span>
              <button
                className="btn ghost"
                style={{ marginLeft: 'auto', fontSize: 9, padding: '3px 8px' }}
                onClick={onCopy}
              >
                {copied ? '✓ copied' : 'copy'}
              </button>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
              Derived deterministically from your wallet signature.
              Goes on-chain in Step 3 via <code>register_agent</code>.
              The matching private key stays in this browser session.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => onAdvance(derived)}>
              Continue →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Format an x25519 public key (32 bytes) as base58 for display. Solana's
// PublicKey class doesn't validate curve membership in its constructor —
// it just wraps 32 bytes and exposes toBase58(). x25519 keys aren't on
// the ed25519 curve but their byte representation encodes identically.
function pubkeyBase58(bytes: Uint8Array): string {
  return new PublicKey(bytes).toBase58();
}
