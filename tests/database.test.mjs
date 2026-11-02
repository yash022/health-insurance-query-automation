import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

test('libSQL adapter preserves migrations, isolation, unique uploads, and atomic job claims', async () => {
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  const { database, getDatabaseClient } = await import('../lib/database.ts');
  const client = getDatabaseClient();
  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    const insert =
      'INSERT INTO records(id,owner,kind,patient,fingerprint,data,created) VALUES(?,?,?,?,?,?,?)';
    await database
      .prepare(insert)
      .bind(
        'r1',
        'alice',
        'query',
        'p1',
        'hash',
        '{"status":"processing"}',
        '2026-01-01',
      )
      .run();
    assert.equal(
      await database
        .prepare('SELECT * FROM records WHERE owner=? AND id=?')
        .bind('bob', 'r1')
        .first(),
      null,
    );
    await assert.rejects(
      database
        .prepare(insert)
        .bind('r2', 'alice', 'query', 'p1', 'hash', '{}', '2026-01-01')
        .run(),
    );
    await database
      .prepare(
        "UPDATE records SET data=json_set(data,'$.status','processed') WHERE id=?",
      )
      .bind('r1')
      .run();
    const row = await database
      .prepare(
        "SELECT json_extract(data,'$.status') AS status FROM records WHERE id=?",
      )
      .bind('r1')
      .first();
    assert.equal(row.status, 'processed');
    await database
      .prepare(
        'INSERT INTO jobs(id,owner,query,channel,status,data) VALUES(?,?,?,?,?,?)',
      )
      .bind('j1', 'alice', 'r1', 'email', 'queued', '{}')
      .run();
    const claim = () =>
      database
        .prepare(
          "UPDATE jobs SET status='sending' WHERE id=? AND status='queued'",
        )
        .bind('j1')
        .run();
    assert.equal((await claim()).meta.changes, 1);
    assert.equal((await claim()).meta.changes, 0);
    assert.equal(
      (await database.prepare('SELECT * FROM jobs').all()).results.length,
      1,
    );
  } finally {
    client.close();
  }
});
