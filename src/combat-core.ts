/** Pure combat-lab simulation. No DOM, renderer, audio, or wall clock. */

export type Vec3 = {x: number; y: number; z: number};
export type CombatHitZone = 'head' | 'body';
export type CombatDeny =
  | 'not-started'
  | 'paused'
  | 'empty'
  | 'reloading'
  | 'interval'
  | 'held'
  | 'await-release'
  | 'released';
export type CombatFireResult =
  | {ok: false; reason: CombatDeny}
  | {ok: true; hit: false; origin: Vec3; direction: Vec3}
  | {ok: true; hit: true; zone: CombatHitZone; origin: Vec3; direction: Vec3; point: Vec3};
export type CombatReloadResult =
  | {ok: false; reason: 'not-started' | 'paused' | 'reloading' | 'full' | 'no-reserve'}
  | {ok: true};
export type CombatScore = {hits: number; shots: number; misses: number; headHits: number};
export type CombatTargetView = {
  x: number; y: number; z: number; phase: number; stunned: boolean; flash: boolean;
};
export type CombatView = {
  started: boolean;
  paused: boolean;
  pointerLocked: boolean;
  requireTriggerRelease: boolean;
  triggerHeld: boolean;
  weaponId: string;
  weaponName: string;
  ammo: number;
  magazineSize: number;
  reserve: number;
  reloading: boolean;
  reloadRemainingMs: number;
  canFire: boolean;
  yaw: number;
  pitch: number;
  recoilPitch: number;
  recoilYaw: number;
  aimYaw: number;
  aimPitch: number;
  score: CombatScore;
  target: CombatTargetView;
  status: 'idle' | 'ready' | 'reloading' | 'empty' | 'paused';
};

export const COMBAT_WEAPON = {
  id: 'helix-trainer-ix',
  name: '螺旋训械 IX',
  magazineSize: 10,
  reserveCapacity: 30,
  fireIntervalMs: 180,
  reloadMs: 1500,
  recoilKickPitch: 0.048,
  recoilKickYaw: 0.01,
  recoilRecoverPerSec: 4.2,
  maxRecoilPitch: 0.22,
  lookSensitivity: 0.0024,
  minPitch: -1.15,
  maxPitch: 1.15,
  maxRange: 40,
} as const;

export const COMBAT_RANGE = {
  eye: {x: 0, y: 1.55, z: 0},
  targetHome: {x: 0, y: 1.08, z: 14},
  targetTravel: 3.2,
  targetOmega: 0.55,
  bodyHalf: {x: 0.23, y: 0.38, z: 0.14},
  headOffset: {x: 0, y: 0.54, z: 0},
  headRadius: 0.16,
  stunMs: 320,
  flashMs: 200,
  knock: 0.1,
} as const;

export const COMBAT_LAB_MAX_PIXELS = 1920 * 1080;
export const COMBAT_LAB_MAX_DPR = 1.5;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function combatLabRenderRatio(width: number, height: number, dpr: number): number {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const safe = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(safe, COMBAT_LAB_MAX_DPR, Math.sqrt(COMBAT_LAB_MAX_PIXELS / (w * h)));
}

export function aimDirection(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return {x: cp * Math.sin(yaw), y: sp, z: cp * Math.cos(yaw)};
}

export function targetPosition(phase: number, knockX = 0): Vec3 {
  return {
    x: COMBAT_RANGE.targetHome.x + COMBAT_RANGE.targetTravel * Math.sin(phase) + knockX,
    y: COMBAT_RANGE.targetHome.y,
    z: COMBAT_RANGE.targetHome.z,
  };
}

function sub(a: Vec3, b: Vec3): Vec3 {return {x: a.x - b.x, y: a.y - b.y, z: a.z - b.z};}
function add(a: Vec3, b: Vec3): Vec3 {return {x: a.x + b.x, y: a.y + b.y, z: a.z + b.z};}
function scale(a: Vec3, s: number): Vec3 {return {x: a.x * s, y: a.y * s, z: a.z * s};}
function dot(a: Vec3, b: Vec3): number {return a.x * b.x + a.y * b.y + a.z * b.z;}

function raySphere(origin: Vec3, dir: Vec3, center: Vec3, radius: number): number | null {
  const oc = sub(origin, center);
  const b = dot(oc, dir);
  const c = dot(oc, oc) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  if (t0 >= 0 && t0 <= COMBAT_WEAPON.maxRange) return t0;
  const t1 = -b + s;
  return t1 >= 0 && t1 <= COMBAT_WEAPON.maxRange ? t1 : null;
}

