// SOL-on-ER isolated test for Whisper Exchange.
//
// Goal: prove that a base-layer system_program::transfer between two regular
// (non-delegated) wallets works when sent through the MagicBlock Ephemeral
// Rollup endpoint, alongside a tx that touches a delegated PDA.
//
// Sequence:
//   1. Generate throwaway sender + receiver keypairs.
//   2. Fund sender 0.5 SOL from the default wallet (~/.config/solana/id.json).
//   3. Register sender as a Whisper agent on base layer (creates Agent PDA).
//   4. Delegate sender's Agent PDA via whisper.delegate_test (base layer).
//   5. Wait 3s for delegation propagation.
//   6. On the ER endpoint, send a tx that does ONLY system_program::transfer
//      (sender → receiver, 0.1 SOL). No PDA writes — naked SOL transfer.
//      skipPreflight: true.
//   7. Wait for the ER tx to confirm.
//   8. Read sender + receiver balances on BASE layer.
//   9. Optionally: call whisper.commit_and_undelegate_test on the ER to clean
//      up the delegated PDA. Best effort — the validator auto-undelegates after
//      lifetime expires regardless.
//  10. Report.
//
// Expected CWD: agents/  (so node_modules + relative IDL path resolve).
// Launch from repo root via:  (cd agents && npx tsx ../scripts/test-sol-on-er.ts)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { AnchorProvider, Program, Wallet, web3 } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import {
  DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { x25519 } from '@noble/curves/ed25519';

loadDotenv();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
if (!HELIUS_API_KEY) {
  throw new Error('HELIUS_API_KEY missing in agents/.env');
}
const BASE_RPC = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const ER_RPC = 'https://devnet.magicblock.app/';

const TRANSFER_AMOUNT_LAMPORTS = 100_000_000; // 0.1 SOL
const FUND_AMOUNT_SOL = 0.5;
const DEFAULT_WALLET_PATH = `${process.env.HOME}/.config/solana/id.json`;

