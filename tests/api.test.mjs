import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let identity = {
  userId: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice',
};
let signedKey;
const fixture = {
  env: {
    BUCKET: {
      signUpload: async (key) => {
        signedKey = key;
        return { key, token: 'signed-token' };
      },
      signDownload: async (key) =>
        `https://storage.example/private/${key}?token=test`,
      get: async () => {
        throw new Error('Foreign objects must never be read');
      },
    },
  },
  getUser: async () => identity,
  get: async (owner, id) => {
    if (owner !== 'alice' || !['patient-1', 'document-1'].includes(id))
      throw new Error('Record not found.');
    return {
      id,
      key: 'alice/patient-1/document-1',
      name: 'test.pdf',
      patient: 'patient-1',
    };
  },
  audit: async () => {},
};
globalThis.__apiFixture = fixture;
let source = stripTypeScriptTypes(
  readFileSync(
    new URL('../app/api/[...path]/route.ts', import.meta.url),
    'utf8',
  ),
);
source = source.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
source =
  'const { env, getUser, get, audit } = globalThis.__apiFixture;\nconst uid=()=>crypto.randomUUID();\n' +
  source;
const api = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);
const request = (path, body, origin = 'https://locker.example') =>
  new Request(`https://locker.example/api/${path}`, {
    method: 'POST',
    headers: {
      origin,
      ...(body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });

test('API rejects unauthenticated and cross-origin requests before storage access', async () => {
  identity = null;
  assert.equal(
    (await api.POST(request('upload-url', { patient: 'patient-1' }))).status,
    401,
  );
  identity = { userId: 'alice' };
  assert.equal(
    (
      await api.POST(
        request(
          'upload-url',
          { patient: 'patient-1' },
          'https://attacker.example',
        ),
      )
    ).status,
    403,
  );
});
test('signed upload authorization is scoped to the authenticated patient owner', async () => {
  assert.equal(
    (await api.POST(request('upload-url', { patient: 'foreign-patient' })))
      .status,
    404,
  );
  const result = await api.POST(
    request('upload-url', { patient: 'patient-1' }),
  );
  assert.equal(result.status, 200);
  assert.match(signedKey, /^alice\/patient-1\/[a-f0-9-]{36}$/);
  const form = new FormData();
  form.set('patient', 'patient-1');
  form.set('storageKey', `bob/patient-1/${crypto.randomUUID()}`);
  const rejected = await api.POST(request('upload', form));
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /Invalid upload reference/);
});
test('private downloads authorize metadata then redirect with no-store', async () => {
  const response = await api.GET(
    new Request('https://locker.example/api/file/document-1'),
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(
    response.headers.get('Location'),
    /^https:\/\/storage.example\/private\//,
  );
  assert.equal(
    (await api.GET(new Request('https://locker.example/api/file/foreign')))
      .status,
    404,
  );
});
