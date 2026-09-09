import type {CityData, Road, V2} from './city-types.ts';
import {closest} from './driving.ts';

const generic = /^(?:支路|未命名(?:道路)?|道路|无名路|unnamed|road)?$/i;
export const isUnnamedRoad = (road: Road) => generic.test(road.name.trim());
/** Context labels are game directions, never replacements for the OSM name. */
export const roadDisplayName = (road: Road) => road.displayName || (isUnnamedRoad(road) ? '深圳街区 · 支路' : road.name);
export const roadVicinityName = (road: Road) => isUnnamedRoad(road) ? roadDisplayName(road) : `${road.name}附近`;
type Place = {name: string; x: number; z: number; category: string; kind?: string};
type Segment = {a: V2; b: V2; road: Road};

export function assignRoadDisplayNames(data: CityData, places: readonly Place[] = []) {
  const size = 160, cells = new Map<string, Segment[]>();
  for (const road of data.roads) {
    if (isUnnamedRoad(road)) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], segment = {a, b, road};
      for (let x = Math.floor(Math.min(a[0], b[0]) / size); x <= Math.floor(Math.max(a[0], b[0]) / size); x++)
        for (let z = Math.floor(Math.min(a[1], b[1]) / size); z <= Math.floor(Math.max(a[1], b[1]) / size); z++) {
          const key = `${x},${z}`, list = cells.get(key) ?? []; list.push(segment); cells.set(key, list);
        }
    }
  }
  function near(point: V2, road: Road, limit: number) {
    let best: {road: Road; distance: number} | undefined;
    const cx = Math.floor(point[0] / size), cz = Math.floor(point[1] / size);
    for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++)
      for (const s of cells.get(`${x},${z}`) ?? []) {
        if (s.road.grade !== road.grade) continue;
        const d = closest(point[0], point[1], s.a, s.b).d;
        if (d <= limit && (!best || d < best.distance || (d === best.distance && s.road.id < best.road.id))) best = {road: s.road, distance: d};
      }
    return best?.road;
  }
  const contexts = places.filter(p => p.category === 'district' && p.kind !== 'city' && Number.isFinite(p.x + p.z));
  let contextual = 0;
  for (const road of data.roads) {
    if (!isUnnamedRoad(road)) { road.displayName = road.name; continue; }
    contextual++;
    const mid = road.points[Math.floor(road.points.length / 2)] ?? [0, 0];
    const kind = road.kind.endsWith('_link') ? '连接匝道' : road.kind === 'service' ? '内部道路' : road.kind === 'residential' ? '街巷' : '支路';
    if (road.kind.endsWith('_link') && road.points.length) {
      const links = [near(road.points[0], road, 2), near(road.points.at(-1)!, road, 2)];
      const names = [...new Set(links.filter((r): r is Road => !!r).map(r => r.name))];
      if (names.length) { road.displayName = `${names.join('—')} · ${kind}`; continue; }
    }
    const adjacent = near(mid, road, 150);
    if (adjacent) { road.displayName = `${adjacent.name}附近 · ${kind}`; continue; }
    let context: Place | undefined, distance = Infinity;
    for (const p of contexts) {
      const d = Math.hypot(p.x - mid[0], p.z - mid[1]);
      if (d < distance && d < (p.kind === 'suburb' ? 900 : 400)) { context = p; distance = d; }
    }
    if (context) { road.displayName = `${context.name}附近 · ${kind}`; continue; }
    const [xmin, zmin, xmax, zmax] = data.meta.extent;
    const east = mid[0] > (xmin + xmax) / 2, north = mid[1] > (zmin + zmax) / 2;
    road.displayName = `城市${east ? '东' : '西'}${north ? '北' : '南'}侧 · ${kind}`;
  }
  return {total: data.roads.length, contextual};
}

export async function loadRoadDisplayNames(data: CityData) {
  let places: Place[] = [];
  try {
    const response = await fetch(new URL('../data/map-places.json', import.meta.url));
    if (response.ok) places = (await response.json()).places ?? [];
  } catch { /* Names still resolve from nearby source roads if the optional catalog is unavailable. */ }
  return assignRoadDisplayNames(data, places);
}
