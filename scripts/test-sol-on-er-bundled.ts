// Bundled-CPI SOL-on-ER test for Whisper Exchange.
//
// Hypothesis: ER processes a tx that mutates a delegated PDA AND does a
// system_program::transfer CPI between two non-delegated wallets, all in
// one Anchor instruction. This mirrors what purchase_listing_private will do.
//
// Sequence:
//   1. Generate sender + receiver throwaway keypairs.
//   2. Fund sender 0.5 SOL from default wallet.
//   3. Register sender as a Whisper agent (creates Agent PDA on base).
//   4. Delegate Agent PDA via whisper.delegate_test (base layer).
//   5. Wait 3s for delegation propagation.
//   6. Send delegate_test_with_transfer on ER:
//        - mutates the delegated Agent (listings_created += 1)
//        - CPI transfers 0.1 SOL sender → receiver
//      skipPreflight: true.
//   7. Wait for confirmation, capture sig.
//   8. Read sender + receiver balances on ER (should reflect transfer).
//   9. Call commit_and_undelegate_test on ER to commit + release the PDA.
//  10. Wait for commit-back to base.
//  11. Read sender + receiver balances on BASE — should reflect the transfer.
//  12. Verdict.
//
// Launch from repo root: (cd agents && npx tsx ../scripts/test-sol-on-er-bundled.ts)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { AnchorProvider, BN, Program, Wallet, web3 } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import {
  DELEGATION_PROGRAM_ID,
  GetCommitmentSignature,
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
  return `T+${((Date.now() - t0) / 1000).toFixed(1)}s`;
}
function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${ts()} ${msg}`);
}

function agentPda(programId: web3.PublicKey, authority: web3.PublicKey): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), authority.toBuffer()],
    programId,
  )[0];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<number> {
  log('[main] sol-on-er-bundled test start');

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
  log(`[step 2] funding sender ${FUND_AMOUNT_SOL} SOL from default wallet`);
  execSync(
    `solana transfer --url devnet --keypair ${DEFAULT_WALLET_PATH} --fee-payer ${DEFAULT_WALLET_PATH} --allow-unfunded-recipient ${sender.publicKey.toBase58()} ${FUND_AMOUNT_SOL}`,
    { stdio: 'pipe' },
  );
  await sleep(2_000);
  const senderInitial = await baseConnection.getBalance(sender.publicKey, 'confirmed');
  log(
    `[step 2] sender funded: ${senderInitial} lamports (${(senderInitial / 1e9).toFixed(4)} SOL)`,
  );

  // Step 3: register sender as whisper agent.
  log('[step 3] registering sender as whisper agent');
  const senderWallet = new Wallet(sender);
  const baseProvider = new AnchorProvider(baseConnection, senderWallet, {
    commitment: 'confirmed',
  });
  const programBase = new Program(idl, baseProvider);
  const senderAgentPda = agentPda(programId, sender.publicKey);

  const x25519Priv = x25519.utils.randomSecretKey();
  const x25519Pub = x25519.getPublicKey(x25519Priv);

  const registerSig = await (programBase.methods as any)
    .registerAgent('bundled-test', Array.from(x25519Pub))
    .accounts({
      agent: senderAgentPda,
      authority: sender.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();
  log(`[step 3] registered tx=${registerSig} agent_pda=${senderAgentPda.toBase58()}`);

  // Capture pre-mutation Agent state on base.
  const agentPre: any = await (programBase.account as any).agent.fetch(senderAgentPda);
  const listingsCreatedPre = BigInt(agentPre.listingsCreated.toString());
  log(`[step 3] agent listings_created (pre) = ${listingsCreatedPre}`);

  // Step 4: delegate.
  log('[step 4] delegating sender Agent PDA via whisper.delegate_test');
  const delegateSig = await (programBase.methods as any)
    .delegateTest()
    .accounts({
      authority: sender.publicKey,
      agent: senderAgentPda,
    })
    .rpc({ commitment: 'confirmed' });
  log(`[step 4] delegate tx=${delegateSig}`);

  // Step 5: wait + verify owner change.
  log('[step 5] sleeping 3s for delegation propagation');
  await sleep(3_000);
  const accountInfo = await baseConnection.getAccountInfo(senderAgentPda);
  if (!accountInfo) {
    log('[step 5] FATAL: agent PDA disappeared after delegate');
    return 1;
  }
  const isDelegated = accountInfo.owner.equals(DELEGATION_PROGRAM_ID);
  log(
    `[step 5] agent owner = ${accountInfo.owner.toBase58()} (delegated=${isDelegated})`,
  );
  if (!isDelegated) {
    log('[step 5] FATAL: delegation did not propagate');
    return 1;
  }

  // Step 6: bundled tx on ER — PDA mutation + SOL transfer CPI.
  log(
    `[step 6] sending delegate_test_with_transfer on ER ` +
      `(transfer ${TRANSFER_AMOUNT_LAMPORTS} lamports = 0.1 SOL)`,
  );
  const erProvider = new AnchorProvider(erConnection, senderWallet, {
    commitment: 'confirmed',
  });
  const programEr = new Program(idl, erProvider);

  let bundledSig = '';
  let bundledOk = false;
  let bundledErr: any = null;
  try {
    const bundledTx = await (programEr.methods as any)
      .delegateTestWithTransfer(new BN(TRANSFER_AMOUNT_LAMPORTS))
      .accounts({
        agent: senderAgentPda,
        authority: sender.publicKey,
        receiver: receiver.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .transaction();
    bundledTx.feePayer = sender.publicKey;
    bundledTx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
    bundledTx.sign(sender);
    bundledSig = await erConnection.sendRawTransaction(bundledTx.serialize(), {
      skipPreflight: true,
    });
    log(`[step 6] er tx submitted: ${bundledSig}`);

    for (let i = 0; i < 20; i++) {
      const st = await erConnection.getSignatureStatuses([bundledSig]);
      const status = st.value[0];
      if (status?.err) {
        bundledErr = status.err;
        log(`[step 6] er tx errored: ${JSON.stringify(status.err)}`);
        break;
      }
      if (
        status?.confirmationStatus === 'confirmed' ||
        status?.confirmationStatus === 'finalized'
      ) {
        bundledOk = true;
        log(`[step 6] er tx confirmed (status=${status.confirmationStatus})`);
        break;
      }
      await sleep(1_000);
    }
    if (!bundledOk && !bundledErr) {
      log('[step 6] er tx never confirmed within 20s');
    }
  } catch (err) {
    bundledErr = err;
    log(`[step 6] er sendRawTransaction threw: ${err}`);
    if (err instanceof Error && err.stack) {
      console.log(err.stack);
    }
  }

  // Step 8: ER balance read.
  log('[step 8] reading balances on ER');
  let senderEr = -1;
  let receiverEr = -1;
  try {
    senderEr = await erConnection.getBalance(sender.publicKey, 'confirmed');
    receiverEr = await erConnection.getBalance(receiver.publicKey, 'confirmed');
    log(`[step 8] sender ER:   ${senderEr} lamports (${(senderEr / 1e9).toFixed(6)} SOL)`);
    log(`[step 8] receiver ER: ${receiverEr} lamports (${(receiverEr / 1e9).toFixed(6)} SOL)`);
  } catch (err) {
    log(`[step 8] er balance read failed: ${err}`);
  }

  // Step 9: commit + undelegate (only if bundled tx confirmed; otherwise skip
  // and let validator auto-undelegate).
  let commitSig = '';
  if (bundledOk) {
    log('[step 9] commit_and_undelegate_test on ER');
    try {
      const undTx = await (programEr.methods as any)
        .commitAndUndelegateTest()
        .accounts({
          authority: sender.publicKey,
          agent: senderAgentPda,
          magicProgram: MAGIC_PROGRAM_ID,
          magicContext: MAGIC_CONTEXT_ID,
        })
        .transaction();
      undTx.feePayer = sender.publicKey;
      undTx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
      undTx.sign(sender);
      commitSig = await erConnection.sendRawTransaction(undTx.serialize(), {
        skipPreflight: true,
      });
      log(`[step 9] commit tx submitted: ${commitSig}`);

      for (let i = 0; i < 20; i++) {
        const st = await erConnection.getSignatureStatuses([commitSig]);
        if (st.value[0]?.err) {
          log(`[step 9] commit errored: ${JSON.stringify(st.value[0].err)}`);
          break;
        }
        if (
          st.value[0]?.confirmationStatus === 'confirmed' ||
          st.value[0]?.confirmationStatus === 'finalized'
        ) {
          log(`[step 9] commit confirmed`);
          break;
        }
        await sleep(1_000);
      }

      // Wait for commit-back to base.
      log('[step 10] waiting for commit-back signature on base');
      try {
        const baseSig = await GetCommitmentSignature(commitSig, erConnection);
        log(`[step 10] commit-back base sig: ${baseSig}`);
      } catch (err) {
        log(`[step 10] GetCommitmentSignature failed: ${err}`);
      }
    } catch (err) {
      log(`[step 9] commit step threw: ${err}`);
    }
  } else {
    log('[step 9] skipping commit (bundled tx did not confirm)');
  }

  // Step 11: read base balances.
  log('[step 11] reading balances on base layer');
  await sleep(3_000);
  const senderBase = await baseConnection.getBalance(sender.publicKey, 'confirmed');
  const receiverBase = await baseConnection.getBalance(receiver.publicKey, 'confirmed');
  log(`[step 11] sender base:   ${senderBase} lamports (${(senderBase / 1e9).toFixed(6)} SOL)`);
  log(`[step 11] receiver base: ${receiverBase} lamports (${(receiverBase / 1e9).toFixed(6)} SOL)`);

  // Step 11b: read agent state on base, see if listings_created bumped.
  let listingsCreatedPost = -1n;
  try {
    const agentPost: any = await (programBase.account as any).agent.fetch(senderAgentPda);
    listingsCreatedPost = BigInt(agentPost.listingsCreated.toString());
    log(`[step 11] agent listings_created (post) = ${listingsCreatedPost}`);
  } catch (err) {
    log(`[step 11] agent fetch on base failed (still delegated?): ${err}`);
  }

  // Verdict.
  log('');
  log('=== VERDICT ===');
  log(`bundled tx submitted:   ${bundledSig || '(none)'}`);
  log(`bundled tx confirmed:   ${bundledOk}`);
  log(`bundled tx error:       ${bundledErr ? JSON.stringify(bundledErr) : '(none)'}`);
  log(`commit/undelegate sig:  ${commitSig || '(skipped)'}`);
  const baseDiff = senderBase - senderInitial;
  log(`sender base diff:       ${baseDiff} lamports (negative = paid)`);
  log(`receiver base gain:     ${receiverBase} lamports`);
  const exactTransfer = receiverBase === TRANSFER_AMOUNT_LAMPORTS;
  log(`receiver got exactly 0.1 SOL on base: ${exactTransfer}`);
  log(`agent listings_created: ${listingsCreatedPre} → ${listingsCreatedPost}`);
  const pdaMutated = listingsCreatedPost === listingsCreatedPre + 1n;
  log(`pda mutation visible on base: ${pdaMutated}`);

  let verdict: string;
  if (bundledOk && exactTransfer && pdaMutated) {
    verdict = 'PASS — one-tx flow viable for purchase_listing_private';
  } else if (
    bundledErr &&
    JSON.stringify(bundledErr).includes('InvalidAccountForFee')
  ) {
    verdict = 'TWO-TX REQUIRED — same fee error as naked test; route SOL via base post-commit';
  } else if (bundledErr) {
    verdict = 'NEW FAILURE MODE — different error, stop and review';
  } else {
    verdict = 'INDETERMINATE — tx submitted but state did not propagate as expected';
  }
  log(`=== ${verdict} ===`);
  log(`wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return bundledOk && exactTransfer && pdaMutated ? 0 : 1;
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
