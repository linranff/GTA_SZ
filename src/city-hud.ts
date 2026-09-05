import './city-hud.css';
import type {CityData, V2} from './city-types.ts';

export type CinematicHudState = {
  /** Signed vehicle speed in metres per second, matching CarState.speed. */
  speed: number;
  /** Odometer in game metres, matching CarState.distance. */
  distance: number;
  roadName: string;
  district?: string;
  night?: boolean;
  observer?: boolean;
  menuOpen?: boolean;
  navigation?: boolean;
};

export type CinematicMinimapState = {
  x: number;
  z: number;
  yaw: number;
  route: readonly V2[];
};

type HudElements = {
  root: HTMLElement;
  speed: HTMLElement;
  gear: HTMLElement;
  odometer: HTMLElement;
  roadName: HTMLElement;
  roadEnglish: HTMLElement;
  subtitle: HTMLElement;
  district: HTMLElement | null;
  clock: HTMLElement | null;
  meter: HTMLElement;
  arc: SVGPathElement;
  needle: SVGLineElement;
  compass: HTMLElement | null;
  previousSpeed: number;
};

let hud: HudElements | null = null;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_DIAL_SPEED = 200;
const DIAL_START = -128;
const DIAL_SWEEP = 256;
const ROAD_ENGLISH: Record<string, string> = {
  '滨海大道': 'Binhai Blvd',
  '深南大道': 'Shennan Blvd',
  '深南中路': 'Shennan Middle Rd',
  '深南东路': 'Shennan East Rd',
  '后海大道': 'Houhai Blvd',
  '后海滨路': 'Houhaibin Rd',
  '沙河西路': 'Shahe West Rd',
  '南海大道': 'Nanhai Blvd',
  '科苑南路': 'Keyuan South Rd',
  '科苑路': 'Keyuan Rd',
  '海德三道': 'Haide 3rd Rd',
  '福华三路': 'Fuhua 3rd Rd',
  '益田路': 'Yitian Rd',
};

function writeText(element: HTMLElement | null, value: string): void {
  if (element && element.textContent !== value) element.textContent = value;
}

function setFlag(root: HTMLElement, key: string, value: boolean): void {
  const text = value ? 'true' : 'false';
  if (root.dataset[key] !== text) root.dataset[key] = text;
}

function dialPoint(angle: number, radius: number): [number, number] {
  const a = angle * Math.PI / 180;
  return [140 + Math.sin(a) * radius, 136 - Math.cos(a) * radius];
}

function dialArc(start: number, end: number, radius: number): string {
  const a = dialPoint(start, radius), b = dialPoint(end, radius);
  return `M ${a[0].toFixed(3)} ${a[1].toFixed(3)} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${b[0].toFixed(3)} ${b[1].toFixed(3)}`;
}

function createDial(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 280 270');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('cinematic-dial');
  const outline = dialArc(DIAL_START, DIAL_START + DIAL_SWEEP, 120);
  const ticks: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const angle = DIAL_START + i / 40 * DIAL_SWEEP;
    const major = i % 8 === 0;
    const a = dialPoint(angle, 112), b = dialPoint(angle, major ? 102 : 108);
    ticks.push(`<line class="${major ? 'dial-tick-major' : 'dial-tick'}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`);
    if (major) {
      const p = dialPoint(angle, 94);
      ticks.push(`<text class="dial-label" x="${p[0]}" y="${p[1] + 2}">${i * 5}</text>`);
    }
  }
  svg.innerHTML = `
    <path class="dial-inner-ring" d="${dialArc(DIAL_START, DIAL_START + DIAL_SWEEP, 111)}"/>
    <path class="dial-track" d="${outline}"/>
    <path class="dial-progress" d="${outline}" pathLength="100" stroke-dasharray="0 100"/>
    <path class="dial-limit" d="${dialArc(118, 128, 120)}"/>
    ${ticks.join('')}
    <line class="dial-needle" x1="140" y1="11" x2="140" y2="22" transform="rotate(-128 140 136)"/>
    <circle class="dial-power-ring" cx="140" cy="231" r="16"/>
    <path class="dial-power" d="M 143.5 219 L 133 233 L 139 233 L 136.5 243 L 148 228 L 142 228 Z"/>
  `;
  return svg;
}

