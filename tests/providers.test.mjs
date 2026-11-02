import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(
  'CREATE TABLE records(id TEXT PRIMARY KEY,owner TEXT,kind TEXT,patient TEXT,fingerprint TEXT,data TEXT,created TEXT);CREATE TABLE jobs(id TEXT PRIMARY KEY,owner TEXT,query TEXT,channel TEXT,status TEXT,attempts INTEGER DEFAULT 0,next INTEGER DEFAULT 0,data TEXT,UNIQUE(query,channel));',
);
const DB = {
  prepare(sql) {
    return {
      bind(...args) {
        return {
          async run() {
            const r = sqlite.prepare(sql).run(...args);
            return { meta: { changes: Number(r.changes) } };
          },
          async first() {
            return sqlite.prepare(sql).get(...args);
          },
          async all() {
            return { results: sqlite.prepare(sql).all(...args) };
          },
        };
      },
    };
  },
};
globalThis.__careEnv = {
  DB,
  GEMINI_API_KEY: 'mock',
  RESEND_API_KEY: 'mock',
  EMAIL_FROM: 'care@example.com',
  TWILIO_ACCOUNT_SID: 'mock',
  TWILIO_AUTH_TOKEN: 'mock',
  TWILIO_WHATSAPP_FROM: '+15005550006',
};
const domain = stripTypeScriptTypes(
  readFileSync(new URL('../lib/domain.ts', import.meta.url), 'utf8'),
);
const domainURL =
  'data:text/javascript;base64,' + Buffer.from(domain).toString('base64');
let source = stripTypeScriptTypes(
  readFileSync(new URL('../lib/server.ts', import.meta.url), 'utf8'),
);
source = source
  .replace(
    "import { env } from 'cloudflare:workers';",
    'const env=globalThis.__careEnv;',
  )
  .replace("from './domain'", `from '${domainURL}'`);
const server = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);
let deliveries = [],
  mode = 'ok';
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('generativelanguage'))
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  points: [
                    {
                      request: 'Provide discharge summary',
                      status: 'available',
                      documentIds: ['doc'],
                      evidence: 'Discharge summary: patient A.',
                      reason: 'Already in the locker.',
                      patientRequest: '',
                    },
                    {
                      request: 'Provide payment receipt',
                      status: 'needed',
                      documentIds: [],
                      evidence: '',
                      reason: 'Proof of payment is needed.',
                      patientRequest: 'Share your hospital payment receipt.',
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });
  if (opts.method === 'POST') {
    deliveries.push({
      url: String(url),
      body: String(opts.body),
      headers: opts.headers,
    });
    if (mode === 'timeout' && String(url).includes('twilio'))
      throw new Error('Timeout');
    if (mode === 'rate-limit')
      return Response.json({ code: 'rate_limit' }, { status: 429 });
    return Response.json(
      String(url).includes('twilio')
        ? { sid: 'SM123', status: 'queued' }
        : { id: 'em123' },
    );
  }
  return Response.json(
    String(url).includes('twilio')
      ? { status: 'delivered' }
      : { last_event: 'delivered' },
  );
};
async function fixture(owner, consent = true) {
  const p = await server.put(owner, 'patient', {
    name: 'A',
    claim: 'C1',
    patientId: 'P1',
    insurer: 'Test insurer',
    email: 'patient@example.com',
    phone: '+919876543210',
    consent,
  });
  await server.put(
    owner,
    'document',
    {
      name: 'summary',
      category: 'Discharge summary',
      text: 'Discharge summary: patient A.',
      claim: 'C1',
      status: 'ready',
    },
    p.id,
    'doc',
  );
  return {
    p,
    q: await server.put(
      owner,
      'query',
      {
        name: 'Query',
        text: 'Please provide discharge summary and payment receipt.',
        status: 'processing',
      },
      p.id,
    ),
  };
}
test('upload processing automatically creates and submits exactly two channels with matching evidence', async () => {
  const { q } = await fixture('owner-a');
  const result = await server.processQuery('owner-a', q);
  assert.equal(result.status, 'processed');
  const m = await server.messages('owner-a');
  assert.equal(m.length, 2);
  assert.ok(m.every((m) => m.status === 'accepted'));
  assert.equal(deliveries.length, 2);
  assert.ok(m.every((m) => m.body.includes('payment receipt')));
  assert.ok(
    m.every(
      (m) =>
        !m.body.split('Already available')[0].includes('discharge summary'),
    ),
  );
  await server.drain('owner-a');
  assert.equal(deliveries.length, 2, 'Submitted jobs are never resent');
  await server.refreshDelivery('owner-a');
  assert.ok(
    (await server.messages('owner-a')).every((m) => m.status === 'delivered'),
  );
  await assert.rejects(() => server.get('foreign', q.id), /not found/);
  assert.equal((await server.messages('foreign')).length, 0);
});
test('missing consent blocks both channels without contacting providers', async () => {
  sqlite.exec("DELETE FROM records WHERE id='doc'");
  const { q } = await fixture('owner-b', false);
  const count = deliveries.length;
  await server.processQuery('owner-b', q);
  assert.equal(deliveries.length, count);
  assert.ok(
    (await server.messages('owner-b')).every(
      (m) => m.status === 'blocked' && m.error.includes('consent'),
    ),
  );
});
test('WhatsApp timeout is uncertain, never blindly retried; email independently succeeds', async () => {
  mode = 'timeout';
  sqlite.exec("DELETE FROM records WHERE id='doc'");
  const { q } = await fixture('owner-c');
  await server.processQuery('owner-c', q);
  const m = await server.messages('owner-c');
  assert.equal(m.find((m) => m.channel === 'whatsapp').status, 'uncertain');
  assert.equal(m.find((m) => m.channel === 'email').status, 'accepted');
  const count = deliveries.length;
  await server.drain('owner-c');
  assert.equal(deliveries.length, count);
});
test('provider rate limiting schedules a bounded retry without marking sent', async () => {
  mode = 'rate-limit';
  sqlite.exec("DELETE FROM records WHERE id='doc'");
  const { q } = await fixture('owner-d');
  await server.processQuery('owner-d', q);
  assert.ok(
    (await server.messages('owner-d')).every(
      (m) => m.status === 'retry' && m.next > Date.now(),
    ),
  );
});
