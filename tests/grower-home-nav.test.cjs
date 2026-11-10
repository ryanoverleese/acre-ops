// Grower home must expose three large primary destinations by exact label.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('GrowerHome has Fields, Hardware, Recommendations nav buttons', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../app/grower/GrowerHome.tsx'),
    'utf8',
  );
  assert.match(src, /href:\s*['"]\/grower\/fields['"]/);
  assert.match(src, /href:\s*['"]\/grower\/hardware['"]/);
  assert.match(src, /href:\s*['"]\/grower\/recommendations['"]/);
  assert.match(src, /label:\s*['"]Fields['"]/);
  assert.match(src, /label:\s*['"]Hardware['"]/);
  assert.match(src, /label:\s*['"]Recommendations['"]/);
  assert.match(src, /grower-home-nav-btn/);
});
