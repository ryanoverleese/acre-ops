// In-memory PostgreSQL only. No project credentials, TCP, or live service writes.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const root = path.resolve(__dirname, '../..');
const fixture = { db: null, tags: [], session: null, cookies: new Map(), storage: [], callbacks: [], failSql: null };
const originalLoad = Module._load;
class Pool {
  on() {}
  async query(sql, values) {
    if (fixture.failSql?.(sql, values)) throw Object.assign(new Error('fixture failure'), {code: '23514'});
    return fixture.db.query(sql, values);
  }
  async connect() { return { query: this.query.bind(this), release() {} }; }
  async end() {}
}
Module._load = function(specifier, parent, main) {
  if (specifier === 'server-only') return {};
  if (specifier === 'pg') return {Pool, types: {setTypeParser() {}}};
  if (specifier === 'next/cache') return {unstable_cache: fn => fn, revalidateTag: (...args) => fixture.tags.push(args), revalidatePath() {}};
  if (specifier === 'next/headers') return {cookies: async () => ({get: key => fixture.cookies.has(key) ? {value: fixture.cookies.get(key)} : undefined, set: (key,value) => fixture.cookies.set(key,value), delete: key => fixture.cookies.delete(key)})};
  if (specifier === '@/auth') return {auth: async () => fixture.session};
  if (specifier.startsWith('@/')) specifier = path.join(root, specifier.slice(2));
  if ((specifier.startsWith('.') || specifier.startsWith(root)) && !path.extname(specifier)) {
    const candidate = path.resolve(path.dirname(parent.filename), specifier) + '.ts';
    if (fs.existsSync(candidate)) specifier = candidate;
  }
  return originalLoad.call(this, specifier, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true}}).outputText, filename);
process.env.SUPABASE_URL = 'https://junawlttpyztjlnbmvcb.supabase.co';
process.env.DATABASE_URL = 'postgresql://postgres:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';
delete process.env.DATABASE_URL_ALT;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_fixture_only';
process.env.AUTH_SECRET = 'fixture-only-not-production';
process.env.REMOVAL_WEBHOOK_DRY_RUN = 'true';
global.fetch = async (...args) => { throw new Error('External HTTP is forbidden in contract tests'); };
fixture.initialize = async () => {
  fixture.db = new PGlite({extensions: {pgcrypto}});
  await fixture.db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(file=>file.endsWith('.sql')).sort())
    await fixture.db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  return fixture;
};
fixture.load = file => require(path.join(root, file));
fixture.request = (path, body, method = 'POST') => new Request(`http://localhost${path}`, {method, headers: {'Content-Type': 'application/json'}, ...(method === 'GET' ? {} : {body: JSON.stringify(body)})});
module.exports = fixture;
