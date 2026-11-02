import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const connectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!connectionString)
  throw new Error('Set DATABASE_URL to your Supabase connection string.');
const client = new Pool({
  connectionString,
  max: 1,
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 10000,
});
try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('Supabase PostgreSQL migrations applied.');
} finally {
  await client.end();
}
