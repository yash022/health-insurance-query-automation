import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let verifiedUser = null;
globalThis.__authFixture = {
  createAuthClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: verifiedUser }, error: null }),
    },
  }),
  redirect: (path) => {
    throw new Error(`redirect:${path}`);
  },
};
let source = stripTypeScriptTypes(
  readFileSync(new URL('../lib/auth.ts', import.meta.url), 'utf8'),
);
source = source
  .replace("import 'server-only';", '')
  .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
source =
  'const { createAuthClient, redirect } = globalThis.__authFixture;\n' + source;
const auth = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

test('missing verified identity stays anonymous and protected pages redirect', async () => {
  assert.equal(await auth.getUser(), null);
  await assert.rejects(auth.requireUser(), /redirect:\/login/);
});
test('record ownership uses the verified auth ID, not editable profile metadata', async () => {
  verifiedUser = {
    id: 'verified-user',
    email: 'test@example.com',
    user_metadata: { userId: 'forged-owner', full_name: 'Test' },
  };
  assert.equal((await auth.getUser()).userId, 'verified-user');
});

let ticks = 0;
globalThis.__tickFixture = async () => {
  ticks++;
};
let cronSource = stripTypeScriptTypes(
  readFileSync(new URL('../app/api/cron/route.ts', import.meta.url), 'utf8'),
);
cronSource = cronSource.replace(
  "import { tick } from '../../../lib/server';",
  'const tick = globalThis.__tickFixture;',
);
const cron = await import(
  'data:text/javascript;base64,' + Buffer.from(cronSource).toString('base64')
);
test('cron requires the exact configured bearer secret and awaits maintenance', async () => {
  const original = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    assert.equal(
      (await cron.GET(new Request('https://locker.example/api/cron'))).status,
      401,
    );
    process.env.CRON_SECRET = 'test-secret';
    assert.equal(
      (
        await cron.GET(
          new Request('https://locker.example/api/cron', {
            headers: { authorization: 'Bearer wrong' },
          }),
        )
      ).status,
      401,
    );
    assert.equal(ticks, 0);
    assert.equal(
      (
        await cron.GET(
          new Request('https://locker.example/api/cron', {
            headers: { authorization: 'Bearer test-secret' },
          }),
        )
      ).status,
      200,
    );
    assert.equal(ticks, 1);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});
