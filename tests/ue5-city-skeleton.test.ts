import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {CITY_STORY_CONTENT} from '../src/city-story-content.ts';
import {validateStoryContent} from '../src/city-story.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = (relative: string) => join(root, relative);

test('export city skeleton and keep Babylon baseline', () => {
  const skeleton = JSON.parse(readFileSync(file('ue5/Shenchengji/Content/City/city-skeleton.json'), 'utf8'));
  const story = JSON.parse(readFileSync(file('ue5/Shenchengji/Content/City/bay-last-delivery.json'), 'utf8'));
  const sites = JSON.parse(readFileSync(file('public/city/life-sites.json'), 'utf8')).sites as {id:string;name:string;arrival:[number,number]}[];
  const hub = sites.find(site => site.id === 'hub')!;
  const office = sites.find(site => site.id === 'office')!;
  const workshop = sites.find(site => site.id === 'workshop')!;

  assert.equal(hub.name, '海湾生活驿站');
  assert.equal(office.name, '科苑下班驿站');
  assert.equal(workshop.name, '公园城市养护站');
  assert.equal(skeleton.places.hub.name, hub.name);
  assert.equal(skeleton.places.office.name, office.name);
  assert.equal(skeleton.places.park.name, workshop.name);
  assert.equal(skeleton.places.workshop.name, workshop.name);
  assert.equal(skeleton.places.bay.name, '滨海路边交接点');
  assert.equal(skeleton.places.hub.x, hub.arrival[0]);
  assert.equal(skeleton.places.hub.buildingX, hub.x);
  assert.equal(typeof skeleton.places.hub.heading, 'number');
  assert.equal(skeleton.places.office.x, office.arrival[0]);
  assert.equal(skeleton.places.park.x, workshop.arrival[0]);
  assert.notEqual(skeleton.places.workshop.x, office.arrival[0]);
  assert.equal(skeleton.unrealCentimetersPerGameMeter, 100);
  assert.deepEqual(skeleton.originWGS84, [114.025, 22.536]);
  assert.ok(skeleton.counts.exportedRoads > 0);
  assert.ok(existsSync(file('src/main.ts')));
  assert.ok(existsSync(file('src/city-world.ts')));
  assert.ok(existsSync(file('ue5/Shenchengji/Shenchengji.uproject')));
  assert.equal(story.id, 'bay-last-delivery');
  assert.equal(story.reward, 180);
  assert.equal(story.firstStep, CITY_STORY_CONTENT.firstStep);
  assert.deepEqual(story.steps.map((step: {id:string}) => step.id), CITY_STORY_CONTENT.steps.map(step => step.id));
  assert.deepEqual(validateStoryContent(story), []);
  assert.deepEqual(validateStoryContent(CITY_STORY_CONTENT), []);

  const imported = JSON.parse(readFileSync(file('ue5/Shenchengji/Content/City/imported-assets.json'), 'utf8'));
  const sources = new Set((imported.imported as {source:string}[]).map(item => item.source));
  assert.ok(sources.has('life-hub.glb'));
  assert.ok(sources.has('car.glb'));
  assert.ok(sources.has('roads.glb'));
  assert.ok(sources.has('buildings.glb'));
  assert.ok(sources.has('landmarks.glb'));
  assert.ok(sources.has('terrain.glb'));
  assert.ok(sources.has('facades.glb'));
  assert.ok(existsSync(file('ue5/Shenchengji/Content/Imported/LifeHub/life_hub_hub_terrazzo.uasset')));
  assert.ok(existsSync(file('ue5/Shenchengji/Content/Maps/CombatLab.umap')));
  assert.ok(existsSync(file('ue5/Shenchengji/Content/Imported/Roads/roads_0_0_asphalt.uasset')));
  assert.ok(existsSync(file('ue5/Shenchengji/Content/Imported/Landmarks/landmark_bamboo_lampwarm.uasset')));
  assert.ok(existsSync(file('ue5/Shenchengji/Content/Maps/ShenzhenCity.umap')));

  const layout = JSON.parse(readFileSync(file('ue5/Shenchengji/Content/City/mesh-layout.json'), 'utf8'));
  const counts = Object.fromEntries(layout.groups.map((group: {id:string;meshes:unknown[]}) => [group.id, group.meshes.length]));
  assert.equal(counts.landmarks, 38);
  assert.equal(counts.terrain, 5);
  assert.ok(counts.roads >= 700);
  assert.ok(counts.buildings >= 800);
  assert.ok(counts.facades >= 400);
  assert.equal(layout.unit, 'game-meters-y-up');

  const verify = JSON.parse(readFileSync(file('ue5/Shenchengji/Content/City/runtime-verify.json'), 'utf8'));
  assert.equal(verify.loadedMeshes, verify.layoutMeshes);
  assert.equal(verify.missingSample.length, 0);
  const bamboo = verify.samples.find((sample: {path:string}) => sample.path.includes('landmark_bamboo_lampwarm'));
  assert.ok(bamboo);
  assert.equal(Math.round(bamboo.bounds.origin[0]), Math.round(bamboo.layout.t[0] * 100));
  assert.equal(Math.round(bamboo.bounds.origin[1]), Math.round(bamboo.layout.t[2] * 100));
});
