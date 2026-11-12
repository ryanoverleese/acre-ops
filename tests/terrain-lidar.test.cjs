const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const lidar = f.load('lib/terrain/lidar-source.ts');
const zoom = f.load('lib/terrain/field-map-zoom.ts');

const BOSTON_END = Date.parse('2019-05-13T00:00:00.000Z');
const BOSTON_FEET = [
  { name: 'n41w100', best: 30170, lowPs: 30.92208098137158, maxPs: 150 },
  { name: 'n41w100', best: 22645, lowPs: 10.307360350155633, maxPs: 27 },
  { name: 'ned19_n40x75_w099x25_ne_rainwater_2009', best: 161035, lowPs: 3.435786885024356, maxPs: 27 },
  { name: 'NE_SouthernNE_2018_D19', best: 50246, lowPs: 1, maxPs: 10 },
];
const BOSTON_INDEX = [{
  project: 'NE_SouthernNE_2018_D19',
  workunit: 'NE_SouthernNE_B3_2018',
  collectEndMs: BOSTON_END,
  method: 'linear-mode lidar',
}];

const DENVER_FEET = [
  { name: 'n40w105', best: 22834, lowPs: 10.307360350155633, maxPs: 27 },
  { name: 'ned19_n39x75_w105x00_co_denvercity_2008', best: 111255, lowPs: 3.435786885024356, maxPs: 27 },
  { name: 'CO_SoPlatteRiver_Lot5_2013', best: 109936, lowPs: 1, maxPs: 10 },
  { name: 'CO_DRCOG_2020_B20', best: 40154, lowPs: 1, maxPs: 10 },
];
const DENVER_INDEX = [
  { project: 'South_Platte_River_Flood_LiDAR', workunit: null, collectEndMs: Date.parse('2014-05-31T00:00:00.000Z'), method: 'linear-mode lidar' },
  { project: 'CO_DRCOG_2020_B20', workunit: null, collectEndMs: Date.parse('2020-11-15T00:00:00.000Z'), method: 'linear-mode lidar' },
];

test('Boston North at field resolution is the 2019 lidar, not the 2018 in the project name', () => {
  const foot = lidar.selectFootprint(BOSTON_FEET, lidar.FIELD_VIEW_PIXEL_M);
  assert.equal(foot.name, 'NE_SouthernNE_2018_D19');
  assert.equal(lidar.lidarLabel(BOSTON_FEET, BOSTON_INDEX), 'Lidar 2019 (USGS)');
  assert.equal(lidar.formatLidarSource(BOSTON_INDEX[0]).includes('2018'), false);
});

test('overlapping Denver projects follow the ImageServer Best value, not the finer GSD', () => {
  const foot = lidar.selectFootprint(DENVER_FEET);
  assert.equal(foot.name, 'CO_DRCOG_2020_B20');
  assert.equal(lidar.lidarLabel(DENVER_FEET, DENVER_INDEX), 'Lidar 2020 (USGS)');
});

test('a coarser pixel would still ignore overviews and null Best values', () => {
  const rows = [
    { name: 'Ov_i02_L01', best: null, lowPs: 75, maxPs: 150 },
    { name: 'NE_SouthernNE_2018_D19', best: 50246, lowPs: 1, maxPs: 10 },
  ];
  assert.equal(lidar.selectFootprint(rows, 2).name, 'NE_SouthernNE_2018_D19');
  assert.equal(lidar.selectFootprint(rows, 80), null);
});

test('index JSON uses collect_end and ignores a project-name year', () => {
  const sources = lidar.sourcesFromIndex({
    features: [{ attributes: {
      project: 'NE_SouthernNE_2018_D19',
      workunit: 'NE_SouthernNE_B3_2018',
      collect_end: BOSTON_END,
      p_method: 'linear-mode lidar',
      dem_gsd_meters: 1,
    } }],
  });
  const feet = lidar.footprintsFromImageServer({
    features: BOSTON_FEET.map((row) => ({ attributes: {
      Name: row.name, Best: row.best, LowPS: row.lowPs, MaxPS: row.maxPs,
    } })),
  });
  assert.equal(lidar.lidarLabel(feet, sources), 'Lidar 2019 (USGS)');
});

