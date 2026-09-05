import './city-map.css';
import type {CityData, Landmark, Road, V2} from './city-types.ts';
import type {RoadGraph} from './navigation.ts';
import {localMapView, rememberLocalMapWidth} from './city-map-view.ts';
import {MapRoadIndex, mapToScreen, screenToMap, zoomMapAt, placeMapLabels, roadLabelAnchor, wgs84ToMap,
  type MapCategory, type MapView, type MapLabelCandidate, type MapPlaceSource, type SourcedMapPlace} from './city-map-geometry.ts';

export type CityMapDestination = Landmark & {
  category?: MapCategory; nameEn?: string; kind?: string; address?: string; source?: MapPlaceSource;
};
export type CityMapState = {
  x: number; z: number; yaw: number;
  visited?: ReadonlySet<string> | readonly string[];
  selected?: CityMapDestination | null;
  route?: readonly V2[];
  /** Opening focus may follow the observer; driving routes still start at x/z. */
  mapFocus?: V2 | null;
};
export type CityMapOptions = {
  data: CityData;
  graph: RoadGraph;
  onSelect: (destination: CityMapDestination, route: V2[]) => void;
  onAutoDrive: (destination: CityMapDestination, route: V2[]) => void;
  onManualRoute: (destination: CityMapDestination, route: V2[]) => void;
  onPhoto: (destination: CityMapDestination) => void;
  onClose: () => void;
  onDebugTravel?: (destination: CityMapDestination) => void;
};
export type CityMapController = {
  open: (focus?: 'all' | 'player' | 'selection') => void;
  close: () => void;
  updateState: (state: CityMapState) => void;
  select: (destination: CityMapDestination | string) => void;
  readonly selection: CityMapDestination | null;
  readonly ready: Promise<void>;
  destroy: () => void;
};

type CatalogPlace = CityMapDestination & {category: MapCategory; rank: number};
type MapFeature = {path: Path2D; bounds: [number, number, number, number]};
type TextLabel = MapLabelCandidate & {name: string; font: string; color: string; angle: number; place?: CatalogPlace; city?: boolean};
const categoryNames: Record<MapCategory, string> = {landmark: '城市地标', district: '城市片区', park: '公园与海滨', place: '城市地点', transport: '交通站点', road: '道路'};
const roadKinds = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service'];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const normal = (s: string) => s.normalize('NFKC').toLocaleLowerCase().replace(/[\s·・—–\-]/g, '');
const routeLength = (route: readonly V2[]) => route.reduce((length, point, i) => i ? length + Math.hypot(point[0] - route[i - 1][0], point[1] - route[i - 1][1]) : 0, 0);
const writeText = (node: HTMLElement, text: string) => { if (node.textContent !== text) node.textContent = text; };

function polygonPath(rings: readonly V2[][]): Path2D {
  const path = new Path2D();
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) i ? path.lineTo(...ring[i]) : path.moveTo(...ring[i]);
    path.closePath();
  }
  return path;
}

function isPark(mark: Landmark): boolean { return mark.height === 0 && /公园|湖|海滨|绿道/.test(mark.name); }

