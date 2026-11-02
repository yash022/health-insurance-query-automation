import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
assert.ok(
  /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base),
  'Smoke tests only run against a local preview.',
);
assert.ok(
  process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD,
  'Configure a dedicated smoke-test account.',
);
const jar = new Map();
const auth = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) =>
        values.forEach(({ name, value }) => jar.set(name, value)),
    },
  },
);
const { error: signInError } = await auth.auth.signInWithPassword({
  email: process.env.SMOKE_EMAIL,
  password: process.env.SMOKE_PASSWORD,
});
assert.ifError(signInError);
const headers = {
  Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
  Origin: base,
};
async function request(path, body) {
  const r = await fetch(base + '/api/' + path, {
    headers: {
      ...headers,
      ...(body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    ...(body
      ? {
          method: 'POST',
          body: body instanceof FormData ? body : JSON.stringify(body),
        }
      : {}),
  });
  return { status: r.status, body: await r.json() };
}
assert.equal(
  (await fetch(base + '/api/state')).status,
  401,
  'Unauthenticated reads rejected',
);
let state = await request('state');
assert.equal(state.status, 200);
if (!state.body.patients.length) {
  assert.equal((await request('seed', {})).status, 200);
  state = await request('state');
}
assert.equal(state.body.patients.length, 10);
const patient = state.body.patients[0];
assert.equal(
  (
    await fetch(base + '/api/settings', {
      method: 'POST',
      headers: {
        Cookie: headers.Cookie,
        Origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  ).status,
  403,
  'Cross-origin writes rejected',
);
assert.equal(
  (
    await request(
      'upload',
      (() => {
        const f = new FormData();
        f.set('patient', 'nonexistent');
        f.set('text', 'private');
        return f;
      })(),
    )
  ).status,
  404,
  'Foreign/missing patient rejected',
);
const f = new FormData();
f.set('patient', patient.id);
f.set('kind', 'query');
f.set(
  'text',
  '1. Please provide discharge summary and payment receipt.\n2. Clarify duration of illness.',
);
const uploaded = await request('upload', f);
assert.equal(uploaded.status, 200);
const duplicate = await request('upload', f);
assert.equal(duplicate.body.duplicate, true);
assert.equal(duplicate.body.id, uploaded.body.id);
assert.equal(
  (await request('reanalyze', { id: uploaded.body.id })).status,
  200,
);
const latest = (await request('state')).body;
const q = latest.queries.find((q) => q.id === uploaded.body.id);
assert.equal(q.status, 'awaiting_setup');
assert.equal(q.points.length, 3);
assert.equal(
  latest.messages.filter((m) => m.query === q.id).length,
  0,
  'Unconfigured analysis never sends guesses',
);
const file = await fetch(base + '/api/file/' + state.body.documents[0].id, {
  headers,
});
assert.equal(file.status, 200);
assert.match(await file.text(), /SYNTHETIC/);
assert.equal(
  (await fetch(base + '/api/file/' + state.body.documents[0].id)).status,
  401,
);
assert.equal(
  (await request('settings', { template: 'Invalid template' })).status,
  400,
);
assert.equal(
  (
    await request('patient', {
      name: 'Test',
      patientId: 'PTEST',
      claim: 'CTEST',
      insurer: 'Test',
      email: 'invalid',
    })
  ).status,
  400,
);
console.log(
  'API smoke passed: authentication, CSRF, ownership, real upload/persistence, duplicate prevention, analysis gating, original downloads and validation.',
);
