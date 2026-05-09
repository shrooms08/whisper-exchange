// Step 3 — pick a handle, pop the wallet for register_agent, surface
// transaction signature + Explorer link on success.
//
// The flow is intentionally one-button: the user types a handle, hits
// Register, the wallet adapter pops, the tx submits, the panel flips to
// success. Pre-flight checks (already-registered + balance) run before
// the wallet popup so the user only sees the wallet prompt for actually
// signable transactions.

'use client';

import { useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

import { buildProgram, type AnchorWalletLike } from '@/lib/anchor-client';
import {
  deriveAgentPda,
  explorerAddressUrl,
  explorerTxUrl,
  registerAgent,
  type RegisterAgentError,
} from '@/lib/register-agent';
import type { DerivedX25519 } from '@/lib/wallet-onboarding';

const HANDLE_RE = /^[A-Za-z0-9_-]{0,32}$/;

export interface RegisterResult {
  handle: string;
  agentPda: PublicKey;
  // Null when the user claimed an existing on-chain Agent rather than
  // registering a fresh one. UI renders "(registered previously)" instead
  // of a tx-explorer link.
  signature: string | null;
  explorerUrl: string | null;
  isExisting: boolean;
}

export function RegisterStep({
  derived,
  onAdvance,
}: {
  derived: DerivedX25519;
  onAdvance: (r: RegisterResult) => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [handle, setHandle] = useState('');
  const [phase, setPhase] = useState<
    'idle' | 'waiting' | 'submitting' | 'confirming' | 'success' | 'error'
  >('idle');
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [existingPda, setExistingPda] = useState<PublicKey | null>(null);
  // Set when an "already registered" error fires AND the on-chain
  // pubkey_x25519 matches the user's just-derived x25519. Triggers the
  // "Continue with existing agent" panel.
  const [existingClaim, setExistingClaim] = useState<{
    handle: string;
    agentPda: PublicKey;
  } | null>(null);

  const handleValid = handle.length >= 3 && HANDLE_RE.test(handle);

  // The wallet adapter exposes signTransaction + signAllTransactions only
  // when a wallet is connected and the adapter has hydrated. AnchorProvider
  // needs both. We narrow the union here so the call site is clean.
  const anchorWallet = useMemo<AnchorWalletLike | null>(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return null;
    }
    return {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction.bind(wallet),
      signAllTransactions: wallet.signAllTransactions.bind(wallet),
    };
  }, [wallet]);

  const onClickRegister = async () => {
    if (!anchorWallet) {
      setErrorMsg('Wallet not connected. Reconnect and try again.');
      setPhase('error');
      return;
    }
    if (!handleValid) {
      setErrorMsg('Handle must be 3-32 characters: letters, digits, dash, underscore.');
      setPhase('error');
      return;
    }

    setErrorMsg(null);
    setExistingPda(null);
    setPhase('waiting');

    try {
      const program = buildProgram(connection, anchorWallet);
      // Once we await the rpc() call we transition through submitting →
      // confirming. We don't have fine-grained hooks, so display copy
      // covers the realistic gap.
      setPhase('submitting');
      const r = await registerAgent({
        program,
        connection,
        wallet: { publicKey: anchorWallet.publicKey },
        handle,
        x25519PublicKey: derived.publicKey,
      });
      setPhase('confirming');
      // rpc() already returned the confirmed sig — short delay just gives
      // the eye time to read the "confirming" state before we flip to
      // success. Skipped if the user disabled animations etc.
      await new Promise((res) => setTimeout(res, 200));

      const result: RegisterResult = {
        handle,
        signature: r.signature,
        agentPda: r.agentPda,
        explorerUrl: r.explorerUrl,
        isExisting: false,
      };
      setResult(result);
      setPhase('success');
    } catch (err) {
      const e = err as RegisterAgentError;
      setPhase('error');
      switch (e.kind) {
        case 'already_registered': {
          setExistingPda(e.agentPda);
          // Try to claim the existing agent if its on-chain x25519 pubkey
          // matches the one the user just derived in Step 2 (same wallet,
          // same onboarding message → same x25519). If the bytes don't
          // match, the existing agent was registered from a different
          // browser flow and we can't safely hand its private key out
          // here, so we keep the plain error UI.
          try {
            if (!anchorWallet) throw new Error('wallet went away');
            const program = buildProgram(connection, anchorWallet);
            const onchain = (await (program.account as any).agent.fetch(
              e.agentPda,
            )) as { handle: string; pubkeyX25519: number[] };
            const onchainX25519 = Uint8Array.from(onchain.pubkeyX25519);
            const matches =
              onchainX25519.length === derived.publicKey.length &&
              onchainX25519.every((b, i) => b === derived.publicKey[i]);
            if (matches) {
              setExistingClaim({ handle: onchain.handle, agentPda: e.agentPda });
              setErrorMsg(null);
            } else {
              setErrorMsg(
                'This wallet has an existing agent registered with a different x25519 pubkey. ' +
                  'Re-derive identity (Step 2) with the same wallet that originally registered, ' +
                  'or connect a different wallet.',
              );
            }
          } catch {
            // RPC flake or fetch failure — fall back to the plain error UI.
            setErrorMsg(
              'This wallet already has an agent registered. Reuse it, or connect a different wallet.',
            );
          }
          break;
        }
        case 'insufficient_funds':
          setErrorMsg(
            `Need at least ${(e.needLamports / 1e9).toFixed(4)} SOL for registration; ` +
              `wallet has ${(e.haveLamports / 1e9).toFixed(4)} SOL.`,
          );
          break;
        case 'user_rejected':
          setErrorMsg(e.message);
          break;
        case 'invalid_handle':
          setErrorMsg(e.message);
          break;
        default:
          setErrorMsg(`Network issue. Click Register to retry. (${e.message?.slice(0, 120)})`);
      }
    }
  };

  // Pre-derive the PDA the wallet WOULD register against, just so the user
  // can see what address they'll own before signing. Cheap, all client-side.
  // Program ID is the live devnet deploy (also baked into idl/whisper-types.ts).
  const programId = useMemo(
    () => new PublicKey('6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H'),
    [],
  );
  const realPda = anchorWallet
    ? deriveAgentPda(programId, anchorWallet.publicKey)[0]
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
      {phase !== 'success' && (
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
            Pick a handle for your agent. This is the display name that
            shows up in listings and on the dashboard.
            <div style={{ marginTop: 10 }}>
              <input
                type="text"
                value={handle}
                onChange={(e) => {
                  const v = e.target.value;
                  if (HANDLE_RE.test(v)) setHandle(v);
                }}
                placeholder="my-agent-handle"
                disabled={phase === 'waiting' || phase === 'submitting' || phase === 'confirming'}
                className="mono"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'var(--paper)',
                  color: 'var(--ink)',
                  border: '1px solid var(--rule)',
                  borderRadius: 2,
                  fontSize: 12,
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  outline: 'none',
                }}
              />
              <div
                className="mono"
                style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}
              >
                3-32 chars · letters, digits, dash, underscore
              </div>
            </div>

            {realPda && (
              <div
                style={{
                  marginTop: 12,
                  padding: '8px 10px',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: 2,
                }}
              >
                <div
                  className="label"
                  style={{ marginBottom: 4 }}
                >
                  AGENT PDA (preview)
                </div>
                <div
                  className="addr mono"
                  style={{ fontSize: 10, color: 'var(--ink-2)', wordBreak: 'break-all' }}
                >
                  {realPda.toBase58()}
                </div>
              </div>
            )}

            <div style={{ marginTop: 10, color: 'var(--ink-3)', fontSize: 10 }}>
              Creates an Agent account on-chain. One-time rent of ~0.0015 SOL,
              paid by the connected wallet. Permanent on devnet.
            </div>
          </div>

          {errorMsg && (
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--danger)',
                padding: '8px 10px',
                border: '1px solid var(--danger)',
                borderRadius: 2,
                background: 'rgba(255, 80, 80, 0.06)',
              }}
            >
              {errorMsg}
              {existingPda && (
                <div style={{ marginTop: 6 }}>
                  Existing PDA:{' '}
                  <a
                    href={explorerAddressUrl(existingPda)}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ color: 'var(--accent)' }}
                  >
                    {existingPda.toBase58().slice(0, 8)}…{existingPda.toBase58().slice(-8)} ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {existingClaim && (
            <div
              className="wf"
              style={{
                padding: '12px 14px',
                background: '#0d0d12',
                borderColor: 'var(--accent)',
                boxShadow: '0 0 12px var(--accent-soft)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>↺</span>
                <span>
                  This wallet has an existing agent. You can continue with it.
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="label" style={{ minWidth: 70 }}>HANDLE</span>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--ink)', fontWeight: 600 }}
                >
                  {existingClaim.handle}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="label" style={{ minWidth: 70 }}>AGENT PDA</span>
                <a
                  href={explorerAddressUrl(existingClaim.agentPda)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="addr mono"
                  style={{ fontSize: 10, color: 'var(--accent)', wordBreak: 'break-all' }}
                >
                  {existingClaim.agentPda.toBase58()} ↗
                </a>
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                On-chain x25519 pubkey matches your derived key — your starter
                script will decrypt sealed payloads addressed to this agent.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  className="btn"
                  onClick={() => {
                    // Don't transition through 'success' phase — the success
                    // panel renders a tx signature, which doesn't exist here.
                    // Hand straight to the parent; Step 3 unmounts on switch.
                    onAdvance({
                      handle: existingClaim.handle,
                      agentPda: existingClaim.agentPda,
                      signature: null,
                      explorerUrl: null,
                      isExisting: true,
                    });
                  }}
                >
                  Continue with existing agent →
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn"
              disabled={
                !handleValid ||
                !anchorWallet ||
                phase === 'waiting' ||
                phase === 'submitting' ||
                phase === 'confirming'
              }
              style={{
                opacity:
                  handleValid &&
                  anchorWallet &&
                  phase !== 'waiting' &&
                  phase !== 'submitting' &&
                  phase !== 'confirming'
                    ? 1
                    : 0.5,
                cursor:
                  handleValid &&
                  anchorWallet &&
                  phase !== 'waiting' &&
                  phase !== 'submitting' &&
                  phase !== 'confirming'
                    ? 'pointer'
                    : 'not-allowed',
              }}
              onClick={onClickRegister}
            >
              {phase === 'waiting' && 'Awaiting wallet signature…'}
              {phase === 'submitting' && 'Submitting…'}
              {phase === 'confirming' && 'Confirming…'}
              {(phase === 'idle' || phase === 'error') && 'Register'}
            </button>
          </div>
        </>
      )}

      {phase === 'success' && result && (
        <SuccessPanel result={result} onAdvance={onAdvance} />
      )}
    </div>
  );
}