export function initializeCityMap(options: CityMapOptions): CityMapController {
  const {data, graph} = options;
  let panel = document.querySelector<HTMLElement>('#map-panel');
  if (!panel) { panel = document.createElement('section'); panel.id = 'map-panel'; (document.querySelector('#ui') ?? document.body).append(panel); }
  panel.classList.add('city-map-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'city-map-title');
  panel.innerHTML = `
    <div class="atlas-shell">
      <header class="atlas-heading">
        <div class="atlas-brand"><small>SHENZHEN / OPEN ROADS</small><h2 id="city-map-title">城市地图</h2></div>
        <form class="atlas-search" role="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg><input id="map-search" type="search" autocomplete="off" spellcheck="false" placeholder="搜索地标、片区或道路" aria-label="搜索地图地点"><kbd>↵</kbd></form>
        <button id="close-map" class="atlas-close" type="button">返回驾驶 <kbd>M</kbd></button>
      </header>
      <div class="atlas-layout">
        <div class="atlas-map-wrap">
          <canvas id="city-map" tabindex="0" aria-label="深圳道路地图。拖拽浏览，滚轮缩放，点击选择目的地。方向键移动，加减键缩放。"></canvas>
          <div class="atlas-map-caption"><span>南山 · 福田 · 罗湖</span><small id="map-view-level">街道与周边</small></div>
          <div class="atlas-map-tools" aria-label="地图视角"><button type="button" data-map-command="in" aria-label="放大地图">＋</button><button type="button" data-map-command="out" aria-label="缩小地图">−</button><span></span><button type="button" data-map-command="player" aria-label="定位我的车辆" title="定位我的车辆">⌖</button><button type="button" data-map-command="all" aria-label="查看完整城市" title="查看完整城市">↔</button></div>
          <div class="atlas-map-north" aria-hidden="true"><span>↑</span>N</div>
          <div class="atlas-map-bottom"><div class="atlas-scale"><span id="map-scale-label"></span><i id="map-scale-line"></i></div><span id="map-status" role="status">点击地点，规划下一段路</span></div>
        </div>
        <aside class="atlas-sidebar">
          <nav class="atlas-filters" aria-label="地点分类"><button type="button" data-map-category="all" aria-pressed="true">全部</button><button type="button" data-map-category="landmark" aria-pressed="false">地标</button><button type="button" data-map-category="district" aria-pressed="false">片区</button><button type="button" data-map-category="park" aria-pressed="false">公园</button><button type="button" data-map-category="road" aria-pressed="false">道路</button><button type="button" data-map-category="place" aria-pressed="false">地点</button></nav>
          <div class="atlas-list-heading"><span id="map-results-count"></span><label><input id="map-discovered-only" type="checkbox">已发现</label></div>
          <div id="places" aria-label="地点列表"></div>
          <div id="destination-actions" class="atlas-destination">
            <div class="atlas-destination-eyebrow"><span id="map-selection-category">下一站</span><span id="map-selection-visited"></span></div>
            <strong id="destination-name">开往你想去的地方</strong>
            <p id="destination-status">从地图或列表中选择目的地。</p>
            <p id="map-destination-address" hidden></p>
            <div class="atlas-route-actions" hidden><button id="auto-drive" type="button">自动驾驶前往 <span>↗</span></button><button id="drive-route" type="button">自己开过去 <span>→</span></button></div>
            <div class="atlas-travel-actions"><button id="quick-travel" type="button" disabled>瞬移到附近道路</button><button id="photo-view" type="button" disabled>俯瞰此处</button></div>
            <div class="atlas-secondary-actions" hidden><a id="map-place-source" target="_blank" rel="noopener noreferrer" hidden>地点来源 ↗</a></div>
          </div>
        </aside>
      </div>
      <footer class="atlas-footer"><span>滚轮缩放 · 拖拽浏览 · 点击选择目的地</span><small>© OpenStreetMap contributors · ODbL · 游戏比例地图</small><span id="map-discovery-count"></span></footer>
    </div>`;

  const node = <T extends HTMLElement = HTMLElement>(selector: string): T => panel!.querySelector<T>(selector)!;
  const canvas = node<HTMLCanvasElement>('#city-map'), viewport = node('.atlas-map-wrap'), ctx = canvas.getContext('2d')!;
  const base = document.createElement('canvas'), baseCtx = base.getContext('2d')!;
  const search = node<HTMLInputElement>('#map-search'), list = node('#places'), status = node('#map-status');
  const discoveredOnly = node<HTMLInputElement>('#map-discovered-only');
  const title = node('#destination-name'), destinationStatus = node('#destination-status');
  const manual = node<HTMLButtonElement>('#drive-route'), auto = node<HTMLButtonElement>('#auto-drive');
  const sourceLink = node<HTMLAnchorElement>('#map-place-source');
  const roadIndex = new MapRoadIndex(data.roads);
  const abort = new AbortController(), signal = abort.signal;
  let state: CityMapState = {...data.spawn}, selected: CatalogPlace | null = null, route: V2[] = [];
  let visited = new Set<string>(), catalog: CatalogPlace[] = [], filtered: CatalogPlace[] = [];
  let filter: MapCategory | 'all' = 'all', listLimit = 70, visible = false, destroyed = false;
  let frame = 0, baseDirty = true, pixelRatio = 1, fitted = false, previousFocus: HTMLElement | null = null;
  let baseScale = .1, view: MapView = {x: 0, z: 0, scale: .1, width: 1, height: 1};
  let rememberedLocalWidth: number | null = null;
  let hitLabels: {left: number; top: number; width: number; height: number; place: CatalogPlace}[] = [];
  let hitMarkers: {x: number; y: number; place: CatalogPlace}[] = [];
  const roadsByKind = new Map<string, Path2D>(), roadAnchors: {road: Road; point: V2; angle: number; length: number}[] = [];
  const roadByName = new Map<string, {road: Road; point: V2; angle: number; length: number}>();
  const landPath = new Path2D(), greenPath = new Path2D(), waterPath = new Path2D();
  const buildingCache = new Map<number, MapFeature>();
  for (const p of data.land) landPath.addPath(polygonPath(p));
  for (const p of data.green) greenPath.addPath(polygonPath(p.rings));
  for (const p of data.water) waterPath.addPath(polygonPath(p.rings));
  for (const road of data.roads) {
    const kind = road.kind.replace(/_link$/, ''), path = roadsByKind.get(kind) ?? new Path2D();
    road.points.forEach((point, i) => i ? path.lineTo(...point) : path.moveTo(...point));
    roadsByKind.set(kind, path);
    const anchor = roadLabelAnchor(road);
    if (!anchor || !road.name || /^(支路|未命名|道路)$/.test(road.name)) continue;
    const value = {road, ...anchor}; roadAnchors.push(value);
    if (anchor.length > (roadByName.get(road.name)?.length ?? 0)) roadByName.set(road.name, value);
  }
  const buildingBounds = data.buildings.map(b => {
    let xmin = Infinity, zmin = Infinity, xmax = -Infinity, zmax = -Infinity;
    for (const p of b.rings[0]) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
    return [xmin, zmin, xmax, zmax] as [number, number, number, number];
  });

  function asCatalog(destination: CityMapDestination): CatalogPlace {
    const category = destination.category ?? (isPark(destination) ? 'park' : 'landmark');
    return {...destination, category, rank: category === 'landmark' ? 100 : category === 'park' ? 70 : 50};
  }
  catalog = data.landmarks.map(asCatalog);
  for (const {road, point} of roadByName.values()) {
    const snapped = roadIndex.nearest(point, road.name);
    if (!snapped) continue;
    catalog.push({id: `road:${road.name}`, name: road.name, x: point[0], z: point[1], height: 0, area: '深圳 · 道路',
      arrival: [snapped.x, snapped.z], yaw: snapped.yaw, excludeRadius: 0, category: 'road', kind: road.kind,
      rank: 10, source: {provider: 'OpenStreetMap', id: road.id, url: `https://www.openstreetmap.org/${road.id}`, file: 'public/city/city.json', coordinateMethod: 'road_polyline_midpoint'}});
  }

  function schedule(invalidate = false): void {
    if (invalidate) baseDirty = true;
    if (!visible || destroyed || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; draw(); });
  }

  function constrainView(): void {
    const [xmin, zmin, xmax, zmax] = data.meta.extent;
    view.x = clamp(view.x, xmin - view.width / view.scale * .2, xmax + view.width / view.scale * .2);
    view.z = clamp(view.z, zmin - view.height / view.scale * .2, zmax + view.height / view.scale * .2);
  }

  function resize(): void {
    if (!visible || destroyed) return;
    const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
    pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const previousScale = baseScale;
    const [xmin, zmin, xmax, zmax] = data.meta.extent;
    baseScale = Math.min((width - 88) / (xmax - xmin), (height - 115) / (zmax - zmin));
    baseScale = Math.max(.01, baseScale);
    view = {...view, width, height, scale: fitted ? view.scale * baseScale / previousScale : baseScale};
    canvas.width = base.width = Math.round(width * pixelRatio); canvas.height = base.height = Math.round(height * pixelRatio);
    if (!fitted) fitAll(); else schedule(true);
  }

  function fitAll(): void {
    const [xmin, zmin, xmax, zmax] = data.meta.extent;
    view.x = (xmin + xmax) / 2; view.z = (zmin + zmax) / 2; view.scale = baseScale;
    fitted = true; schedule(true);
  }

  function focusAt(point: V2, minimumZoom = 3): void {
    view.x = point[0]; view.z = point[1]; view.scale = Math.max(baseScale * minimumZoom, view.scale);
    constrainView(); schedule(true);
  }

  function zoom(point: V2, factor: number): void {
    view = zoomMapAt(view, point, clamp(view.scale * factor, baseScale * .8, baseScale * 18));
    rememberedLocalWidth = rememberLocalMapWidth(view, baseScale, rememberedLocalWidth);
    constrainView(); schedule(true);
  }

  function renderList(): void {
    const previousScroll = list.scrollTop;
    const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
    const focusedPlaceId = focused?.closest<HTMLElement>('[data-place-id]')?.dataset.placeId;
    const focusedMore = !!focused?.closest('[data-map-more]');
    const query = normal(search.value);
    filtered = catalog.filter(place => {
      if (filter !== 'all' && place.category !== filter && !(filter === 'place' && place.category === 'transport')) return false;
      if (filter === 'all' && !query && place.category === 'road') return false;
      if (discoveredOnly.checked && !visited.has(place.id)) return false;
      return !query || normal(`${place.name} ${place.nameEn ?? ''} ${place.address ?? ''} ${place.area}`).includes(query);
    }).sort((a, b) => {
      const ae = normal(a.name) === query ? 1000 : 0, be = normal(b.name) === query ? 1000 : 0;
      return be + b.rank - ae - a.rank || Math.hypot(a.x - state.x, a.z - state.z) - Math.hypot(b.x - state.x, b.z - state.z);
    });
    list.replaceChildren();
    writeText(node('#map-results-count'), query ? `${filtered.length} 个搜索结果` : `${filtered.length} 个地点`);
    if (!filtered.length) {
      const empty = document.createElement('div'); empty.className = 'atlas-empty';
      empty.textContent = discoveredOnly.checked ? '这里还没有已发现的地点。换个分类，继续探索城市。' : '没有找到这个地点。试试片区名、地标名或道路名。'; list.append(empty);
    }
    const fragment = document.createDocumentFragment();
    for (const place of filtered.slice(0, listLimit)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `place atlas-place${selected?.id === place.id ? ' selected' : ''}`;
      button.dataset.placeId = place.id; button.dataset.id = place.id; button.setAttribute('aria-pressed', String(selected?.id === place.id));
      const icon = document.createElement('i'); icon.className = `atlas-place-icon atlas-icon-${place.category}`; icon.setAttribute('aria-hidden', 'true');
      icon.textContent = place.category === 'park' ? '♧' : place.category === 'district' ? '⌑' : place.category === 'road' ? '⌁' : place.category === 'transport' ? '▫' : '◇';
      const copy = document.createElement('span'); copy.className = 'atlas-place-copy';
      const name = document.createElement('span'); name.textContent = place.name;
      const small = document.createElement('small'); small.textContent = `${categoryNames[place.category]}${visited.has(place.id) ? ' · 已发现' : ''}`;
      copy.append(name, small);
      const distance = document.createElement('em'); distance.textContent = `${(Math.hypot(place.arrival[0] - state.x, place.arrival[1] - state.z) / 1000).toFixed(1)} km`;
      button.append(icon, copy, distance); fragment.append(button);
    }
    list.append(fragment);
    if (filtered.length > listLimit) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'atlas-more'; more.dataset.mapMore = 'true';
      more.textContent = `继续查看 · 还有 ${filtered.length - listLimit} 个地点`; list.append(more);
    }
    list.scrollTop = previousScroll;
    if (focusedPlaceId) Array.from(list.querySelectorAll<HTMLButtonElement>('[data-place-id]')).find(button => button.dataset.placeId === focusedPlaceId)?.focus({preventScroll: true});
    else if (focusedMore) (list.querySelector<HTMLButtonElement>('[data-map-more]') ?? list.querySelector<HTMLButtonElement>('[data-place-id]:last-child'))?.focus({preventScroll: true});
    const discovered = data.landmarks.filter(place => visited.has(place.id)).length;
    writeText(node('#map-discovery-count'), `城市足迹 ${discovered} / ${data.landmarks.length}`);
  }

  function renderSelection(): void {
    const actions = node('.atlas-route-actions'), secondary = node('.atlas-secondary-actions');
    actions.hidden = secondary.hidden = !selected;
    node<HTMLButtonElement>('#quick-travel').disabled = !selected || !options.onDebugTravel;
    node<HTMLButtonElement>('#photo-view').disabled = !selected;
    if (!selected) {
      writeText(title, '开往你想去的地方'); writeText(destinationStatus, '选择地点后，可瞬移到附近道路、俯瞰或自动驾驶。');
      writeText(node('#map-selection-category'), '下一站'); writeText(node('#map-selection-visited'), '');
      node('#map-destination-address').hidden = true; sourceLink.hidden = true; return;
    }
    writeText(title, selected.name); writeText(node('#map-selection-category'), categoryNames[selected.category]);
    writeText(node('#map-selection-visited'), visited.has(selected.id) ? '已发现' : '');
    const length = routeLength(route), hasRoute = route.length > 1;
    manual.disabled = auto.disabled = !hasRoute;
    writeText(destinationStatus, hasRoute ? length < 45 ? '目的地就在附近。沿路线抵达周边道路。' : `沿道路约 ${(length / 1000).toFixed(1)} 公里 · 抵达目的地周边` : '暂时没有连通的驾驶路线，可以先查看周边。');
    const address = node('#map-destination-address'); address.hidden = !selected.address;
    writeText(address, selected.address ?? '');
    const url = selected.source?.url;
    sourceLink.hidden = !url;
    if (url) sourceLink.href = url;
  }

  function selectDestination(destination: CityMapDestination | string, focus = true, notify = true): void {
    const resolved = typeof destination === 'string' ? catalog.find(place => place.id === destination) : destination;
    if (!resolved) return;
    selected = catalog.find(place => place.id === resolved.id) ?? asCatalog(resolved);
    route = graph.nodes.length ? graph.route([state.x, state.z], selected.arrival) : [];
    renderSelection(); renderList();
    if (focus) focusAt([selected.x, selected.z], selected.category === 'district' ? 2.1 : 3.4); else schedule();
    writeText(status, `已选择 ${selected.name}`);
    if (notify) options.onSelect(selected, route.map(p => [...p] as V2));
  }

  function selectAt(point: V2): void {
    const label = [...hitLabels].reverse().find(box => point[0] >= box.left && point[0] <= box.left + box.width && point[1] >= box.top && point[1] <= box.top + box.height);
    const marker = hitMarkers.find(p => Math.hypot(p.x - point[0], p.y - point[1]) < 13);
    if (label || marker) { selectDestination((label ?? marker)!.place, false); return; }
    const world = screenToMap(view, point), nearest = roadIndex.nearest(world);
    if (!nearest || nearest.distance > Math.min(180, 18 / view.scale)) { writeText(status, '这里没有附近的驾驶道路，请选择地图中的道路或地点。'); return; }
    const destination: CityMapDestination = {id: `map-point:${Math.round(nearest.x)}:${Math.round(nearest.z)}`, name: `${nearest.road.name} · 选定路段`,
      x: nearest.x, z: nearest.z, height: 0, area: '深圳 · 地图选点', excludeRadius: 0,
      arrival: [nearest.x, nearest.z], yaw: nearest.yaw, category: 'road', source: {provider: 'OpenStreetMap', id: nearest.road.id, url: `https://www.openstreetmap.org/${nearest.road.id}`, coordinateMethod: 'nearest_road_point'}};
    selectDestination(destination, false);
  }

  function drawBase(): void {
    const c = baseCtx, d = pixelRatio, s = view.scale;
    c.setTransform(d, 0, 0, d, 0, 0);
    const sea = c.createLinearGradient(0, 0, view.width * .6, view.height);
    sea.addColorStop(0, '#286d81'); sea.addColorStop(1, '#1d5067');
    c.fillStyle = sea; c.fillRect(0, 0, view.width, view.height);
    c.setTransform(s * d, 0, 0, -s * d, (view.width / 2 - view.x * s) * d, (view.height / 2 + view.z * s) * d);
    c.fillStyle = '#263b43'; c.fill(landPath, 'evenodd');
    c.strokeStyle = '#91cbd447'; c.lineWidth = 1.2 / s; c.stroke(landPath);
    c.fillStyle = '#36564d'; c.fill(greenPath, 'evenodd');
    c.fillStyle = '#286779'; c.fill(waterPath, 'evenodd'); c.strokeStyle = '#acdce155'; c.lineWidth = .7 / s; c.stroke(waterPath);
    const zoomLevel = view.scale / baseScale;
    if (zoomLevel > 3.6) {
      const left = view.x - view.width / (2 * s), right = view.x + view.width / (2 * s), bottom = view.z - view.height / (2 * s), top = view.z + view.height / (2 * s);
      c.fillStyle = '#c5d6df26'; c.strokeStyle = '#d7e4e52b'; c.lineWidth = .4 / s;
      for (let i = 0; i < data.buildings.length; i++) {
        const b = buildingBounds[i]; if (b[2] < left || b[0] > right || b[3] < bottom || b[1] > top) continue;
        let feature = buildingCache.get(i);
        if (!feature) { feature = {path: polygonPath(data.buildings[i].rings), bounds: b}; buildingCache.set(i, feature); }
        c.fill(feature.path, 'evenodd'); if (zoomLevel > 7) c.stroke(feature.path);
      }
    }
    const styles: Record<string, [string, number, number]> = {
      motorway: ['#e1d8b9', 1.5, 13], trunk: ['#e1d8b9', 1.5, 12], primary: ['#c2d1d1', 1.15, 8],
      secondary: ['#99b2b9', .85, 6], tertiary: ['#78959e', .6, 4], residential: ['#567883', .5, 3],
      unclassified: ['#51737f', .45, 2.4], service: ['#44646f', .4, 1.7],
    };
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const kind of [...roadKinds].reverse()) {
      if (zoomLevel < 1.55 && ['residential', 'unclassified', 'service'].includes(kind)) continue;
      const path = roadsByKind.get(kind); if (!path) continue;
      const [color, minimum, worldWidth] = styles[kind];
      c.strokeStyle = '#101819b8'; c.lineWidth = Math.max(minimum / s, worldWidth * .56) + .9 / s; c.stroke(path);
      c.strokeStyle = color; c.lineWidth = Math.max(minimum / s, worldWidth * .56); c.stroke(path);
    }
    baseDirty = false;
  }

  function eligible(place: CatalogPlace): boolean {
    if (place.id === selected?.id) return true;
    if (place.category === 'road') return false;
    if (place.category === 'district' && place.kind === 'city') return true;
    if (filter !== 'all' && place.category !== filter && !(filter === 'place' && place.category === 'transport')) return false;
    const zoom = view.scale / baseScale;
    if (place.category === 'district') return zoom >= (place.kind === 'suburb' ? 1.25 : place.kind === 'neighbourhood' ? 2.1 : 3.4);
    if (place.category === 'transport' || place.category === 'place') return zoom >= 2.3;
    return place.rank >= 90 || zoom >= 1.1;
  }

  function draw(): void {
    if (!visible || view.width < 2) return;
    if (baseDirty) drawBase();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(base, 0, 0);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const zoom = view.scale / baseScale, labels: TextLabel[] = [];
    hitLabels = []; hitMarkers = [];
    if (route.length) {
      ctx.beginPath(); route.forEach((p, i) => { const q = mapToScreen(view, p); i ? ctx.lineTo(...q) : ctx.moveTo(...q); });
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#1a271ee6'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = '#b4cd96'; ctx.lineWidth = 3.4; ctx.stroke();
    }
    const player = mapToScreen(view, [state.x, state.z]);
    labels.push({id: '__player', name: '', font: '', color: '', angle: 0, x: player[0], y: player[1], width: 30, height: 30, priority: 2000});
    const visiblePlaces = selected && !catalog.some(p => p.id === selected!.id) ? [...catalog, selected] : catalog;
    for (const place of visiblePlaces) {
      if (!eligible(place)) continue;
      const [x, y] = mapToScreen(view, [place.x, place.z]);
      if (x < -80 || y < -30 || x > view.width + 80 || y > view.height + 30) continue;
      const chosen = place.id === selected?.id, city = place.category === 'district' && place.kind === 'city';
      const district = place.category === 'district';
      const size = chosen ? 14 : city ? 22 : district ? place.kind === 'suburb' ? 14 : 12 : place.category === 'landmark' ? 12 : 11;
      const font = `${chosen ? '500' : '400'} ${size}px 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif`;
      ctx.font = font;
      const width = ctx.measureText(place.name).width + 16, height = city ? 41 : size + 12;
      const priority = chosen ? 1500 : city ? 950 : place.category === 'landmark' ? 850 : district ? 500 + (place.kind === 'suburb' ? 80 : 0) : place.rank + 350;
      const color = chosen ? '#f3f3e9' : city ? '#c3ccc485' : district ? '#d7dfd1ba' : visited.has(place.id) ? '#d8e5c8' : '#deded3';
      labels.push({id: place.id, name: place.name, x, y: district ? y : y - 20, width, height, priority, font, color, angle: 0, place, city,
        offsets: district ? [[0, 0], [0, -20], [0, 20]] : [[0, 0], [0, 42], [width / 2 + 7, 20], [-width / 2 - 7, 20]]});
      if (!district) {
        ctx.beginPath(); ctx.arc(x, y, chosen ? 6 : 3.2, 0, Math.PI * 2); ctx.fillStyle = chosen ? '#c1d99e' : '#b8c8b1'; ctx.fill();
        ctx.strokeStyle = '#17241dee'; ctx.lineWidth = 2; ctx.stroke();
        if (chosen) { ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.strokeStyle = '#c1d99e85'; ctx.lineWidth = 1; ctx.stroke(); }
        hitMarkers.push({x, y, place});
      }
    }
    const roadCandidates = new Map<string, {anchor: typeof roadAnchors[number]; distance: number}>();
    for (const anchor of roadAnchors) {
      const kind = anchor.road.kind.replace(/_link$/, '');
      if (zoom < 1.6 && !['motorway', 'trunk', 'primary'].includes(kind)) continue;
      if (zoom < 3 && ['residential', 'unclassified', 'service'].includes(kind)) continue;
      if (anchor.length * view.scale < 65) continue;
      const p = mapToScreen(view, anchor.point); if (p[0] < 50 || p[0] > view.width - 50 || p[1] < 20 || p[1] > view.height - 20) continue;
      const distance = Math.hypot(p[0] - view.width / 2, p[1] - view.height / 2);
      if (distance < (roadCandidates.get(anchor.road.name)?.distance ?? Infinity)) roadCandidates.set(anchor.road.name, {anchor, distance});
    }
    for (const {anchor} of roadCandidates.values()) {
      const p = mapToScreen(view, anchor.point), size = zoom < 3 ? 10 : 11;
      const font = `400 ${size}px 'PingFang SC', system-ui, sans-serif`; ctx.font = font;
      const width = ctx.measureText(anchor.road.name).width + 16, height = size + 8;
      labels.push({id: `label-road:${anchor.road.name}`, name: anchor.road.name, x: p[0], y: p[1],
        width: Math.abs(Math.cos(anchor.angle)) * width + Math.abs(Math.sin(anchor.angle)) * height,
        height: Math.abs(Math.sin(anchor.angle)) * width + Math.abs(Math.cos(anchor.angle)) * height,
        priority: ['trunk', 'primary'].includes(anchor.road.kind) ? 300 : 200, font, color: '#cad2c694', angle: anchor.angle});
    }
    const byId = new Map(labels.map(label => [label.id, label]));
    for (const placed of placeMapLabels(labels, view.width, view.height, 7).reverse()) {
      const label = byId.get(placed.id)!; if (!label.name) continue;
      ctx.save(); ctx.translate(placed.x, placed.y); ctx.rotate(label.angle); ctx.font = label.font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.strokeStyle = label.city ? '#19242680' : '#111c20e6'; ctx.lineWidth = label.city ? 5 : 4; ctx.strokeText(label.name, 0, label.city ? -5 : 0);
      ctx.fillStyle = label.color; ctx.fillText(label.name, 0, label.city ? -5 : 0);
      if (label.city && label.place?.nameEn) { ctx.font = '9px Arial, sans-serif'; ctx.fillStyle = '#b7c6b16e'; ctx.fillText(label.place.nameEn.toUpperCase(), 0, 16); }
      ctx.restore();
      if (label.place) hitLabels.push({...placed, place: label.place});
    }
    ctx.save(); ctx.translate(...player); ctx.rotate(state.yaw);
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 9); ctx.lineTo(0, 5); ctx.lineTo(-7, 9); ctx.closePath();
    ctx.strokeStyle = '#102722'; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = '#83dfc8'; ctx.fill(); ctx.restore();
    if (state.mapFocus) {
      const focus = mapToScreen(view, state.mapFocus);
      ctx.save(); ctx.translate(...focus); ctx.strokeStyle = '#e3faff'; ctx.lineWidth = 1.5;
      ctx.shadowColor = '#082b38'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.moveTo(-14, 0); ctx.lineTo(-5, 0);
      ctx.moveTo(5, 0); ctx.lineTo(14, 0); ctx.moveTo(0, -14); ctx.lineTo(0, -5); ctx.moveTo(0, 5); ctx.lineTo(0, 14); ctx.stroke(); ctx.restore();
    }
    const desired = 100 / view.scale, magnitude = 10 ** Math.floor(Math.log10(desired));
    const distance = [1, 2, 5, 10].map(n => n * magnitude).reverse().find(n => n <= desired) ?? magnitude;
    writeText(node('#map-scale-label'), distance >= 1000 ? `${distance / 1000} km` : `${Math.round(distance)} m`);
    node('#map-scale-line').style.width = `${Math.round(distance * view.scale)}px`;
    writeText(node('#map-view-level'), `${state.mapFocus ? '无人机附近 · ' : ''}${zoom < 1.5 ? '城市全览' : zoom < 3.5 ? '片区与干道' : '街道与周边'}`);
    // Read-only map diagnostics for interaction checks; no renderer coupling.
    canvas.dataset.viewX = String(view.x); canvas.dataset.viewZ = String(view.z);
    canvas.dataset.zoom = String(zoom); canvas.dataset.worldWidth = String(view.width / view.scale);
  }

  const pointers = new Map<number, V2>();
  let gesture: {point: V2; view: MapView; moved: boolean; pinchDistance?: number} | null = null;
  const pointerPoint = (event: PointerEvent | WheelEvent): V2 => { const rect = canvas.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top]; };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const point = pointerPoint(event); pointers.set(event.pointerId, point); canvas.setPointerCapture(event.pointerId); canvas.focus({preventScroll: true});
    if (pointers.size === 1) gesture = {point, view: {...view}, moved: false};
    else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; gesture = {point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], view: {...view}, moved: true, pinchDistance: Math.hypot(a[0] - b[0], a[1] - b[1])}; }
    canvas.classList.add('is-dragging');
  }, {signal});
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    const point = pointerPoint(event); pointers.set(event.pointerId, point);
    if (pointers.size >= 2 && gesture.pinchDistance) {
      const [a, b] = [...pointers.values()], middle: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const factor = Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(1, gesture.pinchDistance);
      view = zoomMapAt(gesture.view, gesture.point, clamp(gesture.view.scale * factor, baseScale * .8, baseScale * 18));
      rememberedLocalWidth = rememberLocalMapWidth(view, baseScale, rememberedLocalWidth);
      view.x -= (middle[0] - gesture.point[0]) / view.scale; view.z += (middle[1] - gesture.point[1]) / view.scale;
    } else {
      const dx = point[0] - gesture.point[0], dy = point[1] - gesture.point[1];
      if (Math.hypot(dx, dy) > 5) gesture.moved = true;
      if (gesture.moved) view = {...gesture.view, x: gesture.view.x - dx / gesture.view.scale, z: gesture.view.z + dy / gesture.view.scale};
    }
    constrainView(); schedule(true);
  }, {signal});
  const endPointer = (event: PointerEvent, cancelled: boolean): void => {
    if (!pointers.has(event.pointerId)) return;
    const click = !cancelled && pointers.size === 1 && gesture && !gesture.moved;
    pointers.delete(event.pointerId);
    if (click) selectAt(pointerPoint(event));
    if (pointers.size === 1) gesture = {point: [...pointers.values()][0], view: {...view}, moved: true};
    else if (!pointers.size) { gesture = null; canvas.classList.remove('is-dragging'); }
  };
  canvas.addEventListener('pointerup', event => endPointer(event, false), {signal});
  canvas.addEventListener('pointercancel', event => endPointer(event, true), {signal});
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoom(pointerPoint(event), Math.exp(-event.deltaY * (event.deltaMode === 1 ? .024 : .0015))); }, {passive: false, signal});
  canvas.addEventListener('keydown', event => {
    if (!visible || panel!.hidden) return;
    if (['+', '=', '-', '_'].includes(event.key)) { event.preventDefault(); zoom([view.width / 2, view.height / 2], ['+', '='].includes(event.key) ? 1.3 : 1 / 1.3); }
    else if (event.key.startsWith('Arrow')) { event.preventDefault(); const step = 65 / view.scale; view.x += event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0; view.z += event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0; constrainView(); schedule(true); }
    else if (event.key === '0') { event.preventDefault(); fitAll(); }
  }, {signal});
  panel.addEventListener('keydown', event => {
    if (!visible || panel!.hidden) return;
    event.stopPropagation();
    if (event.key === 'Escape' || (event.code === 'KeyM' && event.target !== search)) { event.preventDefault(); close(); options.onClose(); }
    if (event.key === 'Tab') {
      const focusables = Array.from(panel!.querySelectorAll<HTMLElement>('button:not([disabled]),input,a[href],canvas[tabindex]')).filter(el => !el.closest('[hidden]'));
      if (event.shiftKey && document.activeElement === focusables[0]) { event.preventDefault(); focusables.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusables.at(-1)) { event.preventDefault(); focusables[0]?.focus(); }
    }
  }, {signal});
  node('#close-map').addEventListener('click', () => { close(); options.onClose(); }, {signal});
  search.addEventListener('input', () => { listLimit = 70; renderList(); schedule(); }, {signal});
  node<HTMLFormElement>('.atlas-search').addEventListener('submit', event => { event.preventDefault(); if (search.value.trim() && filtered[0]) selectDestination(filtered[0]); }, {signal});
  discoveredOnly.addEventListener('change', () => { listLimit = 70; renderList(); schedule(); }, {signal});
  node('.atlas-filters').addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-category]'); if (!button) return;
    filter = button.dataset.mapCategory as MapCategory | 'all'; listLimit = 70;
    for (const item of Array.from(panel!.querySelectorAll('[data-map-category]'))) item.setAttribute('aria-pressed', String(item === button));
    renderList(); schedule();
  }, {signal});
  list.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-map-more]')) { listLimit += 70; renderList(); return; }
    const id = target.closest<HTMLElement>('[data-place-id]')?.dataset.placeId; if (id) selectDestination(id);
  }, {signal});
  node('.atlas-map-tools').addEventListener('click', event => {
    const command = (event.target as HTMLElement).closest<HTMLElement>('[data-map-command]')?.dataset.mapCommand;
    if (command === 'all') fitAll(); else if (command === 'player') focusAt([state.x, state.z], 3);
    else if (command === 'in' || command === 'out') zoom([view.width / 2, view.height / 2], command === 'in' ? 1.4 : 1 / 1.4);
  }, {signal});
  manual.addEventListener('click', () => { if (selected && !manual.disabled) options.onManualRoute(selected, route.map(p => [...p] as V2)); }, {signal});
  auto.addEventListener('click', () => { if (selected && !auto.disabled) options.onAutoDrive(selected, route.map(p => [...p] as V2)); }, {signal});
  node('#photo-view').addEventListener('click', () => { if (selected) options.onPhoto(selected); }, {signal});
  node('#quick-travel').addEventListener('click', () => { if (selected) options.onDebugTravel?.(selected); }, {signal});
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(viewport);

  function open(focus?: 'all' | 'player' | 'selection'): void {
    if (destroyed) return;
    if (!visible) previousFocus = document.activeElement as HTMLElement | null;
    visible = true; panel!.hidden = false; resize();
    if (focus === 'all') fitAll();
    else if (focus === 'selection' && selected) focusAt([selected.x, selected.z]);
    else {
      const point: V2 = focus === 'player' ? [state.x, state.z] : state.mapFocus ?? [state.x, state.z];
      view = localMapView(view, baseScale, point, rememberedLocalWidth); fitted = true; constrainView(); schedule(true);
    }
    renderList(); renderSelection(); schedule(); canvas.focus({preventScroll: true});
  }
  function close(): void {
    const wasVisible = visible;
    visible = false; panel!.hidden = true; pointers.clear(); gesture = null;
    canvas.classList.remove('is-dragging');
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (wasVisible) {
      // A map opened by the keyboard can have body as its previous focus.
      // Focusing body is a no-op in Chrome, leaving the hidden map canvas to
      // consume subsequent driving/pause keys through the panel listener.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const target = previousFocus?.isConnected && previousFocus !== document.body && !previousFocus.closest('[hidden]')
        ? previousFocus : document.querySelector<HTMLElement>('#game');
      if (target) {
        if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1;
        target.focus({preventScroll: true});
      }
      if (document.activeElement !== target) {
        const game = document.querySelector<HTMLElement>('#game');
        if (game) { if (!game.hasAttribute('tabindex')) game.tabIndex = -1; game.focus({preventScroll: true}); }
      }
      previousFocus = null;
    }
  }
  function updateState(next: CityMapState): void {
    state = {...state, ...next};
    let listChanged = false;
    if (next.visited) { const values = new Set(next.visited); listChanged = values.size !== visited.size || [...values].some(id => !visited.has(id)); visited = values; }
    if ('selected' in next) {
      const nextId = next.selected?.id ?? null;
      const incoming = next.selected;
      const payloadChanged = incoming && selected && (incoming.name !== selected.name || incoming.x !== selected.x || incoming.z !== selected.z ||
        incoming.arrival[0] !== selected.arrival[0] || incoming.arrival[1] !== selected.arrival[1] || incoming.yaw !== selected.yaw || incoming.height !== selected.height);
      if (nextId !== (selected?.id ?? null) || payloadChanged) {
        selected = incoming ? asCatalog({...catalog.find(p => p.id === nextId), ...incoming}) : null;
        if (!next.route) route = selected && graph.nodes.length ? graph.route([state.x, state.z], selected.arrival) : [];
        listChanged = true;
      }
    }
    if (next.route) route = next.route.map(p => [...p] as V2);
    if (visible) { if (listChanged) renderList(); renderSelection(); schedule(); }
  }

  const ready = fetch(new URL('../data/map-places.json', import.meta.url), {signal}).then(async response => {
    if (!response.ok) throw new Error('地图地点未能载入');
    const document = await response.json() as {schemaVersion: number; places: SourcedMapPlace[]};
    if (document.schemaVersion !== 1 || !Array.isArray(document.places)) throw new Error('地图地点格式不正确');
    if (destroyed) return;
    for (const place of document.places) {
      const converted = wgs84ToMap(place.lon, place.lat);
      if (!Number.isFinite(place.x + place.z) || Math.hypot(converted[0] - place.x, converted[1] - place.z) > .02) continue;
      if (catalog.some(p => p.name === place.name && Math.hypot(p.x - place.x, p.z - place.z) < 180)) continue;
      const nearest = roadIndex.nearest([place.x, place.z]); if (!nearest || nearest.distance > 600) continue;
      catalog.push({...place, height: 0, excludeRadius: 0, area: `深圳 · ${categoryNames[place.category]}`,
        arrival: [nearest.x, nearest.z], yaw: nearest.yaw,
        rank: place.kind === 'city' ? 95 : place.kind === 'suburb' ? 65 : place.category === 'park' ? 70 : place.category === 'district' ? 35 : 55});
    }
    if (visible) { renderList(); schedule(); }
  }).catch(error => {
    if (!destroyed && (error as Error).name !== 'AbortError') writeText(status, '部分片区名称暂未载入；现有地标与道路仍可选择。');
  });

  return {open, close, updateState, select: destination => selectDestination(destination), get selection() { return selected; }, ready,
    destroy() { close(); destroyed = true; abort.abort(); resizeObserver.disconnect(); buildingCache.clear(); panel!.replaceChildren(); panel!.classList.remove('city-map-panel'); }};
}
