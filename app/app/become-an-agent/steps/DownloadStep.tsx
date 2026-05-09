// Step 4 — generate the personalized starter script and trigger a
// browser download. End of the onboarding flow.
//
// The script body is generated client-side via app/lib/agent-starter-template
// using the user's keypair material (held in component state since Step 2)
// and the on-chain registration result from Step 3. Click → Blob URL →
// <a download> → user gets a .ts file named whisper-agent-{handle}.ts.

'use client';

import { useState } from 'react';

import { generateStarterScript } from '@/lib/agent-starter-template';
import { explorerAddressUrl } from '@/lib/register-agent';
import type { DerivedX25519 } from '@/lib/wallet-onboarding';
import type { RegisterResult } from './RegisterStep';

export function DownloadStep({
  walletPubkey,
  derived,
  registered,
  onDone,
}: {
  walletPubkey: string;
  derived: DerivedX25519;
  registered: RegisterResult;
  onDone: () => void;
}) {
  const [downloaded, setDownloaded] = useState(false);

  const filename = `whisper-agent-${registered.handle}.ts`;

  const onDownload = () => {
    const source = generateStarterScript({
      handle: registered.handle,
      walletPubkey,
      agentPda: registered.agentPda,
      x25519PublicKey: derived.publicKey,
      x25519PrivateKey: derived.privateKey,
    });

    // Browser-side file download via Blob + revoked object URL. No server
    // round-trip; the user's keys never leave their browser.
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Defer revoke so the browser actually completes the download.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setDownloaded(true);
  };

  const truncated = (s: string, head = 6, tail = 6) =>
    s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
  const x25519PubBase58 = (() => {
    // Use the same hex form as the script's display so users can match the
    // values byte-for-byte. Hex avoids pulling bs58 into the bundle here.
    return Array.from(derived.publicKey, (b) => b.toString(16).padStart(2, '0')).join('');
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
      {/* Identity summary — what's about to land in the downloaded file. */}
      <div
        className="wf"
        style={{
          padding: '12px 14px',
          background: '#0d0d12',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <SummaryRow label="HANDLE" mono value={registered.handle} />
        <SummaryRow label="WALLET" value={truncated(walletPubkey, 8, 8)} />
        <SummaryRow
          label="X25519 PUB"
          value={truncated(x25519PubBase58, 12, 12)}
        />
        <SummaryRow
          label="AGENT PDA"
          value={
            <a
              href={explorerAddressUrl(registered.agentPda)}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--accent)' }}
            >
              {truncated(registered.agentPda.toBase58(), 8, 8)} ↗
            </a>
          }
        />
        <SummaryRow
          label="STATUS"
          value={
            registered.explorerUrl ? (
              <a
                href={registered.explorerUrl}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: 'var(--accent)' }}
              >
                registered just now ↗
              </a>
            ) : (
              <span style={{ color: 'var(--ink-3)' }}>registered previously</span>
            )
          }
        />
      </div>

      {/* Download button + warning. The warning is non-dismissible — every
          run of this step shows it, since the user's private key really
          does ship in the file. */}
      <div
        className="wf"
        style={{
          padding: '12px 14px',
          background: 'rgba(255, 80, 80, 0.05)',
          border: '1px solid var(--danger)',
          borderRadius: 2,
          fontSize: 11,
          color: 'var(--ink)',
          lineHeight: 1.55,
        }}
      >
        <div className="mono" style={{ color: 'var(--danger)', marginBottom: 4 }}>
          ⚠ contains your x25519 PRIVATE KEY
        </div>
        Save the file locally. <strong>Do not commit to git.</strong> Do not
        share publicly. The private key is the only way to decrypt sealed
        payloads addressed to your agent — anyone with it can read every
        tip you ever buy.
        <div className="mono" style={{ marginTop: 8, color: 'var(--ink-3)', fontSize: 10 }}>
          Suggestion: rename to <code>{`whisper-agent-${registered.handle}.local.ts`}</code> and
          add <code>*.local.ts</code> to <code>.gitignore</code>.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-accent" onClick={onDownload}>
          {downloaded ? '↻ Download again' : `Download ${filename}`}
        </button>
      </div>

      {/* Post-download instructions. Shown once the user clicks Download
          so they know what to do with the file. */}
      {downloaded && (
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
          <div className="label" style={{ marginBottom: 8 }}>
            NEXT
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--ink)' }}>
            <li style={{ marginBottom: 4 }}>
              Save{' '}
              <code className="mono" style={{ fontSize: 11 }}>{filename}</code>{' '}
              to a directory of your choice.
            </li>
            <li style={{ marginBottom: 4 }}>
              Install the one runtime dep:
              <pre
                className="mono"
                style={{
                  marginTop: 4,
                  padding: '6px 10px',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  fontSize: 11,
                  color: 'var(--ink)',
                  overflowX: 'auto',
                }}
              >
                npm install @solana/web3.js
              </pre>
            </li>
            <li style={{ marginBottom: 4 }}>
              Run it:
              <pre
                className="mono"
                style={{
                  marginTop: 4,
                  padding: '6px 10px',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  fontSize: 11,
                  color: 'var(--ink)',
                  overflowX: 'auto',
                }}
              >
                npx tsx {filename}
              </pre>
            </li>
            <li>
              You should see your handle, reputation 0/0, and a green
              {' '}<code className="mono">✓ on-chain x25519 pubkey matches</code> line.
            </li>
          </ol>
          <div style={{ marginTop: 12, color: 'var(--ink-3)', fontSize: 10 }}>
            For the full agent flow (list, deliver, rate), see{' '}
            <code className="mono">docs/agent-protocol.md</code> in the repo.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button className="btn ghost" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="label" style={{ minWidth: 76 }}>
        {label}
      </span>
      <span
        className={mono ? '' : 'mono'}
        style={{
          fontSize: 11,
          color: 'var(--ink)',
          fontFamily: mono ? undefined : 'var(--font-mono), JetBrains Mono, monospace',
          fontWeight: mono ? 600 : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}
