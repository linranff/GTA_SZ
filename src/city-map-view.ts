import type {V2} from './city-types.ts';
import type {MapView} from './city-map-geometry.ts';

/** Reopen around the current location, keeping a useful street/district scale. */
export function localMapView(view: MapView, baseScale: number, focus: V2, rememberedWidth: number | null = null): MapView {
  const preferred = rememberedWidth && Number.isFinite(rememberedWidth) && rememberedWidth > 0
    ? view.width / rememberedWidth : Math.max(baseScale * 4.5, view.width / 2600);
  const scale = Math.max(baseScale * 2.4, Math.min(baseScale * 18, preferred));
  return {...view, x: focus[0], z: focus[1], scale};
}

/** A temporary full-city inspection should not replace the user's local zoom. */
export function rememberLocalMapWidth(view: MapView, baseScale: number, previous: number | null): number | null {
  return view.scale >= baseScale * 2.4 ? view.width / view.scale : previous;
}
