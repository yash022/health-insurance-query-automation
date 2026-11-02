import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './postgres-helper.mjs';
import { parameters } from '../lib/database.ts';

test('PostgreSQL adapter preserves migrations, isolation, unique uploads, and atomic job claims', async () => {
  const { postgres, database, migrateDatabase } = await createTestDatabase();
  try {
    await migrateDatabase();
    await migrateDatabase();
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
        "UPDATE records SET data=jsonb_set(data::jsonb,'{status}','\"processed\"'::jsonb)::text WHERE id=?",
      )
      .bind('r1')
      .run();
    const row = await database
      .prepare(
        "SELECT (data::jsonb->>'status') AS status FROM records WHERE id=?",
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
    const next = Date.now() + 3600000;
    await database
      .prepare('UPDATE jobs SET next=? WHERE id=?')
      .bind(next, 'j1')
      .run();
    assert.equal(
      Number(
        (
          await database
            .prepare('SELECT next FROM jobs WHERE id=?')
            .bind('j1')
            .first()
        ).next,
      ),
      next,
    );
    // Supabase exposes public tables through its Data API: RLS must deny browser roles.
    await postgres.exec(
      'CREATE ROLE browser_user; GRANT USAGE ON SCHEMA public TO browser_user; GRANT SELECT, INSERT ON records, jobs TO browser_user; SET ROLE browser_user;',
    );
    try {
      assert.equal(
        (await postgres.query('SELECT * FROM records')).rows.length,
        0,
      );
      assert.equal((await postgres.query('SELECT * FROM jobs')).rows.length, 0);
      await assert.rejects(
        postgres.query(
          "INSERT INTO records(id,owner,kind,data,created) VALUES('forged','alice','patient','{}','2026-01-01')",
        ),
        /row-level security/,
      );
    } finally {
      await postgres.exec('RESET ROLE');
    }
  } finally {
    await postgres.close();
  }
});

test('SQL parameters preserve quoted question marks and remain positional', () => {
  assert.equal(
    parameters(
      "SELECT '?' AS literal, 'it''s ?' AS escaped WHERE id=? AND owner=?",
    ),
    "SELECT '?' AS literal, 'it''s ?' AS escaped WHERE id=$1 AND owner=$2",
  );
});