/** Enhance the existing UI once, after initUI has created its DOM. */
export function initializeCinematicHud(city?: CityData): void {
  const root = document.querySelector<HTMLElement>('#ui');
  if (!root || (hud?.root === root && hud.speed.isConnected)) return;
  const meter = root.querySelector<HTMLElement>('#speedometer');
  const minimap = root.querySelector<HTMLElement>('#minimap');
  const speed = root.querySelector<HTMLElement>('#speed');
  const gear = root.querySelector<HTMLElement>('#gear');
  const odometer = root.querySelector<HTMLElement>('#odometer');
  const roadName = root.querySelector<HTMLElement>('#road-name');
  const subtitle = root.querySelector<HTMLElement>('.wordmark span');
  if (!meter || !minimap || !speed || !gear || !odometer || !roadName || !subtitle) return;

  root.classList.add('cinematic-hud');
  meter.setAttribute('role', 'group');
  meter.setAttribute('aria-label', '车速 0 公里每小时');
  minimap.setAttribute('role', 'img');
  minimap.setAttribute('aria-label', '附近道路与导航路线，行进方向朝上');
  speed.parentElement?.classList.add('cinematic-speed-readout');
  meter.querySelector('small')?.classList.add('cinematic-speed-meta');
  const dial = createDial();
  meter.prepend(dial);

  const roadLabel = document.createElement('div');
  roadLabel.className = 'cinematic-road-label';
  const roadEnglish = document.createElement('span');
  roadEnglish.className = 'cinematic-road-english';
  roadLabel.append(roadName, roadEnglish);
  minimap.append(roadLabel);

  // The existing help remains available when pausing, leaving the road clear.
  const controls = root.querySelector<HTMLElement>('.controls');
  const pause = root.querySelector<HTMLElement>('#pause');
  if (controls && pause) pause.append(controls);
  root.querySelector('#map-button')?.setAttribute('aria-label', '城市地图，快捷键 M');
  root.querySelector('#journal-button')?.setAttribute('aria-label', '城市生活，快捷键 J');
  writeText(subtitle, '深圳湾 · 自由驾驶');

  hud = {
    root, speed, gear, odometer, roadName, roadEnglish, subtitle, meter,
    district: root.querySelector('#district'),
    clock: root.querySelector('#clock'),
    arc: dial.querySelector<SVGPathElement>('.dial-progress')!,
    needle: dial.querySelector<SVGLineElement>('.dial-needle')!,
    compass: minimap.querySelector('.north'),
    previousSpeed: -1,
  };
  if (city) getMapCache(city);
}

/** Explicit state updates; no observer, timer, or extra render loop. */
export function updateCinematicHud(state: CinematicHudState): void {
  if (!hud?.speed.isConnected) return;
  const signedSpeed = Number.isFinite(state.speed) ? state.speed : 0;
  const speed = Math.min(999, Math.round(Math.abs(signedSpeed) * 3.6));
  writeText(hud.speed, String(speed).padStart(3, '0'));
  writeText(hud.gear, signedSpeed < -.3 ? 'R' : speed ? 'D' : 'P');
  writeText(hud.odometer, `${(Math.max(0, state.distance) / 1000).toFixed(1)} KM`);
  writeText(hud.roadName, state.roadName);
  const english = ROAD_ENGLISH[state.roadName] ?? '';
  writeText(hud.roadEnglish, english);
  if (hud.roadEnglish.hidden !== !english) hud.roadEnglish.hidden = !english;
  const district = state.district || '深圳湾';
  const areaLabel = district.split(/\s*·\s*/).filter(Boolean).at(-1) || district;
  const mode = state.observer ? '无人机观景' : state.navigation ? '沿途导航' : '自由驾驶';
  writeText(hud.subtitle, `${areaLabel} · ${mode}`);
  writeText(hud.district, district);
  writeText(hud.clock, state.night ? '20:10' : '18:25');
  setFlag(hud.root, 'observer', !!state.observer);
  setFlag(hud.root, 'menuOpen', !!state.menuOpen);
  setFlag(hud.root, 'navigation', !!state.navigation);
  if (hud.previousSpeed !== speed) {
    const progress = Math.min(1, speed / MAX_DIAL_SPEED);
    hud.arc.style.strokeDasharray = `${(progress * 100).toFixed(2)} 100`;
    hud.needle.setAttribute('transform', `rotate(${(DIAL_START + progress * DIAL_SWEEP).toFixed(2)} 140 136)`);
    hud.meter.setAttribute('aria-label', `车速 ${speed} 公里每小时`);
    hud.previousSpeed = speed;
  }
}

