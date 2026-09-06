import test from 'node:test';
import assert from 'node:assert/strict';
import {CityCollision} from '../src/driving.ts';
import {createObserverDestinationResolver} from '../src/city-observer-destination.ts';
import type {CityData, Landmark, Road, V2} from '../src/city-types.ts';

const ring = (x0: number, z0: number, x1: number, z1: number): V2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
const road = (points: V2[] = [[-400, 0], [400, 0]], overrides: Partial<Road> = {}): Road =>
  ({id: 'road', name: '海湾路', kind: 'residential', width: 8, oneway: true, grade: '0', points, ...overrides});
function city(overrides: Partial<CityData> = {}): CityData {
  return {meta: {counts: {}, extent: [-1000, -1000, 1000, 1000], horizontalScale: .6}, land: [[ring(-1000, -1000, 1000, 1000)]],
    coast: [], roads: [road()], buildings: [], green: [], water: [], landmarks: [], spawn: {x: 0, z: 0, yaw: 0, road: '海湾路'}, ...overrides};
}
function resolver(data = city(), options: {groundHeight?: (x: number, z: number) => number; propBlocked?: (x: number, z: number) => boolean; collision?: CityCollision} = {}) {
  return createObserverDestinationResolver({data, collision: options.collision ?? new CityCollision(data), groundHeight: options.groundHeight ?? (() => 0),
    propBlocked: options.propBlocked ?? (() => false), waterHeight: -.25});
}

test('aerial selection preserves the clicked position and aligns arrival with a nearby real road', () => {
  const selected = resolver()({x: 42, y: 0, z: 35})!;
  assert.deepEqual([selected.x, selected.y, selected.z], [42, 0, 35]);
  assert.deepEqual(selected.arrival, [42, 0]);
  assert.equal(selected.yaw, Math.PI / 2);
  assert.equal(selected.name, '海湾路附近');
});

test('a roof selection names the nearby landmark and arrives outside its building footprint', () => {
  const landmark: Landmark = {id: 'tower', name: '海湾大厦', x: 40, z: 40, height: 80, area: '海湾', excludeRadius: 0, arrival: [40, 0], yaw: 0};
  const data = city({buildings: [{rings: [ring(20, 20, 60, 60)], height: 80, style: 'tower'}], landmarks: [landmark]});
  const resolve = resolver(data), selected = resolve({x: 40, y: 80, z: 40})!;
  assert.equal(selected.name, '海湾大厦');
  assert.equal(selected.y, 80);
  assert.ok(selected.arrival && Math.hypot(selected.arrival[0] - 40, selected.arrival[1]) < 1e-8);
  assert.equal(resolve({x: 40, y: 80, z: 40}, '自己的摄影点')?.name, '自己的摄影点');
});

test('a water-surface pick stays collectible even immediately beside a valid shoreline road', () => {
  const data = city({water: [{rings: [ring(-500, 10, 500, 700)], name: '海湾'}]});
  for (const point of [{x: 0, y: -.25, z: 11}, {x: 0, y: -.20, z: 11}, {x: 0, y: -.25, z: 650}]) {
    const selected = resolver(data)(point)!;
    assert.ok(selected);
    assert.equal(selected.arrival, undefined);
    assert.equal(selected.yaw, undefined);
  }
});

test('a road through water requires actual bridge clearance across the entire car', () => {
  const data = city({water: [{rings: [ring(-200, -100, 200, 100)], name: '河道'}]});
  const resolveBridge = resolver(data, {groundHeight: () => 2.8});
  assert.deepEqual(resolveBridge({x: 0, y: 2.8, z: 0})?.arrival, [0, 0]);
  for (const height of [0, .4]) {
    assert.equal(resolver(data, {groundHeight: () => height})({x: 0, y: 2.8, z: 0})?.arrival, undefined);
  }
  assert.equal(resolver(data, {groundHeight: (_x, z) => z > .8 ? 0 : 2.8})({x: 0, y: 2.8, z: 0})?.arrival, undefined);
});

test('offshore coordinates cannot snap to a road beyond the local search radius', () => {
  const resolve = resolver();
  assert.equal(resolve({x: 0, y: 1, z: 301})?.arrival, undefined);
  assert.equal(resolve({x: 0, y: 1, z: 700})?.name, '城市风景');
  assert.deepEqual(resolve({x: 0, y: 1, z: 300})?.arrival, [0, 0]);
});

test('underground, nonmotorized and degenerate roads cannot be arrivals', () => {
  const roads = [road(undefined, {grade: '-1'}), road([[-400, 10], [400, 10]], {kind: 'footway'}),
    road([[-400, 20], [400, 20]], {kind: 'path'}), road([[-400, 30], [400, 30]], {kind: 'cycleway'}),
    road([[-400, 40], [400, 40]], {kind: 'steps'}), road([[-400, 50], [400, 50]], {kind: 'pedestrian'}),
    road([[0, 60], [0, 60]]), road([[-400, 70], [400, 70]], {width: 2}), road([[-400, 80], [400, 80]], {grade: 'invalid'})];
  assert.equal(resolver(city({roads}))({x: 0, y: 0, z: 0})?.arrival, undefined);
  roads.push(road([[-400, 90], [400, 90]], {kind: 'primary_link'}));
  assert.deepEqual(resolver(city({roads}))({x: 0, y: 0, z: 0})?.arrival, [0, 90]);
});

test('blocked projected positions retry along the same road and avoid prop obstacles at car corners', () => {
  const data = city(), collision = new CityCollision(data);
  collision.blocked = (x, z) => x > -4 && x < 4 && z > .8;
  const selected = resolver(data, {collision})({x: 0, y: 0, z: 1})!;
  assert.deepEqual(selected.arrival, [8, 0]);
  assert.deepEqual(resolver(data, {propBlocked: (x, z) => x > -4 && x < 12 && z < -.8})({x: 0, y: 0, z: 1})?.arrival, [-8, 0]);
  assert.equal(resolver(data, {propBlocked: (_x, z) => z > .8})({x: 0, y: 0, z: 1})?.arrival, undefined);
});

test('narrow roads and unsafe height discontinuities cannot fit an arrival vehicle', () => {
  assert.equal(resolver(city({roads: [road(undefined, {width: 2.8})]}))({x: 0, y: 0, z: 0})?.arrival, undefined);
  assert.equal(resolver(city(), {groundHeight: (_x, z) => z > .8 ? 2 : 0})({x: 0, y: 0, z: 0})?.arrival, undefined);
  assert.equal(resolver(city(), {groundHeight: () => NaN})({x: 0, y: 0, z: 0})?.arrival, undefined);
  assert.equal(resolver(city(), {groundHeight: (_x, z) => z > .8 ? NaN : 0})({x: 0, y: 0, z: 0})?.arrival, undefined);
});

test('arrival checks extent for the whole car and rejects malformed picked coordinates', () => {
  const resolve = resolver(city({roads: [road([[999, -20], [999, 20]])]}));
  assert.equal(resolve({x: 999, y: 0, z: 0})?.arrival, undefined);
  for (const point of [{x: 1001, y: 0, z: 0}, {x: 0, y: 0, z: -1001}, {x: NaN, y: 0, z: 0},
    {x: 0, y: Infinity, z: 0}, {x: 0, y: 0, z: -Infinity}]) assert.equal(resolve(point), null);
  assert.equal(resolve(null as unknown as {x: number; y: number; z: number}), null);
});
