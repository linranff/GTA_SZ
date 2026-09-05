import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MapRoadIndex, mapToScreen, screenToMap, zoomMapAt, placeMapLabels, wgs84ToMap, roadLabelAnchor,
  type MapView, type SourcedMapPlace} from '../src/city-map-geometry.ts';
import type {CityData, Road, V2} from '../src/city-types.ts';
import {localMapView, rememberLocalMapWidth} from '../src/city-map-view.ts';

const close = (a: number, b: number, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);
const makeRoad = (name: string, points: V2[]): Road => ({id: name, name, points, kind: 'primary', width: 10, grade: '0', oneway: true});

test('opening the map centers the current driving or observer location at a local scale', () => {
  const view = {x: 0, z: 0, scale: .08, width: 1280, height: 740};
  for (const focus of [[-2670, -864], [2860, 620]] as V2[]) {
    const local = localMapView(view, .08, focus);
    assert.deepEqual(mapToScreen(local, focus), [640, 370]);
    assert.ok(local.scale >= .08 * 4.5);
    assert.ok(local.width / local.scale <= 2600);
  }
});

test('reopening preserves local zoom after travel, while a full-city detour does not overwrite it', () => {
  const zoomed = {x: -2670, z: -864, scale: .8, width: 1280, height: 740};
  const remembered = rememberLocalMapWidth(zoomed, .08, null);
  assert.equal(remembered, 1600);
  const allCity = {...zoomed, scale: .08};
  assert.equal(rememberLocalMapWidth(allCity, .08, remembered), 1600);
  const reopened = localMapView(allCity, .08, [2860, 620], remembered);
  assert.deepEqual([reopened.x, reopened.z], [2860, 620]);
  assert.equal(reopened.width / reopened.scale, 1600);
  const resized = localMapView({...allCity, width: 640}, .04, [2860, 620], remembered);
  assert.equal(resized.width / resized.scale, 1600);
});

test('local map scale remains bounded on narrow screens and rejects invalid stored widths', () => {
  const view = {x: 0, z: 0, scale: .02, width: 210, height: 600};
  for (const remembered of [null, NaN, Infinity, -5, 0, 1, 1e8]) {
    const local = localMapView(view, .02, [0, 0], remembered);
    assert.ok(local.scale >= .02 * 2.4 && local.scale <= .02 * 18);
    assert.ok(Number.isFinite(local.scale));
  }
});

test('map coordinates preserve east/north direction and round-trip at distant zoomed views', () => {
  const views: MapView[] = [{x: 0, z: 0, scale: .08, width: 1280, height: 740}, {x: -5188.215, z: -638.21, scale: 1.6, width: 920, height: 560}];
  for (const view of views) for (const point of [[-6100, 1400], [6790, -2600], [0, 0]] as V2[]) {
    const screen = mapToScreen(view, point), roundTrip = screenToMap(view, screen);
    close(roundTrip[0], point[0]); close(roundTrip[1], point[1]);
  }
  const view = views[0];
  assert.ok(mapToScreen(view, [100, 0])[0] > mapToScreen(view, [0, 0])[0]);
  assert.ok(mapToScreen(view, [0, 100])[1] < mapToScreen(view, [0, 0])[1]);
});

test('wheel and pinch zoom keep the world position under the pointer unchanged', () => {
  const view = {x: -2800, z: -900, scale: .09, width: 1290, height: 780};
  for (const pointer of [[10, 20], [645, 390], [1200, 720]] as V2[]) {
    const before = screenToMap(view, pointer), after = screenToMap(zoomMapAt(view, pointer, .82), pointer);
    close(before[0], after[0]); close(before[1], after[1]);
  }
});

test('label layers share collision bounds and honor selected-place priority', () => {
  const placed = placeMapLabels([
    {id: 'road', x: 100, y: 100, width: 100, height: 25, priority: 20},
    {id: 'selected-landmark', x: 100, y: 100, width: 130, height: 30, priority: 1000},
    {id: 'neighbourhood', x: 100, y: 100, width: 130, height: 30, priority: 100, offsets: [[0, 0], [0, 60]]},
    {id: 'clipped', x: 5, y: 5, width: 80, height: 25, priority: 300},
  ], 400, 250, 7);
  assert.deepEqual(placed.map(p => p.id), ['selected-landmark', 'neighbourhood']);
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    assert.ok(a.left + a.width + 7 <= b.left || b.left + b.width + 7 <= a.left || a.top + a.height + 7 <= b.top || b.top + b.height + 7 <= a.top);
  }
});

test('road selections stay on source polylines and preserve one-way direction', () => {
  const road = makeRoad('科苑南路', [[-5194.37, -581.3], [-5188.64, -616.52], [-5187.79, -659.9]]);
  const index = new MapRoadIndex([road, makeRoad('远处道路', [[1200, 1200], [1400, 1200]])]);
  const point = index.nearest([-5188.215, -638.21])!;
  close(point.distance, 0); close(point.yaw, 3.1220008775822787); assert.equal(point.road.name, '科苑南路');
  const distant = index.nearest([9000, 3000])!;
  close(distant.x, 1400); close(distant.z, 1200);
  const byName = index.nearest([1200, 1200], '科苑南路')!;
  assert.equal(byName.road.name, '科苑南路');
});

test('road label anchors use arc length, not a bounding-box or vertex average', () => {
  const anchor = roadLabelAnchor(makeRoad('曲线路', [[0, 0], [100, 0], [100, 20]]))!;
  assert.deepEqual(anchor.point, [60, 0]); close(anchor.length, 120); close(anchor.angle, 0);
  assert.equal(roadLabelAnchor(makeRoad('退化', [[0, 0], [0, 0]])), null);
});

test('sourced place catalog has unique source IDs and uses the current game coordinate conversion', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../data/map-places.json', import.meta.url), 'utf8')) as {schemaVersion: number; places: SourcedMapPlace[]};
  assert.equal(catalog.schemaVersion, 1); assert.ok(catalog.places.length > 150);
  assert.equal(new Set(catalog.places.map(place => place.id)).size, catalog.places.length);
  assert.deepEqual(catalog.places.filter(place => place.kind === 'city').map(place => place.name).sort(), ['南山区', '福田区', '罗湖区']);
  for (const place of catalog.places) {
    const [x, z] = wgs84ToMap(place.lon, place.lat);
    close(place.x, x, .00002); close(place.z, z, .00002);
    assert.match(place.source.url!, /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
    assert.ok(place.source.file && place.source.coordinateMethod);
  }
  const city = JSON.parse(fs.readFileSync(new URL('../public/city/city.json', import.meta.url), 'utf8')) as CityData;
  for (const landmark of city.landmarks as (typeof city.landmarks[number] & {lon?: number; lat?: number})[]) {
    if (landmark.lon === undefined || landmark.lat === undefined) continue;
    const [x, z] = wgs84ToMap(landmark.lon, landmark.lat);
    close(x, landmark.x, .011); close(z, landmark.z, .011);
  }
});