const TILE_WORLD = 512;
const TILE_PIXELS = 256;
const TILE_SCALE = TILE_PIXELS / TILE_WORLD;
const MAP_SIZE = 320;
const MAP_BACKING_SIZE = 512;
const MAP_SCALE = .38;
const MAX_CACHED_TILES = 64;
type Bounds = [number, number, number, number];
type Segment = {a: V2; b: V2; width: number; major: boolean};
type MapPolygon = {rings: V2[][]; bounds: Bounds};
type MapCache = {
  segments: Map<string, Segment[]>;
  green: MapPolygon[];
  water: MapPolygon[];
  tiles: Map<string, HTMLCanvasElement>;
};
const mapCaches = new WeakMap<CityData, MapCache>();

function tileKey(x: number, z: number): string { return `${x},${z}`; }

function polygonBounds(rings: V2[][]): Bounds {
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) for (const [x, z] of ring) {
    bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], z);
    bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], z);
  }
  return bounds;
}

function getMapCache(city: CityData): MapCache {
  const existing = mapCaches.get(city);
  if (existing) return existing;
  const cache: MapCache = {
    segments: new Map(), tiles: new Map(),
    green: city.green.map(p => ({rings: p.rings, bounds: polygonBounds(p.rings)})),
    water: city.water.map(p => ({rings: p.rings, bounds: polygonBounds(p.rings)})),
  };
  for (const road of city.roads) for (let i = 1; i < road.points.length; i++) {
    const segment: Segment = {
      a: road.points[i - 1], b: road.points[i], width: Math.max(2, road.width),
      major: ['trunk', 'primary', 'secondary'].includes(road.kind),
    };
    const padding = segment.width / 2 + 3;
    const xmin = Math.floor((Math.min(segment.a[0], segment.b[0]) - padding) / TILE_WORLD);
    const xmax = Math.floor((Math.max(segment.a[0], segment.b[0]) + padding) / TILE_WORLD);
    const zmin = Math.floor((Math.min(segment.a[1], segment.b[1]) - padding) / TILE_WORLD);
    const zmax = Math.floor((Math.max(segment.a[1], segment.b[1]) + padding) / TILE_WORLD);
    for (let x = xmin; x <= xmax; x++) for (let z = zmin; z <= zmax; z++) {
      const key = tileKey(x, z), cell = cache.segments.get(key);
      if (cell) cell.push(segment); else cache.segments.set(key, [segment]);
    }
  }
  mapCaches.set(city, cache);
  return cache;
}

