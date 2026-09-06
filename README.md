# ShenChengJi · 深城纪

**A browser city-driving and everyday-life prototype set in Shenzhen.**

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[Release v0.2](https://github.com/linranff/ShenChengJi/releases/tag/v0.2) · Babylon.js · TypeScript · Blender

Drive an indigo concept GT along the bay, walk through the city, take a small job, or fly above the skyline. ShenChengJi brings selected parts of Shenzhen Bay, Nanshan, Futian and Luohu into a compressed, playable city corridor.

The game UI is currently primarily in Simplified Chinese. These three language editions cover the documentation; they are not in-game language packs.

![Night driving in the current game](docs/images/v0.2-night-driving.png)

## What's in v0.2

- **Three lighting modes:** blue skies with sparse clouds, a photographic sunset, and a night sky with a Milky Way and softly lit thin clouds. Bay water and roadside puddles reflect the environment.
- **A more coherent city:** original building facades and materials remain visible in aerial views; detail and local lighting follow the area being viewed. Dark floors, individual windows and restrained colored accents preserve the night skyline's depth.
- **The hero GT:** an added rear wing, four metal exhaust outlets and cold-white HDR headlights, alongside the existing cockpit, working instruments and brake-light reflections.
- **Explore your way:** driving, walking, drone viewing, a searchable map, route previews, navigation and an autopilot with manual takeover.
- **Everyday work:** repeatable delivery, passenger and maintenance contracts, upgrades, character conversations and choices, and a room-savings goal. Progress is saved in the current browser; an unfinished contract needs to be accepted again after a page reload.
- **A city built in layers:** OSM-derived roads and footprints, selected landmark models, coastal terrain, bridges, vegetation, street furniture, traffic and pedestrians.

![The GT's rear wing and four exhaust outlets](docs/images/v0.2-sport-gt.png)

These are unedited screenshots from the running game. This is still a prototype: traffic and collisions are simplified, building heights and facades include artistic estimates, and the room-savings goal does not unlock a modeled apartment. It is not a survey-accurate reconstruction of all Shenzhen.

## Run locally

Use **Node.js 24**, npm, Git LFS and a desktop browser with WebGL2. The current visual checks use Chrome on macOS.

```sh
git lfs install
git clone https://github.com/linranff/ShenChengJi.git
cd ShenChengJi
git lfs pull
npm ci
npm run dev
```

Open the address printed by Vite, usually `http://127.0.0.1:5173/`. Large models, HDR environments and images are stored in **Git LFS**; a source download containing only LFS pointers is not a runnable game. Repository access is required while the repository is private.

For a production preview:

```sh
npm run build
npm run preview -- --port 4173
```

The development server has hot reload and polling disabled to keep long play sessions steady. Refresh manually after editing. Playing the existing assets does **not** require Blender or the original terrain downloads.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Drive: accelerate, steer, brake/reverse |
| Space | Handbrake |
| C | Cycle chase, cockpit and distant driving cameras |
| F | Exit/enter the car when nearby and stopped; leave an observation view |
| V | Inspect the car; press again to return |
| G | Enter/leave drone viewing |
| Mouse drag / wheel | Orbit / zoom in observation views |
| Drone: W A S D / arrow keys | Move / turn the view |
| Drone: Q / E / Shift | Descend / ascend / move faster |
| Drone: Shift + drag | Pan the view |
| M / Tab | Map: search, select a place and choose navigation or a viewing action |
| L | Cycle sunset → night → day |
| J / E | Open the city journal / interact at a nearby objective while stopped |
| H | Horn |
| R | Return the car to a nearby road |
| Esc / P | Close a menu or pause / show the frame-rate overlay |

On foot, use W A S D to move, drag or use the arrow keys to look, and hold Shift to walk faster. In autopilot, driving inputs or Space take control back. The pause menu contains sound and music settings; audio starts after the first click or keypress.

## Development and checks

```sh
npm test
npm run build
```

The v0.2 candidate passed **90 tests** and a production build. Current screenshots and short performance runs are documented in [city quality and the GT sport kit](docs/graphics/city-quality-sport-2026-09-06.md). These measurements do not establish a stable frame rate on every computer or throughout the whole city.

With a local server running, the latest visual checks can be repeated with:

```sh
node scripts/check-distant-city.mjs http://127.0.0.1:5173/
node scripts/check-city-sport-details.mjs http://127.0.0.1:5173/
```

These scripts currently use the macOS Chrome executable path. Captures and full diagnostics are generated under `output/playwright/` and are not part of the source checkout.

| Area | Entry point |
| --- | --- |
| Browser app and scene | `src/main.ts`, `src/city-world.ts` |
| Driving and city-life rules | `src/driving.ts`, `src/city-career.ts` |
| Base city and landmark additions | `public/city/city.json`, `public/city/landmark-detail.json` |
| Nearby facade streaming | `src/city-facade-stream.ts` |
| GT sport details | `src/city-sport-details.ts` |
| Blender mesh helpers | `scripts/city_mesh.py` |

Fine facades stream in 640 m tiles: prefetch within 1,050 m, display within 700 m and unload beyond 1,500 m. Base buildings and roads are loaded as complete assets. Aerial views retain the original building meshes and use view-frustum culling, while expensive local updates are throttled during movement.

Asset rebuilding is a separate workflow. Read [asset build and delivery](docs/资产重建与交付保护.md), [landmark delivery](docs/landmarks/delivery.md) and [coastal implementation](docs/coastal/implementation.md) before regenerating assets. `npm run assets -- --plan` prints the proposed build plan; the full clean rebuild has not yet been validated end to end. `scripts/city_mesh.py` initializes a Blender scene when imported, so do not import it for ordinary data inspection.

## Data, assets and credits

- Roads, footprints and geographic features: **© OpenStreetMap contributors**; see [data attribution](data/ATTRIBUTION.md).
- Hero vehicle: derived from **Khronos CarConcept**, with [CC BY 4.0 credits](public/licenses/carconcept-CC-BY-4.0.md).
- Daylight HDR: **Rustig Koppie (Pure Sky)** from Poly Haven; see [environment credits](public/licenses/daylight-environment.md).
- Terrain and landmarks: [coastal terrain credits](public/licenses/coastal-terrain.md) and [landmark attribution](public/city/LANDMARK_ATTRIBUTION.md).
- Other assets and runtime dependencies: [open asset credits](public/licenses/open-city-assets.md) and the notices in [public/licenses](public/licenses/).

Code, third-party art and geographic data have separate provenance; the asset notices are not a blanket license for the repository. Geographic inputs, inferred dimensions and artistic changes are documented separately. Most detailed development notes are currently in Chinese.
