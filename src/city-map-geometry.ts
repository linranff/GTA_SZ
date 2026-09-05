import type {Road, V2} from './city-types.ts';

export type MapView = {x: number; z: number; scale: number; width: number; height: number};
export type MapCategory = 'landmark' | 'district' | 'park' | 'place' | 'transport' | 'road';
export type MapPlaceSource = {
  provider: string;
  id?: string;
  url?: string;
  file?: string;
  coordinateMethod?: string;
};
export type SourcedMapPlace = {
  id: string; name: string; nameEn?: string; category: MapCategory; kind?: string;
  x: number; z: number; lon: number; lat: number; address?: string; source: MapPlaceSource;
};

export function wgs84ToMap(lon: number, lat: number): V2 {
  return [(lon - 114.025) * 102850 * .6, (lat - 22.536) * 111320 * .6];
}

export function mapToScreen(view: MapView, point: V2): V2 {
  return [(point[0] - view.x) * view.scale + view.width / 2, view.height / 2 - (point[1] - view.z) * view.scale];
}

export function screenToMap(view: MapView, point: V2): V2 {
  return [(point[0] - view.width / 2) / view.scale + view.x, (view.height / 2 - point[1]) / view.scale + view.z];
}

/** Zooming keeps the point underneath the pointer fixed. */
export function zoomMapAt(view: MapView, point: V2, scale: number): MapView {
  const world = screenToMap(view, point);
  return {...view, scale, x: world[0] - (point[0] - view.width / 2) / scale, z: world[1] - (view.height / 2 - point[1]) / scale};
}

export type MapLabelCandidate = {
  id: string; x: number; y: number; width: number; height: number; priority: number;
  /** Alternative screen offsets, in preference order. */
  offsets?: readonly V2[];
};
export type PlacedMapLabel = MapLabelCandidate & {left: number; top: number};

/** Deterministic screen-space placement shared by every label layer. */
export function placeMapLabels(candidates: readonly MapLabelCandidate[], width: number, height: number, padding = 5): PlacedMapLabel[] {
  const accepted: PlacedMapLabel[] = [], cells = new Map<string, PlacedMapLabel[]>(), ids = new Set<string>();
  const cellSize = 64;
  const keys = (left: number, top: number, w: number, h: number): string[] => {
    const result: string[] = [];
    for (let x = Math.floor((left - padding) / cellSize); x <= Math.floor((left + w + padding) / cellSize); x++)
      for (let y = Math.floor((top - padding) / cellSize); y <= Math.floor((top + h + padding) / cellSize); y++) result.push(`${x},${y}`);
    return result;
  };
  for (const candidate of [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    if (ids.has(candidate.id) || !Number.isFinite(candidate.x + candidate.y + candidate.width + candidate.height)) continue;
    for (const [dx, dy] of candidate.offsets ?? [[0, 0]]) {
      const left = candidate.x + dx - candidate.width / 2, top = candidate.y + dy - candidate.height / 2;
      if (left < 8 || top < 8 || left + candidate.width > width - 8 || top + candidate.height > height - 8) continue;
      const occupied = keys(left, top, candidate.width, candidate.height);
      if (occupied.some(key => (cells.get(key) ?? []).some(b =>
        left < b.left + b.width + padding && left + candidate.width + padding > b.left &&
        top < b.top + b.height + padding && top + candidate.height + padding > b.top))) continue;
      const placed = {...candidate, x: candidate.x + dx, y: candidate.y + dy, left, top};
      accepted.push(placed); ids.add(candidate.id);
      for (const key of occupied) { const cell = cells.get(key); if (cell) cell.push(placed); else cells.set(key, [placed]); }
      break;
    }
  }
  return accepted;
}

type RoadSegment = {a: V2; b: V2; road: Road};
export type MapRoadPoint = {x: number; z: number; distance: number; yaw: number; road: Road};

/** Read-only spatial index. Source geometry remains authoritative. */
export class MapRoadIndex {
  private cells = new Map<string, RoadSegment[]>();
  private segments: RoadSegment[] = [];
  private cellSize = 512;

  constructor(roads: readonly Road[]) {
    for (const road of roads) for (let i = 1; i < road.points.length; i++) {
      const segment = {a: road.points[i - 1], b: road.points[i], road};
      this.segments.push(segment);
      const [a, b] = [segment.a, segment.b];
      for (let x = Math.floor(Math.min(a[0], b[0]) / this.cellSize); x <= Math.floor(Math.max(a[0], b[0]) / this.cellSize); x++)
        for (let z = Math.floor(Math.min(a[1], b[1]) / this.cellSize); z <= Math.floor(Math.max(a[1], b[1]) / this.cellSize); z++) {
          const key = `${x},${z}`, cell = this.cells.get(key);
          if (cell) cell.push(segment); else this.cells.set(key, [segment]);
        }
    }
  }

  nearest(point: V2, name?: string): MapRoadPoint | null {
    const [x, z] = point, cx = Math.floor(x / this.cellSize), cz = Math.floor(z / this.cellSize);
    let best: MapRoadPoint | null = null;
    const seen = new Set<RoadSegment>();
    const inspect = (segment: RoadSegment): void => {
      if (seen.has(segment) || (name && segment.road.name !== name)) return;
      seen.add(segment);
      const {a, b, road} = segment, dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const px = a[0] + dx * t, pz = a[1] + dz * t, distance = Math.hypot(x - px, z - pz);
      if (!best || distance < best.distance) best = {x: px, z: pz, distance, yaw: Math.atan2(dx, dz), road};
    };
    for (let radius = 0; radius < 8; radius++) {
      for (let a = cx - radius; a <= cx + radius; a++) for (let b = cz - radius; b <= cz + radius; b++) {
        if (radius && a > cx - radius && a < cx + radius && b > cz - radius && b < cz + radius) continue;
        for (const segment of this.cells.get(`${a},${b}`) ?? []) inspect(segment);
      }
      const boundary = Math.min(x - (cx - radius) * this.cellSize, (cx + radius + 1) * this.cellSize - x,
        z - (cz - radius) * this.cellSize, (cz + radius + 1) * this.cellSize - z);
      const found = best as MapRoadPoint | null;
      if (found && found.distance <= boundary) return found;
    }
    for (const segment of this.segments) inspect(segment);
    return best;
  }
}

export function roadLabelAnchor(road: Road): {point: V2; angle: number; length: number} | null {
  let length = 0;
  for (let i = 1; i < road.points.length; i++) length += Math.hypot(road.points[i][0] - road.points[i - 1][0], road.points[i][1] - road.points[i - 1][1]);
  if (!length) return null;
  let travelled = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (travelled + distance >= length / 2) {
      const t = (length / 2 - travelled) / distance;
      let angle = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      if (angle > Math.PI / 2) angle -= Math.PI; else if (angle < -Math.PI / 2) angle += Math.PI;
      return {point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], angle, length};
    }
    travelled += distance;
  }
  return null;
}