function SuccessPanel({
  result,
  onAdvance,
}: {
  result: RegisterResult;
  onAdvance: (r: RegisterResult) => void;
}) {
  const [copied, setCopied] = useState(false);
  // SuccessPanel is only mounted on the fresh-registration path, where
  // signature is always set. The "claim existing" path never enters this
  // panel — it goes straight to onAdvance(). Narrow once at the top so
  // the rest of the JSX doesn't need null guards.
  const signature = result.signature!;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(signature);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
      <div
        className="wf"
        style={{
          padding: '12px 14px',
          background: '#0d0d12',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          borderColor: 'var(--accent)',
          boxShadow: '0 0 12px var(--accent-soft)',
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 11, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span>✓</span>
          <span>Registered as <strong>{result.handle}</strong></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="label" style={{ minWidth: 70 }}>SIGNATURE</span>
          <span
            className="addr mono"
            style={{ fontSize: 10, color: 'var(--ink-2)', wordBreak: 'break-all' }}
          >
            {signature}
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
          <span className="label" style={{ minWidth: 70 }}>AGENT PDA</span>
          <a
            href={explorerAddressUrl(result.agentPda)}
            target="_blank"
            rel="noreferrer noopener"
            className="addr mono"
            style={{ fontSize: 10, color: 'var(--accent)', wordBreak: 'break-all' }}
          >
            {result.agentPda.toBase58()} ↗
          </a>
        </div>

        <a
          href={explorerTxUrl(signature)}
          target="_blank"
          rel="noreferrer noopener"
          className="mono"
          style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2 }}
        >
          View transaction on Solana Explorer →
        </a>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => onAdvance(result)}>
          Continue →
        </button>
      </div>
    </div>
  );
}
