// Two-tx private-purchase flow via MagicBlock ephemeral rollup.
//
// Sequence (per docs/magicblock-integration.md, refactored from the original
// 3-tx form to eliminate a race with settleWatcher):
//   Tx 1 (base): init_purchase_for_delegation + delegate_for_purchase
//                — batched into one tx via Transaction.add().add().
//   Tx 2 (ER):   purchase_listing_private — mutates delegated Listing/Purchase,
//                then commit_and_undelegate bundles them back to base.
//                Buyer polls base-layer Purchase until purchased_at_slot > 0
//                to confirm the commit landed (timeout 15s).
//
// settle_purchase is NOT called inline. Once tx2 lands and the commit-back
// completes, Listing.status=Sold and Purchase.settled=false — exactly the
// shape buyer.ts:settleWatcher polls for. The watcher fires within
// SETTLE_POLL_MS (5s) and runs settle_purchase; same code path as the
// stranded-listing recovery, no special-case logic.
//
// Idempotency note: if tx1 succeeds but tx2 fails, the next purchase cycle will
// re-detect the same Active listing; init_purchase_for_delegation will fail
// because the Purchase PDA already exists. Buyer agent should swallow that
// specific error (handled in buyer.ts:purchase()).

import { Program, Wallet, web3 } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import {
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
} from '@magicblock-labs/ephemeral-rollups-sdk';

// Subset of the buyer.ts/supplier.ts Chain interface we actually need.
// Structural typing means callers can pass their full Chain object.
export interface ChainBundle {
  programBase: Program<Idl>;
  programEr: Program<Idl>;
  wallet: Wallet;
  programId: web3.PublicKey;
}

export interface PurchaseResult {
  tx1Sig: string;
  tx2Sig: string;
  totalMs: number;
}

const POLL_INTERVAL_MS = 1_000;
const COMMIT_LANDED_TIMEOUT_MS = 15_000;

function logJson(kind: string, payload: Record<string, unknown>): void {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), actor: 'buyer', kind, payload }),
  );
}

function purchasePdaFor(programId: web3.PublicKey, listing: web3.PublicKey): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('purchase'), listing.toBuffer()],
    programId,
  )[0];
}

function agentPdaFor(programId: web3.PublicKey, authority: web3.PublicKey): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), authority.toBuffer()],
    programId,
  )[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function purchaseViaEr(
  chain: ChainBundle,
  listingPda: web3.PublicKey,
  listing: any,
): Promise<PurchaseResult> {
  const t0 = Date.now();
  const buyerAuthority = chain.wallet.publicKey;
  const buyerAgentPda = agentPdaFor(chain.programId, buyerAuthority);
  const purchasePda = purchasePdaFor(chain.programId, listingPda);
  const supplierAgentPda = listing.supplier as web3.PublicKey;
  const listingId = listing.listingId; // BN from Anchor decode

  // ---------- Tx 1: init Purchase + delegate Listing + Purchase (base) ----------
  const tx1Start = Date.now();
  let tx1Sig = '';
  try {
    const initIx = await (chain.programBase.methods as any)
      .initPurchaseForDelegation(listingId)
      .accounts({
        authority: buyerAuthority,
        buyerAgent: buyerAgentPda,
        listing: listingPda,
        listingSupplier: supplierAgentPda,
        purchase: purchasePda,
        systemProgram: web3.SystemProgram.programId,
      })
      .instruction();

    // delegate_for_purchase's #[delegate] macro injects the delegation-program
    // accounts in the IDL; Anchor TS resolves them automatically. We pass only
    // the named user accounts here, matching the anchor-counter test pattern.
    const delegateIx = await (chain.programBase.methods as any)
      .delegateForPurchase(listingId)
      .accounts({
        authority: buyerAuthority,
        buyerAgent: buyerAgentPda,
        listing: listingPda,
        listingSupplier: supplierAgentPda,
        purchase: purchasePda,
      })
      .instruction();

    const tx = new web3.Transaction().add(initIx).add(delegateIx);
    tx1Sig = await chain.programBase.provider.sendAndConfirm!(tx);
    logJson('PURCHASE_VIA_ER_TX1_OK', {
      sig: tx1Sig,
      listing: listingPda.toBase58(),
      purchase: purchasePda.toBase58(),
      ms: Date.now() - tx1Start,
    });
  } catch (err) {
    logJson('PURCHASE_VIA_ER_FAIL', {
      step: 'tx1',
      listing: listingPda.toBase58(),
      err: String(err).slice(0, 240),
    });
    throw err;
  }

  // ---------- Tx 2: purchase_listing_private on ER + commit-back wait ----------
  const tx2Start = Date.now();
  let tx2Sig = '';
  try {
    tx2Sig = await (chain.programEr.methods as any)
      .purchaseListingPrivate()
      .accounts({
        authority: buyerAuthority,
        listing: listingPda,
        purchase: purchasePda,
        buyerAgent: buyerAgentPda,
        magicContext: MAGIC_CONTEXT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    // Poll base-layer Purchase until purchased_at_slot > 0 (commit landed).
    const pollDeadline = Date.now() + COMMIT_LANDED_TIMEOUT_MS;
    let commitLanded = false;
    while (Date.now() < pollDeadline) {
      try {
        const purchase: any = await (chain.programBase.account as any).purchase.fetch(
          purchasePda,
        );
        if (BigInt(purchase.purchasedAtSlot.toString()) > 0n) {
          commitLanded = true;
          break;
        }
      } catch {
        // Purchase may briefly fail to fetch during the commit transition.
        // Keep polling.
      }
      await sleep(POLL_INTERVAL_MS);
    }
    if (!commitLanded) {
      throw new Error(
        `commit-back did not land within ${COMMIT_LANDED_TIMEOUT_MS}ms (purchase=${purchasePda.toBase58()})`,
      );
    }

    logJson('PURCHASE_VIA_ER_TX2_OK', {
      sig: tx2Sig,
      commit_landed_after_ms: Date.now() - tx2Start,
    });
  } catch (err) {
    logJson('PURCHASE_VIA_ER_FAIL', {
      step: 'tx2',
      sig: tx2Sig,
      err: String(err).slice(0, 240),
    });
    throw err;
  }

  // settle_purchase is owned by buyer.ts:settleWatcher — it polls every 5s
  // for Purchases where !settled && !delivered && listing.status==Sold and
  // calls settle_purchase from there. This avoids a race with the watcher
  // and keeps settle in one place (also handles the stranded-listing
  // recovery case).

  const totalMs = Date.now() - t0;
  logJson('PURCHASE_VIA_ER_DONE', {
    total_ms: totalMs,
    listing: listingPda.toBase58(),
    purchase: purchasePda.toBase58(),
  });
  return { tx1Sig, tx2Sig, totalMs };
}
