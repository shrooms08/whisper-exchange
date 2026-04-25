// Anchor helpers shared by supplier.ts and buyer.ts.

import { Program, web3 } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';

export interface SafeAccount<T> {
  publicKey: web3.PublicKey;
  account: T;
}

export interface SafeAllResult<T> {
  results: SafeAccount<T>[];
  skipped: number;
}

// Like `program.account.<name>.all()`, but tolerant of individual accounts that
// fail to deserialize. Caused by stale on-chain accounts whose layout
// predates a struct change (e.g. orphaned Purchase rows when Purchase gained
// the `settled` field). Returns successfully-decoded accounts and the count
// of those skipped; callers log when skipped > 0.
//
// `accountName` is accepted as either PascalCase IDL name ("Listing") or
// the Anchor TS-side camelCase form ("listing"). Anchor 0.31 client
// normalizes account names to camelCase internally regardless of how
// they appear in the raw IDL JSON, so we lowercase the first letter
// before talking to the coder.
export async function fetchAllSafe<T = unknown>(
  program: Program<Idl>,
  accountName: string,
): Promise<SafeAllResult<T>> {
  const camel = accountName.charAt(0).toLowerCase() + accountName.slice(1);
  const memcmp = (program.coder.accounts as any).memcmp(camel);
  const raw = await program.provider.connection.getProgramAccounts(program.programId, {
    filters: [
      {
        memcmp: {
          offset: memcmp.offset ?? 0,
          bytes: memcmp.bytes,
        },
      },
    ],
  });

  const results: SafeAccount<T>[] = [];
  let skipped = 0;
  for (const { pubkey, account } of raw) {
    try {
      const decoded = program.coder.accounts.decode<T>(camel, account.data);
      results.push({ publicKey: pubkey, account: decoded });
    } catch {
      skipped += 1;
    }
  }
  return { results, skipped };
}
