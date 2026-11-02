import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createDatabase } from '../lib/database.ts';

export async function createTestDatabase() {
  const postgres = new PGlite();
  const migrateDatabase = () =>
    migrate(drizzle(postgres), { migrationsFolder: './drizzle' });
  await migrateDatabase();
  const database = createDatabase(async (sql, args) => {
    const result = await postgres.query(sql, args);
    return { rows: result.rows, rowCount: result.affectedRows };
  });
  return { postgres, database, migrateDatabase };
}