function rayAabb(origin: Vec3, dir: Vec3, center: Vec3, half: Vec3): number | null {
  let tmin = 0, tmax: number = COMBAT_WEAPON.maxRange;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = dir[axis], min = center[axis] - half[axis], max = center[axis] + half[axis];
    if (Math.abs(d) < 1e-8) {
      if (origin[axis] < min || origin[axis] > max) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (min - origin[axis]) * inv, t2 = (max - origin[axis]) * inv;
    if (t1 > t2) {const swap = t1; t1 = t2; t2 = swap;}
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function traceShot(origin: Vec3, direction: Vec3, target: Vec3): {zone: CombatHitZone; t: number; point: Vec3} | null {
  const head = add(target, COMBAT_RANGE.headOffset);
  const headT = raySphere(origin, direction, head, COMBAT_RANGE.headRadius);
  const bodyT = rayAabb(origin, direction, target, COMBAT_RANGE.bodyHalf);
  if (headT == null && bodyT == null) return null;
  if (headT != null && (bodyT == null || headT <= bodyT)) {
    return {zone: 'head', t: headT, point: add(origin, scale(direction, headT))};
  }
  return {zone: 'body', t: bodyT!, point: add(origin, scale(direction, bodyT!))};
}

export class CombatCore {
  private started = false;
  private paused = false;
  private pointerLocked = false;
  private requireTriggerRelease = false;
  private triggerHeld = false;
  private ammo = COMBAT_WEAPON.magazineSize;
  private reserve = COMBAT_WEAPON.reserveCapacity;
  private reloading = false;
  private reloadEndsAt = 0;
  private lastShotAt = -1e9;
  private yaw = 0;
  private pitch = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private hits = 0;
  private shots = 0;
  private misses = 0;
  private headHits = 0;
  private phase = 0;
  private knockX = 0;
  private stunUntil = 0;
  private flashUntil = 0;
  private time = 0;
  private pausedReloadRemaining = 0;

  start(timeMs: number): boolean {
    if (this.started) return false;
    this.started = true;
    this.time = timeMs;
    this.triggerHeld = false;
    return true;
  }

  setPaused(paused: boolean, timeMs: number): void {
    if (!this.started) return;
    if (this.paused === paused) {
      this.time = timeMs;
      return;
    }
    this.time = timeMs;
    if (paused && this.reloading) this.pausedReloadRemaining = this.reloadRemaining(timeMs);
    this.paused = paused;
    this.disarmTrigger();
    if (!paused && this.reloading) this.reloadEndsAt = timeMs + this.pausedReloadRemaining;
  }

  setPointerLocked(locked: boolean): void {
    const was = this.pointerLocked;
    this.pointerLocked = locked;
    if (was && !locked) this.disarmTrigger();
  }

  /** Esc, blur, hidden, or a lost pointer lock: pause and require a fresh trigger. */
  releaseControl(timeMs: number): boolean {
    if (!this.started) return false;
    this.pointerLocked = false;
    this.setPaused(true, timeMs);
    return true;
  }

  /** After blur, Esc, or returning to the page: the held button must be released. */
  disarmTrigger(): void {
    this.triggerHeld = false;
    this.requireTriggerRelease = true;
  }

  reset(timeMs: number): void {
    this.time = timeMs;
    this.paused = false;
    this.requireTriggerRelease = true;
    this.triggerHeld = false;
    this.ammo = COMBAT_WEAPON.magazineSize;
    this.reserve = COMBAT_WEAPON.reserveCapacity;
    this.reloading = false;
    this.reloadEndsAt = 0;
    this.lastShotAt = -1e9;
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.hits = 0;
    this.shots = 0;
    this.misses = 0;
    this.headHits = 0;
    this.phase = 0;
    this.knockX = 0;
    this.stunUntil = 0;
    this.flashUntil = 0;
  }

  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, COMBAT_WEAPON.minPitch, COMBAT_WEAPON.maxPitch);
  }

  look(movementX: number, movementY: number): void {
    if (!this.started || this.paused) return;
    this.yaw += movementX * COMBAT_WEAPON.lookSensitivity;
    this.pitch = clamp(
      this.pitch - movementY * COMBAT_WEAPON.lookSensitivity,
      COMBAT_WEAPON.minPitch,
      COMBAT_WEAPON.maxPitch,
    );
  }

  setTrigger(down: boolean, timeMs: number): CombatFireResult {
    if (!down) {
      this.triggerHeld = false;
      this.requireTriggerRelease = false;
      return {ok: false, reason: 'released'};
    }
    if (!this.started) return {ok: false, reason: 'not-started'};
    if (this.paused) return {ok: false, reason: 'paused'};
    if (this.requireTriggerRelease) return {ok: false, reason: 'await-release'};
    if (this.triggerHeld) return {ok: false, reason: 'held'};
    this.triggerHeld = true;
    return this.tryFire(timeMs);
  }

  tryFire(timeMs: number): CombatFireResult {
    if (!this.started) return {ok: false, reason: 'not-started'};
    if (this.paused) return {ok: false, reason: 'paused'};
    if (this.reloading) return {ok: false, reason: 'reloading'};
    if (this.ammo <= 0) return {ok: false, reason: 'empty'};
    if (timeMs - this.lastShotAt < COMBAT_WEAPON.fireIntervalMs) return {ok: false, reason: 'interval'};
    const origin = {...COMBAT_RANGE.eye};
    const direction = aimDirection(this.yaw + this.recoilYaw, this.pitch + this.recoilPitch);
    this.ammo -= 1;
    this.shots += 1;
    this.lastShotAt = timeMs;
    this.time = timeMs;
    this.recoilPitch = Math.min(COMBAT_WEAPON.maxRecoilPitch, this.recoilPitch + COMBAT_WEAPON.recoilKickPitch);
    this.recoilYaw += (this.shots % 2 === 0 ? -1 : 1) * COMBAT_WEAPON.recoilKickYaw;
    const hit = traceShot(origin, direction, this.targetPoint());
    if (!hit) {
      this.misses += 1;
      return {ok: true, hit: false, origin, direction};
    }
    this.hits += 1;
    if (hit.zone === 'head') this.headHits += 1;
    this.stunUntil = timeMs + COMBAT_RANGE.stunMs;
    this.flashUntil = timeMs + COMBAT_RANGE.flashMs;
    this.knockX += (direction.x >= 0 ? 1 : -1) * COMBAT_RANGE.knock;
    return {ok: true, hit: true, zone: hit.zone, origin, direction, point: hit.point};
  }

  reload(timeMs: number): CombatReloadResult {
    if (!this.started) return {ok: false, reason: 'not-started'};
    if (this.paused) return {ok: false, reason: 'paused'};
    if (this.reloading) return {ok: false, reason: 'reloading'};
    if (this.ammo >= COMBAT_WEAPON.magazineSize) return {ok: false, reason: 'full'};
    if (this.reserve <= 0) return {ok: false, reason: 'no-reserve'};
    this.time = timeMs;
    this.reloading = true;
    this.reloadEndsAt = timeMs + COMBAT_WEAPON.reloadMs;
    return {ok: true};
  }

  tick(dtSeconds: number, timeMs: number): void {
    this.time = timeMs;
    if (!this.started || this.paused) return;
    const dt = clamp(dtSeconds, 0, 0.05);
    const recover = Math.exp(-COMBAT_WEAPON.recoilRecoverPerSec * dt);
    this.recoilPitch *= recover;
    this.recoilYaw *= recover;
    if (this.reloading && timeMs >= this.reloadEndsAt) this.finishReload();
    if (timeMs >= this.stunUntil) {
      this.phase += COMBAT_RANGE.targetOmega * dt;
      this.knockX *= Math.exp(-dt * 6);
    }
  }

  aimRay(): {origin: Vec3; direction: Vec3} {
    return {
      origin: {...COMBAT_RANGE.eye},
      direction: aimDirection(this.yaw + this.recoilYaw, this.pitch + this.recoilPitch),
    };
  }

  get view(): CombatView {
    const reloading = this.reloading;
    const empty = this.ammo <= 0 && !reloading;
    const status = !this.started ? 'idle' : this.paused ? 'paused' : reloading ? 'reloading' : empty ? 'empty' : 'ready';
    return {
      started: this.started,
      paused: this.paused,
      pointerLocked: this.pointerLocked,
      requireTriggerRelease: this.requireTriggerRelease,
      triggerHeld: this.triggerHeld,
      weaponId: COMBAT_WEAPON.id,
      weaponName: COMBAT_WEAPON.name,
      ammo: this.ammo,
      magazineSize: COMBAT_WEAPON.magazineSize,
      reserve: this.reserve,
      reloading,
      reloadRemainingMs: this.reloadRemaining(this.time),
      canFire: this.started && !this.paused && !reloading && this.ammo > 0 && this.time - this.lastShotAt >= COMBAT_WEAPON.fireIntervalMs,
      yaw: this.yaw,
      pitch: this.pitch,
      recoilPitch: this.recoilPitch,
      recoilYaw: this.recoilYaw,
      aimYaw: this.yaw + this.recoilYaw,
      aimPitch: this.pitch + this.recoilPitch,
      score: {hits: this.hits, shots: this.shots, misses: this.misses, headHits: this.headHits},
      target: {
        ...this.targetPoint(),
        phase: this.phase,
        stunned: this.time < this.stunUntil,
        flash: this.time < this.flashUntil,
      },
      status,
    };
  }

  private targetPoint(): Vec3 {
    return targetPosition(this.phase, this.knockX);
  }

  private reloadRemaining(timeMs: number): number {
    if (!this.reloading) return 0;
    if (this.paused) return this.pausedReloadRemaining;
    return Math.max(0, this.reloadEndsAt - timeMs);
  }

  private finishReload(): void {
    const take = Math.min(COMBAT_WEAPON.magazineSize - this.ammo, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    this.reloading = false;
    this.reloadEndsAt = 0;
  }
}
