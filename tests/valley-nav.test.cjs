const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const shellPath = path.join(root, 'components/AppShell.tsx');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('Valley Pivots is one Reports link to the existing route', () => {
  const source = read('components/AppShell.tsx');
  const links = source.match(/href:\s*'\/valley-pivots'/g) || [];
  assert.equal(links.length, 1);
  assert.match(source, /name:\s*'Valley Pivots',\s*href:\s*'\/valley-pivots',\s*icon:\s*'pivot'/);
  const reports = source.slice(source.indexOf("title: 'Reports'"), source.indexOf("title: 'Supplies'"));
  assert.match(reports, /href:\s*'\/valley-pivots'/);
  const installerPages = source.match(/const installerPages = \[([\s\S]*?)\];/)[1];
  assert.doesNotMatch(installerPages, /valley-pivots/);
  const installerRoutes = read('middleware.ts').match(/const INSTALLER_ROUTES = \[([\s\S]*?)\];/)[1];
  assert.doesNotMatch(installerRoutes, /valley-pivots/);
  assert.equal(fs.existsSync(path.join(root, 'app/valley-pivots/page.tsx')), true);

  const duplicates = [];
  for (const file of walk(path.join(root, 'app')).concat(walk(path.join(root, 'components')))) {
    const text = fs.readFileSync(file, 'utf8');
    const count = text.match(/href[=:][^\n;]*\/valley-pivots/g)?.length || 0;
    if (count && path.relative(root, file) !== 'components/AppShell.tsx') duplicates.push(`${path.relative(root, file)}:${count}`);
  }
  assert.deepEqual(duplicates, []);
});

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

let pathname = '/';
let session = null;
const originalLoad = Module._load;
Module._load = function (specifier, parent, isMain) {
  if (specifier === 'next/link') {
    function Link({ href, children, ...rest }) {
      return React.createElement('a', { href, ...rest }, children);
    }
    return { __esModule: true, default: Link };
  }
  if (specifier === 'next/navigation') return { usePathname: () => pathname };
  if (specifier === 'next-auth/react') return { useSession: () => ({ data: session }), signOut() {} };
  if (specifier === './NotificationBell') return { __esModule: true, default: () => null };
  if (specifier.startsWith('@/')) {
    const base = path.join(root, specifier.slice(2));
    const file = ['.ts', '.tsx', '.js'].map((ext) => base + ext).find((candidate) => fs.existsSync(candidate));
    if (!file) throw new Error(`Cannot resolve ${specifier}`);
    return originalLoad.call(this, file, parent, isMain);
  }
  return originalLoad.call(this, specifier, parent, isMain);
};
function compile(module, filename) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  module._compile(compiled, filename);
}
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;

const AppShell = require(shellPath).default;

function render() {
  return renderToStaticMarkup(React.createElement(AppShell, null, React.createElement('div', null, 'page')));
}

test('staff desktop and mobile menus share one Valley Pivots link', () => {
  session = { user: { role: 'admin', name: 'Staff' } };
  pathname = '/fields';
  const html = render();
  assert.equal((html.match(/href="\/valley-pivots"/g) || []).length, 1);
  assert.match(html, /Valley Pivots/);
  assert.match(html, /class="mobile-header"/);
  assert.match(html, /class="sidebar /);
  assert.doesNotMatch(html, /href="\/valley-pivots"[^>]*class="[^"]*\bactive\b/);

  pathname = '/valley-pivots';
  const active = render();
  assert.match(active, /href="\/valley-pivots"[^>]*class="nav-item active"/);
});

test('installer menus and public pages do not show Valley Pivots', () => {
  session = { user: { role: 'installer', name: 'Crew' } };
  pathname = '/install';
  const html = render();
  assert.equal((html.match(/valley-pivots/g) || []).length, 0);
  assert.match(html, /href="\/install"/);

  pathname = '/login';
  const login = render();
  assert.equal(login, '<div>page</div>');
});