test('several index rows and no matching footprint stay hidden', () => {
  assert.equal(lidar.lidarLabel(
    [{ name: 'some_other_project', best: 1, lowPs: 1, maxPs: 10 }],
    DENVER_INDEX,
  ), null);
  assert.equal(lidar.lidarLabel([], BOSTON_INDEX), 'Lidar 2019 (USGS)');
  assert.equal(lidar.lidarLabel([], DENVER_INDEX), null);
  assert.equal(lidar.formatLidarSource({ project: 'x', workunit: null, collectEndMs: null, method: 'lidar' }), null);
});

test('field point stays inside the Boston North outline', () => {
  const ring = [
    [-99.160950182, 40.517733809],
    [-99.151508806, 40.517652248],
    [-99.151465891, 40.510441846],
    [-99.160993097, 40.510507102],
  ];
  const point = lidar.fieldInteriorPoint([ring], null, null);
  assert.ok(point.lng < -99.151 && point.lng > -99.161);
  assert.ok(point.lat < 40.518 && point.lat > 40.510);
  assert.equal(lidar.lidarPointKey(40.51649, -99.158926), '40.5165,-99.1589');
  assert.deepEqual(lidar.parseLidarPoint('40.5165,-99.1589'), { lat: 40.5165, lng: -99.1589 });
  assert.equal(lidar.parseLidarPoint('nope'), null);
  assert.equal(lidar.parseLidarPoint('91,0'), null);
});

test('lidar route is cached by path and does not change the elevation raster proxy', () => {
  const route = fs.readFileSync(path.join(__dirname, '../app/api/usgs-lidar/[point]/route.ts'), 'utf8');
  assert.match(route, /3DEPElevationIndex\/MapServer\/11\/query/);
  assert.match(route, /3DEPElevation\/ImageServer\/query/);
  assert.match(route, /Netlify-CDN-Cache-Control': 'public, s-maxage=604800/);
  assert.match(route, /collect_end/);
  assert.equal(route.includes('colorScaleForTile'), false);
  const raster = fs.readFileSync(path.join(__dirname, '../app/api/usgs-elevation/[[...path]]/route.ts'), 'utf8');
  assert.match(raster, /Netlify-CDN-Cache-Control', 'no-store'/);
  assert.equal(raster.includes('3DEPElevationIndex'), false);
  const routes = fs.readFileSync(path.join(__dirname, '../lib/known-routes.ts'), 'utf8');
  const middleware = fs.readFileSync(path.join(__dirname, '../middleware.ts'), 'utf8');
  assert.match(routes, /usgs-lidar/);
  assert.match(middleware, /\/api\/usgs-lidar/);
});

test('field map pinch snap is a tenth of a level and button steps divide evenly', () => {
  assert.equal(zoom.FIELD_MAP_ZOOM.zoomSnap, 0.1);
  assert.equal(zoom.FIELD_MAP_ZOOM.zoomDelta, 0.5);
  assert.equal(zoom.FIELD_MAP_ZOOM.wheelPxPerZoomLevel, 120);
  assert.equal(Math.round(zoom.FIELD_MAP_ZOOM.zoomDelta / zoom.FIELD_MAP_ZOOM.zoomSnap), 5);
  const map = fs.readFileSync(path.join(__dirname, '../components/fields/FieldMapBlock.tsx'), 'utf8');
  assert.match(map, /zoomSnap=\{FIELD_MAP_ZOOM\.zoomSnap\}/);
  assert.match(map, /zoomDelta=\{FIELD_MAP_ZOOM\.zoomDelta\}/);
  assert.match(map, /wheelPxPerZoomLevel=\{FIELD_MAP_ZOOM\.wheelPxPerZoomLevel\}/);
  const office = fs.readFileSync(path.join(__dirname, '../components/fields/FieldDetailMap.tsx'), 'utf8');
  const grower = fs.readFileSync(path.join(__dirname, '../app/grower/fields/[id]/FieldDetailClient.tsx'), 'utf8');
  assert.match(office, /FieldMapBlock/);
  assert.match(grower, /FieldMapBlock/);
});
