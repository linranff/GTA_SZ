import type {CityData, Road, V2} from './city-types.ts';
import {closest, inRing, type CityCollision} from './driving.ts';

export type ObserverDestination = {
  x: number; y: number; z: number; name: string;
  /** The observation point stays exact; only a safe, nearby road can receive the car. */
  arrival?: V2; yaw?: number;
};
type ResolverOptions = {
  data: CityData;
  collision: CityCollision;
  groundHeight: (x: number, z: number) => number;
  propBlocked: (x: number, z: number) => boolean;
  waterHeight: number;
};
type RoadSegment = {a: V2; b: V2; road: Road};
const ROAD_RADIUS = 300;
const DRIVABLE_KINDS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street']);
const BODY_SAMPLES: readonly V2[] = [[0, 0], [2.5, 0], [-2.5, 0], [0, 1.1], [0, -1.1], [2.5, 1.1], [2.5, -1.1], [-2.5, 1.1], [-2.5, -1.1]];

function polygonContains(rings: V2[][]) {
  const exterior = rings[0] ?? [], holes = rings.slice(1);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of exterior) {
    minX = Math.min(minX, x); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z);
  }
  return (x: number, z: number) => x >= minX && x <= maxX && z >= minZ && z <= maxZ &&
    inRing(x, z, exterior) && !holes.some(ring => inRing(x, z, ring));
}

/** Resolve an aerial pick without creating a global nearest-road snap across the bay. */
export function createObserverDestinationResolver({data, collision, groundHeight, propBlocked, waterHeight}: ResolverOptions) {
  const extent = data.meta.extent;
  const landContains = data.land.map(polygonContains), waterContains = data.water.map(water => polygonContains(water.rings));
  const withinExtent = (x: number, z: number) => Number.isFinite(x) && Number.isFinite(z) &&
    x >= extent[0] && x <= extent[2] && z >= extent[1] && z <= extent[3];
  const isWater = (x: number, z: number) => !landContains.some(contains => contains(x, z)) || waterContains.some(contains => contains(x, z));

  function nearbyRoads(x: number, z: number) {
    const seen = new Set<RoadSegment>(), result: {segment: RoadSegment; distance: number; t: number; length: number}[] = [];
    const size = collision.size;
    for (let cx = Math.floor((x - ROAD_RADIUS) / size); cx <= Math.floor((x + ROAD_RADIUS) / size); cx++)
      for (let cz = Math.floor((z - ROAD_RADIUS) / size); cz <= Math.floor((z + ROAD_RADIUS) / size); cz++)
        for (const segment of collision.cells.get(`${cx},${cz}`) ?? []) {
          if (seen.has(segment)) continue;
          seen.add(segment);
          const {road, a, b} = segment, grade = Number(road.grade);
          if (!DRIVABLE_KINDS.has(road.kind.replace(/_link$/, '')) || !Number.isFinite(grade) || grade < 0 || !Number.isFinite(road.width) || road.width < 3) continue;
          if (![...a, ...b].every(Number.isFinite)) continue;
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (length < .1) continue;
          const projection = closest(x, z, a, b);
          if (projection.d <= ROAD_RADIUS) result.push({segment, distance: projection.d, t: projection.t, length});
        }
    return result.sort((a, b) => a.distance - b.distance);
  }

  function safeArrival(x: number, z: number, yaw: number, segment: RoadSegment) {
    const centerHeight = groundHeight(x, z);
    if (!Number.isFinite(centerHeight)) return false;
    const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
    for (const [forward, right] of BODY_SAMPLES) {
      const px = x + forwardX * forward + forwardZ * right, pz = z + forwardZ * forward - forwardX * right;
      if (!withinExtent(px, pz) || closest(px, pz, segment.a, segment.b).d > segment.road.width / 2 - .35) return false;
      const height = groundHeight(px, pz);
      if (!Number.isFinite(height) || height <= waterHeight + .06 || Math.abs(height - centerHeight) > .75) return false;
      // CityCollision exempts road footprints from water collisions. Require real bridge support too.
      if (isWater(px, pz) && height < waterHeight + 1) return false;
      if (collision.blocked(px, pz) || propBlocked(px, pz)) return false;
    }
    return true;
  }

  return (point: {x: number; y: number; z: number}, name?: string): ObserverDestination | null => {
    if (!point || !withinExtent(point.x, point.z) || !Number.isFinite(point.y)) return null;
    const roads = nearbyRoads(point.x, point.z);
    let nearbyLandmark: CityData['landmarks'][number] | undefined, landmarkDistance = 250;
    for (const landmark of data.landmarks) {
      const distance = Math.hypot(point.x - landmark.x, point.z - landmark.z);
      if (distance <= landmarkDistance) { nearbyLandmark = landmark; landmarkDistance = distance; }
    }
    const destination: ObserverDestination = {x: point.x, y: point.y, z: point.z,
      name: name ?? nearbyLandmark?.name ?? (roads[0]?.segment.road.name ? `${roads[0].segment.road.name}附近` : '城市风景')};
    // A click on the water itself must never move the player onto a nearby shore or an invisible road.
    if (point.y <= waterHeight + .06) return destination;
    for (const {segment, t, length} of roads) {
      const {a, b} = segment, yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const checked = new Set<number>();
      for (const offset of [0, 8, -8, 16, -16]) {
        const at = Math.max(0, Math.min(1, t + offset / length));
        if (checked.has(at)) continue;
        checked.add(at);
        const x = a[0] + (b[0] - a[0]) * at, z = a[1] + (b[1] - a[1]) * at;
        if (Math.hypot(x - point.x, z - point.z) > ROAD_RADIUS || !safeArrival(x, z, yaw, segment)) continue;
        return {...destination, arrival: [x, z], yaw};
      }
    }
    return destination;
  };
}
