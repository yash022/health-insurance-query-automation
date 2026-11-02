import { drizzle } from 'drizzle-orm/node-postgres';
import { getDatabaseClient } from '../lib/database';
import * as schema from './schema';
export function getDb() {
  return drizzle(getDatabaseClient(), { schema });
}
