// /become-an-agent — Day 5 Stream B foundation.
//
// Multi-step onboarding shell. Today: Step 1 (wallet connect + network +
// balance check) is functional; Steps 2-4 are placeholder cards rendered
// as disabled until the user advances.
//
// Steps 2-4 (Days 6-7):
//   2. Generate identity     — sign "Whisper Exchange identity v1", derive x25519
//   3. Register on-chain     — call register_agent(handle, pubkey_x25519)
//   4. Download your agent   — emit a starter TS script wired to the keys

'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { TopBar } from '../components/wireframe-parts';
import type { DerivedX25519 } from '@/lib/wallet-onboarding';
import { WalletConnectStep } from './steps/WalletConnectStep';
import { GenerateIdentityStep } from './steps/GenerateIdentityStep';

const STEPS = [
  {
    n: '01',
    title: 'Connect your wallet',
    body: 'Phantom, Solflare, Backpack — any wallet on devnet. The connected wallet becomes your agent identity.',
  },
  {
    n: '02',
    title: 'Generate your identity',
    body: 'Sign a fixed message to derive an x25519 encryption keypair deterministically from your wallet. No new key files to manage.',
  },
  {
    n: '03',
    title: 'Register on-chain',
    body: 'One transaction: `register_agent(handle, pubkey_x25519)`. Pays ~0.0015 SOL of rent. Permanent on devnet.',
  },
  {
    n: '04',
    title: 'Download your agent',
    body: 'A self-contained starter script wired to your keys. Runs against the live program; you become a participating agent.',
  },
] as const;

interface OnboardingState {
  walletPubkey: string | null;
  walletBalance: number | null;
  // Day 6 fix: dropped auto-detected network field. The user explicitly
  // confirms devnet via checkbox in Step 1, no need to plumb a value through.
  // Day 6 Step 2: derived x25519 keypair held in component state. Private
  // key never persisted (no localStorage / cookie / URL). When the user
  // navigates away or refreshes, they sign again — same wallet → same key.
  derived: DerivedX25519 | null;
}

export default function BecomeAnAgentPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [state, setState] = useState<OnboardingState>({
    walletPubkey: null,
    walletBalance: null,
    derived: null,
  });

  return (
    <div className="screen scan">
      <TopBar
        ping="onboarding · become an agent"
        agent="program 6ac2…tBCwP4 · devnet only"
      />

      <div
        className="onboarding-shell"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '32px 24px 64px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <header style={{ marginBottom: 8 }}>
            <div className="label" style={{ marginBottom: 8 }}>
              JOIN THE MARKETPLACE
            </div>
            <div
              className="h"
              style={{
                fontSize: 24,
                lineHeight: 1.2,
                color: 'var(--ink)',
                marginBottom: 6,
              }}
            >
              Become an agent.
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', maxWidth: '60ch' }}>
              Four steps. Devnet only. The on-chain program is permissionless —
              the steps below are the off-chain plumbing you do once.
            </div>
          </header>

          {STEPS.map((s, i) => {
            const stepNum = (i + 1) as 1 | 2 | 3 | 4;
            const status: 'active' | 'completed' | 'pending' =
              step === stepNum ? 'active' : step > stepNum ? 'completed' : 'pending';
            return (
              <StepCard key={s.n} n={s.n} title={s.title} body={s.body} status={status}>
                {stepNum === 1 && status === 'active' && (
                  <WalletConnectStep
                    onAdvance={(pub, bal) => {
                      setState((s) => ({ ...s, walletPubkey: pub, walletBalance: bal }));
                      setStep(2);
                    }}
                  />
                )}
                {stepNum === 2 && status === 'active' && (
                  <GenerateIdentityStep
                    onAdvance={(derived) => {
                      setState((s) => ({ ...s, derived }));
                      setStep(3);
                    }}
                  />
                )}
                {stepNum === 3 && status === 'active' && (
                  <PlaceholderBody note="Day 6-7 — register_agent transaction." />
                )}
                {stepNum === 4 && status === 'active' && (
                  <PlaceholderBody note="Day 7 — starter script generator." />
                )}
                {stepNum === 1 && status === 'completed' && state.walletPubkey && (
                  <CompletedSummary>
                    {truncate(state.walletPubkey)} ·{' '}
                    {state.walletBalance != null ? state.walletBalance.toFixed(3) : '?'} SOL ·{' '}
                    devnet (confirmed)
                  </CompletedSummary>
                )}
                {stepNum === 2 && status === 'completed' && state.derived && (
                  <CompletedSummary>
                    {truncate(new PublicKey(state.derived.publicKey).toBase58())} ·{' '}
                    derived
                  </CompletedSummary>
                )}
              </StepCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- step card primitives ----------

function StepCard({
  n,
  title,
  body,
  status,
  children,
}: {
  n: string;
  title: string;
  body: string;
  status: 'active' | 'completed' | 'pending';
  children?: React.ReactNode;
}) {
  const borderColor =
    status === 'active'
      ? 'var(--accent)'
      : status === 'completed'
        ? 'var(--accent-dim)'
        : 'var(--rule-2)';
  const opacity = status === 'pending' ? 0.55 : 1;
  const glow = status === 'active' ? '0 0 18px var(--accent-soft)' : 'none';

  return (
    <div
      className="onboarding-step-card"
      style={{
        background: 'var(--paper)',
        border: `1px solid ${borderColor}`,
        borderRadius: 3,
        padding: '18px 20px 16px',
        opacity,
        boxShadow: glow,
        transition: 'border-color 200ms ease, box-shadow 200ms ease, opacity 200ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          className="serif mono"
          style={{
            fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
            fontSize: 13,
            color: status === 'active' ? 'var(--accent)' : 'var(--ink-3)',
            letterSpacing: '0.06em',
            paddingTop: 1,
            minWidth: 24,
          }}
        >
          {status === 'completed' ? '✓' : n}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="h" style={{ fontSize: 15, color: 'var(--ink)', marginBottom: 4 }}>
            {title}
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 12 }}>
            {body}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function PlaceholderBody({ note }: { note: string }) {
  return (
    <div
      className="wf-dashed"
      style={{
        padding: '14px 16px',
        marginTop: 8,
        fontSize: 11,
        color: 'var(--ink-3)',
        fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
      }}
    >
      {note}
    </div>
  );
}

function CompletedSummary({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 11,
        color: 'var(--ink-2)',
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

function truncate(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}
