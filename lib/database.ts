import { createClient, type Client, type InValue } from '@libsql/client';

let client: Client | undefined;
export function getDatabaseClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url)
      throw new Error('Configure TURSO_DATABASE_URL before using the locker.');
    if (process.env.VERCEL && url.startsWith('file:')) {
      throw new Error('Vercel requires a remote Turso database.');
    }
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

// Preserve the application's prepared-query interface while using remote libSQL.
export const database = {
  prepare(sql: string) {
    const statement = (args: InValue[] = []) => ({
      bind: (...values: InValue[]) => statement(values),
      async all() {
        const result = await getDatabaseClient().execute({ sql, args });
        return { results: result.rows };
      },
      async first() {
        const result = await getDatabaseClient().execute({ sql, args });
        return result.rows[0] ?? null;
      },
      async run() {
        const result = await getDatabaseClient().execute({ sql, args });
        return { meta: { changes: result.rowsAffected } };
      },
    });
    return statement();
  },
};
