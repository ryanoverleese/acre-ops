import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');

function loadTs(rel) {
  const filename = path.join(root, rel.endsWith('.ts') ? rel : `${rel}.ts`);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => {
    if (id.startsWith('@/')) return loadTs(id.slice(2));
    return id;
  };
  const run = new Function('exports', 'require', 'module', output);
  run(mod.exports, localRequire, mod);
  return mod.exports;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const routes = loadTs('lib/known-routes.ts');
const site = loadTs('lib/site-metadata.ts');

test('every page and API root is a known route, and unknown URLs are not', () => {
  const pages = walk(path.join(root, 'app')).filter((file) => file.endsWith(`${path.sep}page.tsx`));
  assert.ok(pages.length > 10);
  for (const file of pages) {
    const rel = path.relative(path.join(root, 'app'), file).split(path.sep);
    rel.pop();
    const sample = `/${rel.map((part) => (part.startsWith('[') ? 'sample' : part)).join('/')}`.replace(/\/$/, '') || '/';
    assert.equal(routes.isKnownAppRoute(sample), true, sample);
  }

  const apiFiles = walk(path.join(root, 'app/api')).filter((file) => file.endsWith(`${path.sep}route.ts`));
  const roots = new Set(apiFiles.map((file) => path.relative(path.join(root, 'app/api'), file).split(path.sep)[0]));
  for (const name of roots) {
    assert.equal(routes.isKnownAppRoute(`/api/${name}`), true, name);
    assert.equal(routes.isKnownAppRoute(`/api/${name}/1/extra`), true, name);
  }

  for (const missing of ['/this-page-does-not-exist', '/approve', '/approve/only-token', '/api/not-a-real-root', '/fields/extra']) {
    assert.equal(routes.isKnownAppRoute(missing), false, missing);
  }
  assert.equal(routes.isKnownAppRoute('/login/'), true);
  assert.equal(routes.isKnownAppRoute('/field-info/token/2026'), true);
});

test('page titles and descriptions are unique and do not name a customer', () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const [title, description] of Object.values(site.PAGE_COPY)) {
    assert.equal(titles.has(title), false, title);
    assert.equal(descriptions.has(description), false, description);
    titles.add(title);
    descriptions.add(description);
    assert.doesNotMatch(description, /operation\.name|\$\{/);
    assert.doesNotMatch(title, /\$\{/);
  }
});

test('robots and sitemap do not disclose private routes', () => {
  const robots = fs.readFileSync(path.join(root, 'app/robots.ts'), 'utf8');
  const sitemap = fs.readFileSync(path.join(root, 'app/sitemap.ts'), 'utf8');
  assert.match(robots, /disallow:\s*'\/'/);
  assert.doesNotMatch(robots, /allow:\s*\[[^\]]*\/login/);
  assert.doesNotMatch(robots, /\/fields|\/api\/|\/installer|\/approve|customer|field-info/);
  assert.match(sitemap, /return \[/);
  assert.doesNotMatch(sitemap, /\/login|\/fields|\/map|\/installer|\/approve|\/field-info|\/billing/);
});

test('shared links do not put operation names in metadata', () => {
  for (const rel of [
    'app/field-info/[token]/[season]/page.tsx',
    'app/approve/[token]/[season]/page.tsx',
    'app/review/[token]/[season]/page.tsx',
  ]) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(text.includes('generateMetadata'), false, rel);
    assert.match(text, /staffMetadata\(/);
  }
});

test('content images have alt text', () => {
  const files = walk(path.join(root, 'app')).concat(walk(path.join(root, 'components'))).filter((file) => file.endsWith('.tsx'));
  const missing = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const tags = text.match(/<(?:img|Image)\b[\s\S]*?>/g) || [];
    for (const tag of tags) {
      if (!/\balt\s*=/.test(tag)) missing.push(`${path.relative(root, file)}: ${tag.slice(0, 80)}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('custom 404 is a real not-found page with a sign-in action', () => {
  const text = fs.readFileSync(path.join(root, 'app/not-found.tsx'), 'utf8');
  assert.match(text, /Page not found/);
  assert.match(text, /href="\/login"/);
  assert.match(text, /Sign in/);
  const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8');
  const exported = middleware.slice(middleware.indexOf('export default async function middleware'));
  const unknown = exported.indexOf('if (!isKnownAppRoute(pathname))');
  const authCall = exported.indexOf('authenticatedMiddleware(');
  assert.ok(unknown > 0 && unknown < authCall);
});
