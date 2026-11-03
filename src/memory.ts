/**
 * The Worker's own small memory: which receipt belongs to which order, and what /pay was asked to charge.
 * D1, not KV: the store asks again seconds after the webhook wrote the receipt, and KV can answer
 * from a stale cache for up to 60 seconds (seen on order GC-1015). D1 reads always see the last write.
 */
export interface MemoryEnv {
  DB?: D1Database;
}

export interface Memory {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

let ready: Promise<unknown> | null = null;

export function memory(env: MemoryEnv): Memory | null {
  const db = env.DB;
  if (!db) return null;
  // Creates its own table on first use, so installs need no migration step.
  ready ??= db.prepare("CREATE TABLE IF NOT EXISTS memory (k TEXT PRIMARY KEY, v TEXT NOT NULL, expires INTEGER)").run().catch((err) => {
    ready = null;
    throw err;
  });
  const now = () => Math.floor(Date.now() / 1000);
  return {
    async get(key) {
      await ready;
      const row = await db.prepare("SELECT v FROM memory WHERE k = ? AND (expires IS NULL OR expires > ?)").bind(key, now()).first<{ v: string }>();
      return row?.v ?? null;
    },
    async put(key, value, ttlSeconds) {
      await ready;
      await db
        .prepare("INSERT INTO memory (k, v, expires) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, expires = excluded.expires")
        .bind(key, value, ttlSeconds ? now() + ttlSeconds : null)
        .run();
    },
  };
}
