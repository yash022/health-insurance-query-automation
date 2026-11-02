import { Pool } from 'pg';

type Value = string | number | boolean | null;
type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null };
type Execute = (sql: string, args: Value[]) => Promise<QueryResult>;
let pool: Pool | undefined;

export function getDatabaseClient() {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString)
      throw new Error(
        'Configure DATABASE_URL with your Supabase transaction pooler connection string.',
      );
    pool = new Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: true },
    });
    pool.on('error', () => console.error('Database connection interrupted.'));
  }
  return pool;
}

// Application SQL uses positional markers. Preserve quoted SQL literals.
export function parameters(sql: string) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|\?/g, (token) =>
    token === '?' ? `$${++index}` : token,
  );
}

export function createDatabase(execute: Execute) {
  return {
    prepare(sql: string) {
      const query = parameters(sql);
      const statement = (args: Value[] = []) => ({
        bind: (...values: Value[]) => statement(values),
        async all() {
          return { results: (await execute(query, args)).rows };
        },
        async first() {
          return (await execute(query, args)).rows[0] ?? null;
        },
        async run() {
          return {
            meta: { changes: (await execute(query, args)).rowCount ?? 0 },
          };
        },
      });
      return statement();
    },
  };
}

// No query name is supplied: pg uses unnamed statements compatible with transaction pooling.
export const database = createDatabase((sql, args) =>
  getDatabaseClient().query(sql, args),
);
