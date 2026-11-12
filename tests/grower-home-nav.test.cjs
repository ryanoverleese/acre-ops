const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('grower opens on Fields and does not keep a home page', () => {
  const page = fs.readFileSync(path.join(__dirname, '../app/grower/page.tsx'), 'utf8');
  assert.match(page, /redirect\('\/grower\/fields'\)/);
  assert.equal(fs.existsSync(path.join(__dirname, '../app/grower/GrowerHome.tsx')), false);
  const login = fs.readFileSync(path.join(__dirname, '../app/grower/login/page.tsx'), 'utf8');
  assert.match(login, /\/grower\/fields/);
  const middleware = fs.readFileSync(path.join(__dirname, '../middleware.ts'), 'utf8');
  assert.match(middleware, /pathname === '\/grower' \? '\/grower\/fields'/);
  for (const file of [
    'app/grower/fields/GrowerFieldsList.tsx',
    'app/grower/hardware/GrowerHardwareList.tsx',
    'app/grower/recommendations/GrowerRecommendationsList.tsx',
  ]) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.equal(src.includes('>Home<'), false, file);
  }
});
