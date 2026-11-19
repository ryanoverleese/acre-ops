const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./supabase/harness.cjs');
const hatch = f.load('lib/soils/hatch.ts');

test('common soil families get distinct, stable hatch patterns', () => {
  const names = [
    'Holdrege silt loam',
    'Butler silt loam',
    'Detroit silt loam',
    'Coly silt loam',
    'Kenesaw silt loam',
    'Fillmore silt loam',
    'Hord silt loam',
    'Kenesaw and Coly silt loams',
  ];
  const ids = names.map((name) => hatch.soilFamilyHatch(name));
  assert.deepEqual(ids, ['diag', 'back', 'horiz', 'vert', 'dots', 'cross', 'grid', 'dash']);
  assert.equal(new Set(ids).size, 8);
  assert.equal(hatch.soilFamilyHatch('Holdrege silt loam'), 'diag');
  for (const id of ids) assert.ok(hatch.SOIL_HATCH_IDS.includes(id));
});

test('unknown families hash onto a valid hatch and stay stable', () => {
  const a = hatch.soilFamilyHatch('Valentine loamy fine sand');
  const b = hatch.soilFamilyHatch('Coly-Uly silt loams');
  assert.ok(hatch.SOIL_HATCH_IDS.includes(a));
  assert.ok(hatch.SOIL_HATCH_IDS.includes(b));
  assert.equal(hatch.soilFamilyHatch('Valentine loamy fine sand'), a);
  assert.equal(hatch.soilFamilyHatch(''), hatch.soilFamilyHatch('Unnamed map unit') || hatch.soilFamilyHatch(''));
});

test('paintHatch draws a mark for every pattern and does not fill the tile', () => {
  for (const id of hatch.SOIL_HATCH_IDS) {
    const ops = [];
    const ctx = {
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      lineCap: '',
      clearRect: (...args) => ops.push(['clearRect', args]),
      beginPath: () => ops.push(['beginPath']),
      moveTo: (...args) => ops.push(['moveTo', args]),
      lineTo: (...args) => ops.push(['lineTo', args]),
      stroke: () => ops.push(['stroke']),
      arc: (...args) => ops.push(['arc', args]),
      fill: () => ops.push(['fill']),
      fillRect: (...args) => ops.push(['fillRect', args]),
    };
    hatch.paintHatch(ctx, id);
    assert.equal(ctx.strokeStyle, hatch.HATCH_STROKE);
    assert.ok(ops[0][0] === 'clearRect');
    assert.doesNotMatch(JSON.stringify(ops), /fillRect/);
    if (id === 'dots') {
      assert.ok(ops.some((op) => op[0] === 'arc'));
      assert.ok(ops.some((op) => op[0] === 'fill'));
    } else {
      assert.ok(ops.some((op) => op[0] === 'stroke'), id);
      assert.ok(ops.filter((op) => op[0] === 'moveTo').length >= 1, id);
    }
  }
});