const t0 = Date.now();
function ts(): string {
  const e = ((Date.now() - t0) / 1000).toFixed(1);
  return `T+${e}s`;
}
function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${ts()} ${msg}`);
}

function loadDefaultWallet(): web3.Keypair {
  const raw = readFileSync(DEFAULT_WALLET_PATH, 'utf8');
  return web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function agentPda(programId: web3.PublicKey, authority: web3.PublicKey): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), authority.toBuffer()],
    programId,
  )[0];
}

async function main(): Promise<number> {
  log('[main] sol-on-er test start');

  const idl = JSON.parse(
    readFileSync(resolve('..', 'target', 'idl', 'whisper.json'), 'utf8'),
  ) as Idl;
  const programId = new web3.PublicKey(idl.address ?? (idl as any).metadata?.address);
  log(`[main] program id: ${programId.toBase58()}`);
  log(`[main] base RPC: ${BASE_RPC.replace(/api-key=[^&]+/, 'api-key=***')}`);
  log(`[main] er   RPC: ${ER_RPC}`);

  const baseConnection = new web3.Connection(BASE_RPC, 'confirmed');
  const erConnection = new web3.Connection(ER_RPC, 'confirmed');

  const sender = web3.Keypair.generate();
  const receiver = web3.Keypair.generate();
  log(`[main] sender:   ${sender.publicKey.toBase58()}`);
  log(`[main] receiver: ${receiver.publicKey.toBase58()}`);

  // Step 2: fund sender from default wallet via solana-cli.
  // (Avoids touching the funded wallet's keypair from inside this script.)
  log(`[step 2] funding sender ${FUND_AMOUNT_SOL} SOL from default wallet`);
  const fundCmd = `solana transfer --url devnet --keypair ${DEFAULT_WALLET_PATH} --fee-payer ${DEFAULT_WALLET_PATH} --allow-unfunded-recipient ${sender.publicKey.toBase58()} ${FUND_AMOUNT_SOL}`;
  execSync(fundCmd, { stdio: 'pipe' });
  await sleep(2_000);
  const senderInitial = await baseConnection.getBalance(sender.publicKey, 'confirmed');
  log(`[step 2] sender funded: ${senderInitial} lamports (${(senderInitial / 1e9).toFixed(4)} SOL)`);

  // Step 3: register sender as a Whisper agent (creates Agent PDA).
  log('[step 3] registering sender as whisper agent');
  const senderWallet = new Wallet(sender);
  const senderProvider = new AnchorProvider(baseConnection, senderWallet, {
    commitment: 'confirmed',
  });
  const programBase = new Program(idl, senderProvider);
  const senderAgentPda = agentPda(programId, sender.publicKey);

  const x25519Priv = x25519.utils.randomSecretKey();
  const x25519Pub = x25519.getPublicKey(x25519Priv);

  const registerSig = await (programBase.methods as any)
    .registerAgent('sol-test', Array.from(x25519Pub))
    .accounts({
      agent: senderAgentPda,
      authority: sender.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();
  log(`[step 3] registered tx=${registerSig} agent_pda=${senderAgentPda.toBase58()}`);

  // Step 4: delegate the Agent PDA on base layer.
  log('[step 4] delegating sender Agent PDA via whisper.delegate_test (base layer)');
  const delegateSig = await (programBase.methods as any)
    .delegateTest()
    .accounts({
      authority: sender.publicKey,
      agent: senderAgentPda,
    })
    .rpc({ skipPreflight: false, commitment: 'confirmed' });
  log(`[step 4] delegate tx=${delegateSig}`);

  // Step 5: wait for delegation propagation.
  log('[step 5] sleeping 3s for delegation propagation');
  await sleep(3_000);

  const accountInfo = await baseConnection.getAccountInfo(senderAgentPda);
  if (!accountInfo) {
    log('[step 5] FATAL: agent PDA disappeared after delegate');
    return 1;
  }
  const isDelegated = accountInfo.owner.equals(DELEGATION_PROGRAM_ID);
  log(
    `[step 5] agent owner = ${accountInfo.owner.toBase58()} ` +
      `(delegated=${isDelegated})`,
  );

  // Step 6: naked SOL transfer on the ER endpoint.
  log(`[step 6] sending naked transfer (${TRANSFER_AMOUNT_LAMPORTS} lamports = 0.1 SOL) on ER`);
  const erBlockhash = await erConnection.getLatestBlockhash();
  const transferIx = web3.SystemProgram.transfer({
    fromPubkey: sender.publicKey,
    toPubkey: receiver.publicKey,
    lamports: TRANSFER_AMOUNT_LAMPORTS,
  });
  const tx = new web3.Transaction({
    feePayer: sender.publicKey,
    recentBlockhash: erBlockhash.blockhash,
  }).add(transferIx);
  tx.sign(sender);

  let erTransferSig = '';
  let erTransferOk = false;
  try {
    erTransferSig = await erConnection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    log(`[step 6] er tx submitted: ${erTransferSig}`);
    // Confirm via getSignatureStatus polling (sendAndConfirm assumes the
    // signature is on the same RPC's blockhash space; ER may not).
    for (let i = 0; i < 15; i++) {
      const st = await erConnection.getSignatureStatuses([erTransferSig]);
      const status = st.value[0];
      if (status?.err) {
        log(`[step 6] er tx errored: ${JSON.stringify(status.err)}`);
        break;
      }
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        erTransferOk = true;
        log(`[step 6] er tx confirmed (status=${status.confirmationStatus})`);
        break;
      }
      await sleep(1_000);
    }
    if (!erTransferOk) {
      log('[step 6] er tx never confirmed within 15s');
    }
  } catch (err) {
    log(`[step 6] er sendRawTransaction threw: ${err}`);
    if (err instanceof Error && err.stack) {
      console.log(err.stack);
    }
  }

  // Step 7-8: read balances on BASE.
  log('[step 7-8] reading balances on base layer');
  await sleep(2_000);
  const senderFinalBase = await baseConnection.getBalance(sender.publicKey, 'confirmed');
  const receiverFinalBase = await baseConnection.getBalance(receiver.publicKey, 'confirmed');
  log(`[step 8] sender base balance:   ${senderFinalBase} lamports (${(senderFinalBase / 1e9).toFixed(6)} SOL)`);
  log(`[step 8] receiver base balance: ${receiverFinalBase} lamports (${(receiverFinalBase / 1e9).toFixed(6)} SOL)`);

  // Also read on ER for comparison.
  let senderErBalance: number | null = null;
  let receiverErBalance: number | null = null;
  try {
    senderErBalance = await erConnection.getBalance(sender.publicKey, 'confirmed');
    receiverErBalance = await erConnection.getBalance(receiver.publicKey, 'confirmed');
    log(`[step 8] sender ER balance:     ${senderErBalance} lamports`);
    log(`[step 8] receiver ER balance:   ${receiverErBalance} lamports`);
  } catch (err) {
    log(`[step 8] er balance read failed: ${err}`);
  }

  // Step 9: best-effort cleanup — undelegate the test PDA via ER.
  log('[step 9] attempting commit_and_undelegate_test on ER (best-effort cleanup)');
  try {
    const erProvider = new AnchorProvider(erConnection, senderWallet, { commitment: 'confirmed' });
    const programEr = new Program(idl, erProvider);
    const undelegateTx = await (programEr.methods as any)
      .commitAndUndelegateTest()
      .accounts({
        authority: sender.publicKey,
        agent: senderAgentPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .transaction();
    undelegateTx.feePayer = sender.publicKey;
    undelegateTx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
    undelegateTx.sign(sender);
    const undelegateSig = await erConnection.sendRawTransaction(undelegateTx.serialize(), {
      skipPreflight: true,
    });
    log(`[step 9] undelegate tx submitted: ${undelegateSig}`);
  } catch (err) {
    log(`[step 9] undelegate failed (non-fatal): ${err}`);
  }

  // Verdict.
  log('');
  log('=== VERDICT ===');
  log(`er transfer submitted: ${erTransferSig || '(none)'}`);
  log(`er transfer confirmed: ${erTransferOk}`);
  const baseDiff = senderFinalBase - senderInitial;
  const receiverGained = receiverFinalBase;
  log(`sender base diff:   ${baseDiff} lamports (negative = paid)`);
  log(`receiver base gain: ${receiverGained} lamports`);
  const baseTransferLanded = receiverGained === TRANSFER_AMOUNT_LAMPORTS;
  log(`receiver got exactly ${TRANSFER_AMOUNT_LAMPORTS} on base: ${baseTransferLanded}`);
  log(`=== ${erTransferOk && baseTransferLanded ? 'PASS' : 'INFORMATIVE'} ===`);
  log(`wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return erTransferOk && baseTransferLanded ? 0 : 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`FATAL ${err}`);
    if (err instanceof Error && err.stack) {
      console.log(err.stack);
    }
    process.exit(2);
  },
);