function getMapTile(cache: MapCache, tx: number, tz: number): HTMLCanvasElement {
  const key = tileKey(tx, tz), existing = cache.tiles.get(key);
  if (existing) {
    cache.tiles.delete(key);
    cache.tiles.set(key, existing);
    return existing;
  }
  const tile = document.createElement('canvas');
  tile.width = tile.height = TILE_PIXELS;
  const ctx = tile.getContext('2d')!;
  const xmin = tx * TILE_WORLD, zmin = tz * TILE_WORLD;
  const xmax = xmin + TILE_WORLD, zmax = zmin + TILE_WORLD;
  const point = ([x, z]: V2): V2 => [(x - xmin) * TILE_SCALE, (zmax - z) * TILE_SCALE];
  const polygons = (items: MapPolygon[], fill: string): void => {
    ctx.fillStyle = fill;
    for (const {rings, bounds: b} of items) {
      if (b[2] < xmin || b[0] > xmax || b[3] < zmin || b[1] > zmax) continue;
      ctx.beginPath();
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const p = point(ring[i]);
          if (i) ctx.lineTo(...p); else ctx.moveTo(...p);
        }
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
  };
  polygons(cache.water, 'rgba(152, 189, 202, 0.12)');
  polygons(cache.green, 'rgba(150, 164, 113, 0.18)');
  const segments = cache.segments.get(key) ?? [];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Draw minor streets first, keeping major roads continuous through junctions.
  for (const major of [false, true]) {
    for (const segment of segments) {
      if (segment.major !== major) continue;
      ctx.beginPath();
      ctx.moveTo(...point(segment.a)); ctx.lineTo(...point(segment.b));
      ctx.strokeStyle = major ? 'rgba(15, 20, 22, 0.66)' : 'rgba(15, 20, 22, 0.35)';
      ctx.lineWidth = Math.max(major ? 3.2 : 1.7, segment.width * TILE_SCALE * .7) + 1.8;
      ctx.stroke();
      ctx.strokeStyle = major ? 'rgba(223, 225, 218, 0.83)' : 'rgba(175, 182, 180, 0.57)';
      ctx.lineWidth -= 1.8;
      ctx.stroke();
    }
  }
  if (cache.tiles.size >= MAX_CACHED_TILES) cache.tiles.delete(cache.tiles.keys().next().value!);
  cache.tiles.set(key, tile);
  return tile;
}

/** Cached 2D road tiles; call at the existing low-frequency map update cadence. */
export function drawCinematicMinimap(canvas: HTMLCanvasElement, city: CityData, state: CinematicMinimapState): void {
  if (canvas.width !== MAP_BACKING_SIZE || canvas.height !== MAP_BACKING_SIZE) {
    canvas.width = canvas.height = MAP_BACKING_SIZE;
  }
  const ctx = canvas.getContext('2d')!;
  const backingScale = MAP_BACKING_SIZE / MAP_SIZE;
  ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
  ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.save();
  ctx.beginPath(); ctx.arc(160, 160, 159, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(12, 17, 21, 0.4)';
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.translate(160, 208);
  ctx.rotate(-state.yaw);
  const cache = getMapCache(city);
  const reach = 212 / MAP_SCALE;
  const xmin = Math.floor((state.x - reach) / TILE_WORLD), xmax = Math.floor((state.x + reach) / TILE_WORLD);
  const zmin = Math.floor((state.z - reach) / TILE_WORLD), zmax = Math.floor((state.z + reach) / TILE_WORLD);
  for (let x = xmin; x <= xmax; x++) for (let z = zmin; z <= zmax; z++) {
    const px = (x * TILE_WORLD - state.x) * MAP_SCALE;
    const py = -((z + 1) * TILE_WORLD - state.z) * MAP_SCALE;
    ctx.drawImage(getMapTile(cache, x, z), px, py, TILE_WORLD * MAP_SCALE, TILE_WORLD * MAP_SCALE);
  }
  if (state.route.length) {
    ctx.beginPath();
    for (let i = 0; i < state.route.length; i++) {
      const p = state.route[i], x = (p[0] - state.x) * MAP_SCALE, y = -(p[1] - state.z) * MAP_SCALE;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(22, 32, 23, 0.8)'; ctx.lineWidth = 6.6; ctx.stroke();
    ctx.strokeStyle = '#b2c584'; ctx.lineWidth = 4.2; ctx.stroke();
  }
  ctx.restore();
  // The map rotates under the vehicle; this marker always faces forward.
  ctx.save();
  ctx.translate(160, 208);
  ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 6); ctx.lineTo(-9, 10); ctx.closePath();
  ctx.fillStyle = '#7ee0c9'; ctx.strokeStyle = 'rgba(14, 31, 32, .95)'; ctx.lineWidth = 2.5;
  ctx.stroke(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 4); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fillStyle = '#c2f5e5'; ctx.fill();
  ctx.restore();
  const compass = hud?.compass;
  if (compass) {
    const x = `${(50 - Math.sin(state.yaw) * 45).toFixed(2)}%`;
    const y = `${(50 - Math.cos(state.yaw) * 45).toFixed(2)}%`;
    if (compass.style.left !== x) compass.style.left = x;
    if (compass.style.top !== y) compass.style.top = y;
  }
}
