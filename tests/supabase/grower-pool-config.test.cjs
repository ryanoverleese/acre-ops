// Production must refuse owner-pool fallback without DATABASE_URL_GROWER.
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./harness.cjs');

process.env.DATABASE_URL_GROWER =
  'postgresql://acre_grower:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';

test.before(async () => {
  await f.initialize();
});

test.after(async () => {
  await f.db?.close();
});

test('production without DATABASE_URL_GROWER rejects unless GROWER_ALLOW_OWNER_FALLBACK=1', async () => {
  const prevUrl = process.env.DATABASE_URL_GROWER;
  const prevNode = process.env.NODE_ENV;
  const prevAllow = process.env.GROWER_ALLOW_OWNER_FALLBACK;
  delete process.env.DATABASE_URL_GROWER;
  delete process.env.GROWER_ALLOW_OWNER_FALLBACK;
  process.env.NODE_ENV = 'production';

  // Reload module so pool bootstrap re-reads env (harness caches requires).
  const resolved = require.resolve('../../lib/supabase/grower.ts');
  delete require.cache[resolved];
  const { withGrowerOperation, growerQuery } = f.load('lib/supabase/grower.ts');
  const { DataError } = f.load('lib/supabase/registry.ts');

  await assert.rejects(
    () => withGrowerOperation(1, () => growerQuery('SELECT 1 AS ok')),
    (err) => err instanceof DataError && err.status === 503,
  );

  process.env.GROWER_ALLOW_OWNER_FALLBACK = '1';
  delete require.cache[resolved];
  const again = f.load('lib/supabase/grower.ts');
  const rows = await again.withGrowerOperation(1, () => again.growerQuery('SELECT 1 AS ok'));
  assert.equal(Number(rows[0].ok), 1);

  process.env.DATABASE_URL_GROWER = prevUrl;
  process.env.NODE_ENV = prevNode;
  if (prevAllow == null) delete process.env.GROWER_ALLOW_OWNER_FALLBACK;
  else process.env.GROWER_ALLOW_OWNER_FALLBACK = prevAllow;
  delete require.cache[resolved];
});
