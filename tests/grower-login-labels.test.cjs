// Grower login labels must be programmatically associated with their inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Farm name and PIN labels use htmlFor matching input ids', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../app/grower/login/GrowerLoginForm.tsx'),
    'utf8',
  );

  assert.match(src, /htmlFor=["']grower-farm-name["']/);
  assert.match(src, /id=["']grower-farm-name["']/);
  assert.match(src, /htmlFor=["']grower-pin["']/);
  assert.match(src, /id=["']grower-pin["']/);

  // Guard against regressing to unassociated visible labels.
  assert.doesNotMatch(
    src,
    /<label className=["']login-label["']>\s*Farm name\s*<\/label>/,
  );
  assert.doesNotMatch(
    src,
    /<label className=["']login-label["']>\s*PIN\s*<\/label>/,
  );
});
