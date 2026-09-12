import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  CombatCore, COMBAT_WEAPON, COMBAT_RANGE, COMBAT_LAB_MAX_PIXELS, COMBAT_LAB_MAX_DPR,
  aimDirection, combatLabRenderRatio, targetPosition, traceShot,
} from '../src/combat-core.ts';

const eye = COMBAT_RANGE.eye;

function started(time = 0): CombatCore {
  const core = new CombatCore();
  assert.equal(core.start(time), true);
  return core;
}

test('empty magazine cannot fire and does not score a shot', () => {
  const core = started();
  let time = 0;
  for (let i = 0; i < COMBAT_WEAPON.magazineSize; i++) {
    time += COMBAT_WEAPON.fireIntervalMs;
    assert.equal(core.tryFire(time).ok, true);
  }
  const empty = core.tryFire(time + COMBAT_WEAPON.fireIntervalMs);
  assert.deepEqual(empty, {ok: false, reason: 'empty'});
  assert.equal(core.view.ammo, 0);
  assert.equal(core.view.score.shots, COMBAT_WEAPON.magazineSize);
  assert.equal(core.view.status, 'empty');
});

test('cannot fire while reloading; reload then fires again', () => {
  const core = started();
  assert.equal(core.tryFire(0).ok, true);
  assert.deepEqual(core.reload(20), {ok: true});
  assert.equal(core.view.reloading, true);
  assert.deepEqual(core.tryFire(200), {ok: false, reason: 'reloading'});
  assert.equal(core.view.score.shots, 1);
  core.tick(0.05, 20 + COMBAT_WEAPON.reloadMs);
  assert.equal(core.view.reloading, false);
  assert.equal(core.view.ammo, COMBAT_WEAPON.magazineSize);
  assert.equal(core.view.reserve, COMBAT_WEAPON.reserveCapacity - 1);
  assert.equal(core.tryFire(20 + COMBAT_WEAPON.reloadMs).ok, true);
});

test('fire interval blocks a second shot before the trainer cadence', () => {
  const core = started();
  assert.equal(core.tryFire(1000).ok, true);
  assert.deepEqual(core.tryFire(1000 + COMBAT_WEAPON.fireIntervalMs - 1), {ok: false, reason: 'interval'});
  assert.equal(core.view.score.shots, 1);
  assert.equal(core.tryFire(1000 + COMBAT_WEAPON.fireIntervalMs).ok, true);
  assert.equal(core.view.score.shots, 2);
});

test('default aim hits the dummy; a wide miss does not score', () => {
  const core = started();
  const hit = core.tryFire(0);
  assert.equal(hit.ok, true);
  if (hit.ok) assert.equal(hit.hit, true);
  assert.equal(core.view.score.hits, 1);
  assert.equal(core.view.score.misses, 0);
  assert.ok(core.view.target.stunned);
  core.setLook(0.55, 0);
  const miss = core.tryFire(COMBAT_WEAPON.fireIntervalMs);
  assert.equal(miss.ok, true);
  if (miss.ok) assert.equal(miss.hit, false);
  assert.equal(core.view.score.hits, 1);
  assert.equal(core.view.score.misses, 1);
  assert.equal(core.view.score.shots, 2);
});

test('reset restores ammo, score, aim and the dummy; pause freezes fire and motion', () => {
  const core = started(0);
  assert.equal(core.tryFire(0).ok, true);
  core.tick(0.05, 50);
  for (let t = 0; t < 40; t++) core.tick(0.05, 50 + t * 50);
  const moved = core.view.target.x;
  assert.ok(Math.abs(moved) > 0.2);
  core.setPaused(true, 3000);
  const frozen = core.view.target.x;
  core.tick(0.05, 4000);
  core.tick(0.05, 5000);
  assert.equal(core.view.target.x, frozen);
  assert.deepEqual(core.tryFire(5100), {ok: false, reason: 'paused'});
  assert.deepEqual(core.reload(5100), {ok: false, reason: 'paused'});
  core.look(40, -20);
  assert.equal(core.view.yaw, 0);
  core.reset(6000);
  const view = core.view;
  assert.equal(view.ammo, COMBAT_WEAPON.magazineSize);
  assert.equal(view.reserve, COMBAT_WEAPON.reserveCapacity);
  assert.deepEqual(view.score, {hits: 0, shots: 0, misses: 0, headHits: 0});
  assert.equal(view.yaw, 0);
  assert.equal(view.pitch, 0);
  assert.equal(view.target.x, COMBAT_RANGE.targetHome.x);
  assert.equal(view.paused, false);
  assert.equal(view.started, true);
});

