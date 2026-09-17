#!/usr/bin/env node
/** Export a UE5-readable city skeleton from the Babylon baseline. Does not modify public assets. */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const city = JSON.parse(readFileSync(join(root, 'public/city/city.json'), 'utf8'));
const sites = JSON.parse(readFileSync(join(root, 'public/city/life-sites.json'), 'utf8')).sites;
const story = JSON.parse(readFileSync(join(root, 'ue5/Shenchengji/Content/City/bay-last-delivery.json'), 'utf8'));

function hypot(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function nearestRoad(x, z) {
  let best = {x, z, distance: Infinity, roadId: '', roadName: ''};
  for (const road of city.roads) {
    for (const point of road.points) {
      const distance = hypot(x, z, point[0], point[1]);
      if (distance < best.distance) {
        best = {x: point[0], z: point[1], distance, roadId: road.id, roadName: road.name};
      }
    }
  }
  return best;
}

function downsample(points, spacing = 14) {
  if (points.length < 2) return points.map(([x, z]) => ({x, z}));
  const out = [{x: points[0][0], z: points[0][1]}];
  let travel = 0;
  for (let i = 1; i < points.length; i++) {
    travel += hypot(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    if (travel >= spacing || i === points.length - 1) {
      out.push({x: points[i][0], z: points[i][1]});
      travel = 0;
    }
  }
  return out;
}

function ringBounds(rings) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const ring of rings) {
    for (const [x, z] of ring) {
      if (x < minX) minX = x;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
    }
  }
  return {x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: Math.max(2, maxX - minX), d: Math.max(2, maxZ - minZ)};
}

const hub = sites.find((site) => site.id === 'hub');
const office = sites.find((site) => site.id === 'office');
const workshop = sites.find((site) => site.id === 'workshop');
if (!hub || !office || !workshop) throw new Error('life-sites 缺少 hub / office / workshop');

const spawn = city.spawn;
const bayGuessX = spawn.x + Math.sin(spawn.yaw) * 950;
const bayGuessZ = spawn.z + Math.cos(spawn.yaw) * 950;
const baySnap = nearestRoad(bayGuessX, bayGuessZ);

const places = {
  hub: {id: 'hub', name: hub.name, x: hub.arrival[0], z: hub.arrival[1], yaw: hub.yaw, heading: hub.heading, buildingX: hub.x, buildingZ: hub.z, source: 'life-sites.hub.arrival'},
  office: {id: 'office', name: office.name, x: office.arrival[0], z: office.arrival[1], yaw: office.yaw, heading: office.heading, buildingX: office.x, buildingZ: office.z, source: 'life-sites.office.arrival'},
  park: {id: 'park', name: workshop.name, x: workshop.arrival[0], z: workshop.arrival[1], yaw: workshop.yaw, heading: workshop.heading, buildingX: workshop.x, buildingZ: workshop.z, source: 'life-sites.workshop.arrival'},
  workshop: {id: 'workshop', name: workshop.name, x: workshop.arrival[0], z: workshop.arrival[1], yaw: workshop.yaw, heading: workshop.heading, buildingX: workshop.x, buildingZ: workshop.z, source: 'life-sites.workshop.arrival'},
  bay: {id: 'bay', name: '滨海路边交接点', x: baySnap.x, z: baySnap.z, yaw: spawn.yaw, heading: spawn.yaw, buildingX: baySnap.x, buildingZ: baySnap.z, source: 'spawn+950 snapped to nearest road', roadId: baySnap.roadId, roadName: baySnap.roadName, snapDistance: Number(baySnap.distance.toFixed(3))},
};

const anchors = Object.values(places);
const keepRoad = (road) => {
  if (['trunk', 'primary'].includes(road.kind)) return true;
  return road.points.some(([x, z]) => anchors.some((place) => hypot(x, z, place.x, place.z) < 420));
};

const roads = city.roads.filter(keepRoad).map((road) => ({
  id: road.id,
  name: road.name,
  kind: road.kind,
  width: road.width,
  points: downsample(road.points),
}));

const keepBuilding = (building) => {
  const bounds = ringBounds(building.rings);
  return anchors.some((place) => {
    const radius = place.id === 'hub' ? 700 : 280;
    return hypot(bounds.x, bounds.z, place.x, place.z) <= radius;
  });
};

const buildings = city.buildings.filter(keepBuilding).map((building) => {
  const bounds = ringBounds(building.rings);
  return {x: bounds.x, z: bounds.z, w: bounds.w, d: bounds.d, height: building.height, style: building.style};
});

const landmarks = city.landmarks.map((landmark) => ({
  id: landmark.id,
  name: landmark.name,
  x: landmark.x,
  z: landmark.z,
  height: landmark.height,
  arrival: {x: landmark.arrival[0], z: landmark.arrival[1]},
  yaw: landmark.yaw,
  area: landmark.area,
}));

const skeleton = {
  version: 1,
  id: 'shenchengji-city-skeleton',
  generatedFrom: 'public/city/city.json + public/city/life-sites.json',
  note: 'Game X/Z are east/north metres after 0.60 scale. UE maps X=gameX*100, Y=gameZ*100, Z=height*100. Babylon baseline is not deleted.',
  originWGS84: city.meta.originWGS84,
  horizontalScale: city.meta.horizontalScale,
  verticalScale: city.meta.verticalScale,
  unrealCentimetersPerGameMeter: 100,
  extent: city.meta.extent,
  spawn: {x: spawn.x, z: spawn.z, yaw: spawn.yaw, road: spawn.road},
  places,
  landmarks,
  roads,
  buildings,
  counts: {
    sourceRoads: city.roads.length,
    exportedRoads: roads.length,
    sourceBuildings: city.buildings.length,
    exportedBuildings: buildings.length,
    landmarks: landmarks.length,
  },
};

if (story.id !== 'bay-last-delivery' || story.reward !== 180) {
  throw new Error('故事导出失败：id 或 reward 与契约不符');
}

const outDir = join(root, 'ue5/Shenchengji/Content/City');
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'city-skeleton.json'), JSON.stringify(skeleton));
writeFileSync(join(outDir, 'bay-last-delivery.json'), JSON.stringify(story, null, 2));
writeFileSync(join(outDir, 'city-skeleton-summary.json'), JSON.stringify({
  places: Object.fromEntries(Object.entries(places).map(([id, place]) => [id, {name: place.name, x: place.x, z: place.z}])),
  counts: skeleton.counts,
  story: {id: story.id, reward: story.reward, steps: story.steps.length},
}, null, 2));

console.log(JSON.stringify({ok: true, outDir, counts: skeleton.counts, places: Object.keys(places)}, null, 2));
