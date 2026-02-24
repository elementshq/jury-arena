import { db, type Tx } from "@/lib/db/core";

class TestRollbackError extends Error {
  constructor() {
    super("TEST_ROLLBACK");
  }
}

/**
 * 各テストをトランザクションで包み、必ずロールバックしてDBを汚さない。
 */
export async function withTestTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new TestRollbackError(); // 強制rollback
    });
  } catch (e) {
    if (e instanceof TestRollbackError) return;
    throw e;
  }
}