test('returning with the trigger still held does not auto-fire', () => {
  const core = started();
  const first = core.setTrigger(true, 0);
  assert.equal(first.ok, true);
  core.setPaused(true, 100);
  assert.equal(core.view.requireTriggerRelease, true);
  assert.equal(core.view.triggerHeld, false);
  core.setPaused(false, 200);
  assert.deepEqual(core.setTrigger(true, 300), {ok: false, reason: 'await-release'});
  assert.equal(core.view.score.shots, 1);
  assert.deepEqual(core.setTrigger(false, 310), {ok: false, reason: 'released'});
  const again = core.setTrigger(true, 320 + COMBAT_WEAPON.fireIntervalMs);
  assert.equal(again.ok, true);
  assert.equal(core.view.score.shots, 2);
});

test('semi-auto ignores a held trigger; look stays clamped; reload pauses', () => {
  const core = started();
  assert.equal(core.setTrigger(true, 0).ok, true);
  assert.deepEqual(core.setTrigger(true, COMBAT_WEAPON.fireIntervalMs), {ok: false, reason: 'held'});
  core.setLook(1, 4);
  assert.equal(core.view.pitch, COMBAT_WEAPON.maxPitch);
  core.setLook(0, 0);
  core.setTrigger(false, 200);
  assert.equal(core.tryFire(400).ok, true);
  assert.deepEqual(core.reload(420), {ok: true});
  const remaining = core.view.reloadRemainingMs;
  core.setPaused(true, 420);
  core.tick(0.05, 2000);
  assert.ok(Math.abs(core.view.reloadRemainingMs - remaining) < 1);
  core.setPaused(false, 2000);
  core.tick(0.01, 2000 + remaining - 1);
  assert.equal(core.view.reloading, true);
  core.tick(0.01, 2000 + remaining);
  assert.equal(core.view.reloading, false);
});

test('escape releaseControl pauses; resume needs a new trigger press', () => {
  const core = started();
  core.setPointerLocked(true);
  assert.equal(core.setTrigger(true, 0).ok, true);
  assert.equal(core.releaseControl(80), true);
  assert.equal(core.view.paused, true);
  assert.equal(core.view.pointerLocked, false);
  assert.equal(core.view.requireTriggerRelease, true);
  assert.deepEqual(core.tryFire(120), {ok: false, reason: 'paused'});
  assert.deepEqual(core.reload(120), {ok: false, reason: 'paused'});
  core.look(30, -10);
  assert.equal(core.view.yaw, 0);
  assert.equal(core.releaseControl(160), true);
  assert.equal(core.view.paused, true);
  core.setPaused(false, 200);
  core.setPointerLocked(true);
  assert.deepEqual(core.setTrigger(true, 220), {ok: false, reason: 'await-release'});
  assert.equal(core.view.score.shots, 1);
  assert.deepEqual(core.setTrigger(false, 230), {ok: false, reason: 'released'});
  assert.equal(core.setTrigger(true, 230 + COMBAT_WEAPON.fireIntervalMs).ok, true);
  assert.equal(core.view.score.shots, 2);
});

test('trace and render-ratio helpers stay deterministic and capped', () => {
  const home = targetPosition(0);
  const head = traceShot(eye, aimDirection(0, 0), home);
  assert.equal(head?.zone, 'head');
  const miss = traceShot(eye, aimDirection(0.6, 0), home);
  assert.equal(miss, null);
  for (const [w, h, dpr] of [[1920, 1080, 2], [3840, 2160, 1], [3440, 1440, 1], [1280, 720, 2]] as const) {
    const ratio = combatLabRenderRatio(w, h, dpr);
    assert.ok(w * h * ratio * ratio <= COMBAT_LAB_MAX_PIXELS + 1);
    assert.ok(ratio <= Math.min(dpr, COMBAT_LAB_MAX_DPR));
  }
  assert.ok(Number.isFinite(combatLabRenderRatio(0, Number.NaN, Number.POSITIVE_INFINITY)));
});
