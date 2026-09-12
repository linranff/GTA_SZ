import {
  Color3, Color4, DefaultRenderingPipeline, DirectionalLight, DynamicTexture, Engine,
  FreeCamera, HemisphericLight, LinesMesh, Mesh, MeshBuilder, PointLight, ShadowGenerator,
  Scene, StandardMaterial, TransformNode, Vector3, type AbstractMesh,
} from '@babylonjs/core';
import {
  CombatCore, COMBAT_RANGE, COMBAT_WEAPON, combatLabRenderRatio, type CombatFireResult,
} from './combat-core.ts';
import './combat-lab.css';

type Mode = 'overview' | 'aim' | 'inspect';
export type CombatLabPerf = {
  fps: number; meshes: number; materials: number; dpr: number; ratio: number;
  width: number; height: number; note: string;
};

const now = () => performance.now();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function paint(scene: Scene, name: string, color: Color3, spec: number, power: number, emissive?: Color3) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = Color3.White().scale(spec);
  material.specularPower = power;
  material.maxSimultaneousLights = 5;
  if (emissive) material.emissiveColor = emissive;
  return material;
}

function box(
  scene: Scene, name: string, w: number, h: number, d: number, parent: TransformNode | Scene,
  material: StandardMaterial, x = 0, y = 0, z = 0,
) {
  const mesh = MeshBuilder.CreateBox(name, {width: w, height: h, depth: d}, scene);
  if (parent instanceof TransformNode) mesh.parent = parent;
  mesh.material = material;
  mesh.position.set(x, y, z);
  mesh.isPickable = false;
  return mesh;
}

class CombatLabAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlocked = false;
  private dead = false;

  async unlock() {
    if (this.dead) return;
    if (!this.ctx) {
      const ctx = this.ctx = new AudioContext({latencyHint: 'interactive'});
      this.master = ctx.createGain();
      this.master.gain.value = 0.22;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      this.master.connect(compressor).connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 90210;
      for (let i = 0; i < data.length; i++) {
        seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
        data[i] = seed / 2147483648 - 1;
      }
    }
    await this.ctx.resume();
    this.unlocked = this.ctx.state === 'running';
  }

  play(kind: 'shot' | 'empty' | 'reload' | 'hit') {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master || !this.unlocked || ctx.state !== 'running') return;
    const at = ctx.currentTime;
    if (kind === 'shot') {
      this.burst(at, 0.08);
      this.tone('square', 190, 72, at, 0.08, 0.046);
    } else if (kind === 'empty') this.tone('square', 240, 150, at, 0.035, 0.016);
    else if (kind === 'reload') {
      this.tone('triangle', 150, 110, at, 0.07, 0.028);
      this.tone('triangle', 200, 140, at + 0.1, 0.06, 0.026);
    } else this.tone('triangle', 760, 260, at, 0.11, 0.036);
  }

  suspend() { if (this.ctx?.state === 'running') void this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'closed') void this.ctx.resume(); }

  dispose() {
    this.dead = true;
    this.unlocked = false;
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private tone(type: OscillatorType, from: number, to: number, at: number, dur: number, vol: number) {
    const ctx = this.ctx!, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + dur);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  private burst(at: number, vol: number) {
    if (!this.noise || !this.ctx || !this.master) return;
    const src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    src.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, at);
    filter.frequency.exponentialRampToValueAtTime(280, at + 0.09);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(at);
    src.stop(at + 0.12);
    src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
}

export class CombatLab {
  readonly core = new CombatCore();
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: FreeCamera;
  private readonly audio = new CombatLabAudio();
  private readonly abort = new AbortController();
  private readonly weapon: {root: TransformNode; slide: TransformNode; slideHome: number};
  private readonly dummy: {root: TransformNode; body: StandardMaterial};
  private readonly bench: TransformNode;
  private readonly flash: Mesh;
  private readonly spark: Mesh;
  private tracer: LinesMesh;
  private mode: Mode = 'overview';
  private disposed = false;
  private flashUntil = 0;
  private sparkUntil = 0;
  private hitMarkUntil = 0;
  private lastShot: CombatFireResult | null = null;
  private lockHint = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      stencil: true, preserveDrawingBuffer: true, powerPreference: 'high-performance',
    }, false);
    this.applyResize();
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.07, 0.064, 0.058, 1);
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogStart = 11;
    this.scene.fogEnd = 26;
    this.scene.fogColor = new Color3(0.12, 0.1, 0.09);
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.exposure = 0.92;
    this.scene.imageProcessingConfiguration.contrast = 1.16;
    this.camera = new FreeCamera('lab-eye', new Vector3(2.8, 1.62, 2.4), this.scene);
    this.camera.minZ = 0.05;
    this.camera.maxZ = 42;
    this.camera.fov = 0.86;
    this.camera.inputs.clear();
    this.camera.setTarget(new Vector3(0.05, 1.0, 12.2));
    const lights = this.light();
    const mats = this.materials();
    this.buildRange(mats, lights.shadows);
    this.bench = new TransformNode('bench-anchor', this.scene);
    this.bench.position.set(0.42, 0.92, 0.55);
    this.weapon = this.buildWeapon(mats);
    this.dummy = this.buildDummy(mats, lights.shadows);
    this.flash = MeshBuilder.CreateSphere('muzzle-flash', {diameter: 0.028, segments: 6}, this.scene);
    this.flash.parent = this.weapon.root;
    this.flash.position.set(0, 0.024, 0.122);
    this.flash.material = paint(this.scene, 'flash', new Color3(1, 0.72, 0.28), 0, 1, new Color3(1, 0.7, 0.25));
    this.flash.isPickable = false;
    this.flash.setEnabled(false);
    this.spark = MeshBuilder.CreateSphere('hit-spark', {diameter: 0.08, segments: 6}, this.scene);
    this.spark.material = paint(this.scene, 'spark', new Color3(1, 0.55, 0.2), 0, 1, new Color3(1, 0.45, 0.12));
    this.spark.isPickable = false;
    this.spark.setEnabled(false);
    this.tracer = MeshBuilder.CreateLines('tracer', {points: [Vector3.Zero(), new Vector3(0, 0, 1)], updatable: true}, this.scene);
    this.tracer.color = new Color3(1, 0.82, 0.45);
    this.tracer.setEnabled(false);
    const pipe = new DefaultRenderingPipeline('combat-lab', true, this.scene, [this.camera]);
    pipe.fxaaEnabled = true;
    pipe.bloomEnabled = false;
    pipe.imageProcessing.vignetteEnabled = true;
    pipe.imageProcessing.vignetteWeight = 0.85;
    pipe.imageProcessing.exposure = 0.92;
    pipe.imageProcessing.contrast = 1.16;
    this.restWeapon();
    this.bind();
    this.engine.runRenderLoop(() => this.frame());
    this.bootCapture();
    this.refreshUi();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.engine.stopRenderLoop();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.audio.dispose();
    this.scene.dispose();
    this.engine.dispose();
    document.body.classList.remove('is-aiming');
    delete window.__combatLab;
  }

  inspectWeapon() {
    this.mode = 'inspect';
    this.weapon.root.parent = null;
    this.weapon.root.scaling.setAll(1);
    this.weapon.root.position.set(0.1, 1.22, 6.2);
    this.weapon.root.rotation.set(-0.12, 0.95, 0.08);
    this.camera.parent = null;
    this.camera.fov = 0.68;
    this.camera.position.set(0.42, 1.34, 6.62);
    this.camera.setTarget(new Vector3(0.08, 1.2, 6.18));
    this.refreshUi();
    this.scene.render();
  }

  playPose() {
    this.mode = 'aim';
    this.camera.fov = 0.9;
    this.wearWeapon();
    this.syncAimCamera();
    this.refreshUi();
    this.scene.render();
  }

  samplePerf(): CombatLabPerf {
    return {
      fps: this.engine.getFps(),
      meshes: this.scene.meshes.length,
      materials: this.scene.materials.length,
      dpr: devicePixelRatio || 1,
      ratio: combatLabRenderRatio(innerWidth, innerHeight, devicePixelRatio || 1),
      width: innerWidth,
      height: innerHeight,
      note: '本机样本，不是 RTX 3060 目标机通过证明',
    };
  }

  api() {
    return {
      core: this.core,
      start: () => this.begin(false),
      inspectWeapon: () => this.inspectWeapon(),
      playPose: () => this.playPose(),
      fire: () => this.handleFire(this.core.tryFire(now())),
      samplePerf: () => this.samplePerf(),
      dispose: () => this.dispose(),
    };
  }

  private async begin(lockPointer: boolean) {
    this.core.start(now());
    this.mode = 'aim';
    this.camera.fov = 0.9;
    this.wearWeapon();
    this.syncAimCamera();
    if (lockPointer) {
      void this.audio.unlock();
      if (!await this.lockPointer()) this.pauseSession();
    }
    this.refreshUi();
  }

  private bootCapture() {
    const mode = new URLSearchParams(location.search).get('capture');
    if (mode === 'started') this.begin(false);
    if (mode === 'inspect') {
      this.begin(false);
      this.inspectWeapon();
    }
  }

  private frame() {
    if (this.disposed) return;
    const time = now();
    this.core.tick(Math.min(0.05, this.engine.getDeltaTime() / 1000), time);
    if (this.mode === 'aim') this.syncAimCamera();
    this.syncDummy();
    this.weapon.slide.position.z = this.weapon.slideHome - Math.min(1, this.core.view.recoilPitch / COMBAT_WEAPON.recoilKickPitch) * 0.016;
    this.flash.setEnabled(time < this.flashUntil);
    this.spark.setEnabled(time < this.sparkUntil);
    if (time >= this.sparkUntil && this.tracer.isEnabled()) this.tracer.setEnabled(false);
    this.refreshUi();
    this.scene.render();
  }

  private syncAimCamera() {
    const view = this.core.view;
    this.camera.parent = null;
    this.camera.position.set(COMBAT_RANGE.eye.x, COMBAT_RANGE.eye.y, COMBAT_RANGE.eye.z);
    this.camera.rotation.set(-view.aimPitch, view.aimYaw, 0);
  }

  private wearWeapon() {
    this.weapon.root.parent = this.camera;
    this.weapon.root.scaling.setAll(1.18);
    this.weapon.root.position.set(0.13, -0.105, 0.3);
    this.weapon.root.rotation.set(0.1, -0.22, 0.08);
  }

  private restWeapon() {
    this.weapon.root.parent = this.bench;
    this.weapon.root.scaling.setAll(1);
    this.weapon.root.position.set(0, 0.06, 0);
    this.weapon.root.rotation.set(-1.22, Math.PI * 0.08, 0);
  }

  private syncDummy() {
    const target = this.core.view.target;
    this.dummy.root.position.set(target.x, 0, target.z);
    this.dummy.root.rotation.z = target.stunned ? 0.1 : 0;
    this.dummy.body.emissiveColor = target.flash ? new Color3(0.45, 0.18, 0.04) : new Color3(0.04, 0.035, 0.03);
  }

  private handleFire(result: CombatFireResult) {
    this.lastShot = result;
    if (!result.ok) {
      if (result.reason === 'empty') this.audio.play('empty');
      return result;
    }
    this.audio.play('shot');
    this.flashUntil = now() + 46;
    const from = new Vector3(result.origin.x, result.origin.y - 0.02, result.origin.z + 0.2);
    const far = result.hit ? result.point : {
      x: result.origin.x + result.direction.x * 16,
      y: result.origin.y + result.direction.y * 16,
      z: result.origin.z + result.direction.z * 16,
    };
    this.tracer = MeshBuilder.CreateLines('tracer', {
      points: [from, new Vector3(far.x, far.y, far.z)],
      instance: this.tracer,
    });
    this.tracer.setEnabled(true);
    if (result.hit) {
      this.audio.play('hit');
      this.hitMarkUntil = now() + 150;
      this.spark.position.set(result.point.x, result.point.y, result.point.z);
      this.sparkUntil = now() + 120;
    }
    return result;
  }

  private applyResize() {
    const ratio = combatLabRenderRatio(innerWidth, innerHeight, devicePixelRatio || 1);
    this.engine.setHardwareScalingLevel(1 / ratio);
    this.engine.resize();
  }

  private pauseSession() {
    if (!this.core.view.started) return;
    this.core.releaseControl(now());
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.audio.suspend();
    document.body.classList.remove('is-aiming');
    this.refreshUi();
  }

  private async lockPointer(): Promise<boolean> {
    try {
      const pending = this.canvas.requestPointerLock();
      if (pending) await pending;
      if (document.pointerLockElement !== this.canvas) {
        this.lockHint = '鼠标未能锁定，请再点「继续训练」重试。';
        return false;
      }
      this.lockHint = '';
      return true;
    } catch (error) {
      this.lockHint = `鼠标锁定失败：${error instanceof Error ? error.message : String(error)}。请再点「继续训练」重试。`;
      return false;
    }
  }

  private async resumeFromUser() {
    if (!this.core.view.started) return;
    if (!await this.lockPointer()) {
      this.core.releaseControl(now());
      this.refreshUi();
      return;
    }
    this.core.setPaused(false, now());
    this.audio.resume();
    this.refreshUi();
  }

  private bind() {
    const {signal} = this.abort;
    $('start').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      void this.begin(true);
    }, {signal});
    $('resume').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      void this.resumeFromUser();
    }, {signal});
    $('reset').addEventListener('click', e => {
      e.stopPropagation();
      this.core.reset(now());
      this.refreshUi();
    }, {signal});
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.core.setPointerLocked(locked);
      document.body.classList.toggle('is-aiming', locked);
      if (locked) this.lockHint = '';
      else if (this.core.view.started && !this.core.view.paused) this.pauseSession();
      this.refreshUi();
    }, {signal});
    document.addEventListener('pointerlockerror', () => {
      this.lockHint = '鼠标锁定被拒绝，请再点「继续训练」重试。';
      if (this.core.view.started) this.pauseSession();
      this.refreshUi();
    }, {signal});
    this.canvas.addEventListener('mousedown', e => {
      if (e.button !== 0 || this.mode !== 'aim') return;
      if (this.core.view.paused || document.pointerLockElement !== this.canvas) return;
      this.handleFire(this.core.setTrigger(true, now()));
    }, {signal});
    window.addEventListener('mouseup', () => { this.core.setTrigger(false, now()); }, {signal});
    window.addEventListener('pointerup', () => { this.core.setTrigger(false, now()); }, {signal});
    window.addEventListener('pointercancel', () => { this.core.setTrigger(false, now()); }, {signal});
    this.canvas.addEventListener('mousemove', e => {
      if (document.pointerLockElement === this.canvas) this.core.look(e.movementX, e.movementY);
    }, {signal});
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        if (this.core.view.started && !this.core.view.paused) this.pauseSession();
        return;
      }
      if (e.code !== 'KeyR' && e.code !== 'KeyT') return;
      if (!this.core.view.started || this.core.view.paused) return;
      if (e.code === 'KeyT') this.core.reset(now());
      else {
        const reload = this.core.reload(now());
        if (reload.ok) this.audio.play('reload');
      }
      this.refreshUi();
    }, {signal});
    window.addEventListener('blur', () => this.pauseSession(), {signal});
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pauseSession(); }, {signal});
    window.addEventListener('resize', () => this.applyResize(), {signal});
    window.addEventListener('pagehide', () => this.dispose(), {signal});
  }

  private refreshUi() {
    const view = this.core.view;
    $('hits').textContent = String(view.score.hits);
    $('shots').textContent = String(view.score.shots);
    $('accuracy').textContent = view.score.shots ? `${Math.round(100 * view.score.hits / view.score.shots)}%` : '—';
    $('ammo').textContent = String(view.ammo);
    $('reserve').textContent = `备弹 ${view.reserve}`;
    $('status-line').textContent = {
      idle: '等待开始',
      ready: view.pointerLocked ? '瞄准中' : '点「继续训练」锁定鼠标',
      reloading: '换弹中',
      empty: '空仓 · 按 R 换弹',
      paused: '已暂停',
    }[view.status];
    $('gate').hidden = view.started;
    $('paused').hidden = !view.paused;
    $('reset').hidden = !view.started;
    $('crosshair').hidden = this.mode !== 'aim' || !view.started || view.paused;
    $('relock').hidden = true;
    const hint = $('lock-hint');
    hint.hidden = !this.lockHint;
    hint.textContent = this.lockHint;
    $('hit-mark').hidden = now() >= this.hitMarkUntil;
    const kick = view.recoilPitch * 520;
    $('crosshair').style.transform = `translateY(${-kick}px)`;
    const perf = this.samplePerf();
    $('perf').textContent = `${Math.round(perf.fps)} fps · ${perf.meshes} meshes`;
  }

  private light() {
    const hemi = new HemisphericLight('bay-bounce', new Vector3(0.15, 1, 0.2), this.scene);
    hemi.intensity = 0.62;
    hemi.diffuse = new Color3(0.82, 0.78, 0.72);
    hemi.groundColor = new Color3(0.22, 0.2, 0.18);
    const sun = new DirectionalLight('bay-key', new Vector3(-0.35, -0.82, 0.42), this.scene);
    sun.position = new Vector3(6, 10, -4);
    sun.diffuse = new Color3(1, 0.88, 0.74);
    sun.intensity = 0.85;
    const a = new PointLight('bay-lamp-a', new Vector3(0, 3.4, 4), this.scene);
    const b = new PointLight('bay-lamp-b', new Vector3(0, 3.4, 11), this.scene);
    a.diffuse = b.diffuse = new Color3(1, 0.82, 0.62);
    a.intensity = b.intensity = 1.6;
    a.range = b.range = 9;
    const shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.0004;
    return {shadows};
  }

  private materials() {
    return {
      concrete: paint(this.scene, 'concrete', new Color3(0.22, 0.2, 0.18), 0.08, 16),
      wall: paint(this.scene, 'wall', new Color3(0.13, 0.12, 0.11), 0.05, 12),
      rubber: paint(this.scene, 'rubber', new Color3(0.08, 0.07, 0.065), 0.04, 8),
      wood: paint(this.scene, 'wood', new Color3(0.36, 0.22, 0.12), 0.14, 22),
      steel: paint(this.scene, 'rail-steel', new Color3(0.34, 0.35, 0.36), 0.5, 56),
      dummy: paint(this.scene, 'dummy-body', new Color3(0.72, 0.68, 0.6), 0.1, 20, new Color3(0.03, 0.028, 0.024)),
      ring: paint(this.scene, 'dummy-ring', new Color3(0.78, 0.32, 0.08), 0.22, 36, new Color3(0.12, 0.03, 0.01)),
      polymer: paint(this.scene, 'grip-polymer', new Color3(0.2, 0.19, 0.16), 0.12, 28),
      panel: paint(this.scene, 'grip-panel', new Color3(0.08, 0.07, 0.06), 0.05, 14),
      slide: paint(this.scene, 'slide-steel', new Color3(0.68, 0.7, 0.72), 0.72, 96),
      barrel: paint(this.scene, 'barrel-nitride', new Color3(0.12, 0.12, 0.13), 0.42, 48),
      accent: paint(this.scene, 'trainer-accent', new Color3(0.7, 0.46, 0.18), 0.32, 32),
      sight: paint(this.scene, 'trainer-sight', new Color3(0.86, 0.34, 0.08), 0.18, 22, new Color3(0.22, 0.06, 0.015)),
    };
  }

  private buildRange(mats: ReturnType<CombatLab['materials']>, shadows: ShadowGenerator) {
    const floor = MeshBuilder.CreateGround('lane-floor', {width: 10, height: 22, subdivisions: 2}, this.scene);
    floor.position.z = 8;
    floor.material = this.laneTexture();
    floor.receiveShadows = true;
    const freeze = (mesh: AbstractMesh, receive = false) => {
      mesh.receiveShadows = receive;
      mesh.isPickable = false;
      mesh.computeWorldMatrix(true);
      mesh.freezeWorldMatrix();
    };
    freeze(floor, true);
    freeze(box(this.scene, 'back-wall', 10, 4.2, 0.28, this.scene, mats.rubber, 0, 2.1, 17.4));
    freeze(box(this.scene, 'left-wall', 0.28, 4.2, 22, this.scene, mats.wall, -5, 2.1, 8), true);
    freeze(box(this.scene, 'right-wall', 0.28, 4.2, 22, this.scene, mats.wall, 5, 2.1, 8), true);
    freeze(box(this.scene, 'ceiling', 10, 0.2, 22, this.scene, mats.wall, 0, 4.25, 8));
    freeze(box(this.scene, 'baffle-l', 0.08, 1.1, 16, this.scene, mats.wall, -1.7, 2.9, 9));
    freeze(box(this.scene, 'baffle-r', 0.08, 1.1, 16, this.scene, mats.wall, 1.7, 2.9, 9));
    freeze(box(this.scene, 'backstop', 3.4, 2.4, 0.22, this.scene, mats.rubber, 0, 1.3, 16.4), true);
    const bench = box(this.scene, 'bench', 0.7, 0.08, 0.36, this.scene, mats.wood, 0.42, 0.88, 0.55);
    freeze(box(this.scene, 'bench-leg-a', 0.06, 0.84, 0.06, this.scene, mats.wood, 0.18, 0.42, 0.42));
    freeze(box(this.scene, 'bench-leg-b', 0.06, 0.84, 0.06, this.scene, mats.wood, 0.66, 0.42, 0.68));
    shadows.addShadowCaster(bench);
    freeze(box(this.scene, 'crate', 0.32, 0.28, 0.32, this.scene, mats.wood, -0.7, 0.14, 0.4), true);
    freeze(box(this.scene, 'rail', 7.2, 0.05, 0.08, this.scene, mats.steel, 0, 0.12, 14), true);
    for (const z of [4, 11]) {
      const lamp = box(this.scene, `lamp-${z}`, 0.9, 0.06, 0.18, this.scene, mats.accent, 0, 3.62, z);
      lamp.material = paint(this.scene, `lamp-em-${z}`, new Color3(0.92, 0.74, 0.48), 0, 1, new Color3(0.2, 0.13, 0.05));
      freeze(lamp);
    }
  }

  private laneTexture() {
    const texture = new DynamicTexture('lane-marks', {width: 1024, height: 1024}, this.scene, true);
    const ctx = texture.getContext();
    ctx.fillStyle = '#2a2723';
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.fillStyle = '#1f1d1a';
    for (let i = 0; i < 18; i++) ctx.fillRect(0, i * 58, 1024, 2);
    ctx.strokeStyle = '#d4b06a';
    ctx.lineWidth = 8;
    ctx.setLineDash([28, 22]);
    ctx.beginPath();
    ctx.moveTo(512, 40);
    ctx.lineTo(512, 980);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e6d2a6';
    ctx.font = '700 70px sans-serif';
    ctx.fillText('01', 430, 130);
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#b7aa96';
    ctx.fillText('TRAINING ONLY', 360, 180);
    texture.update();
    const material = paint(this.scene, 'lane-floor', new Color3(1, 1, 1), 0.06, 10);
    material.diffuseTexture = texture;
    return material;
  }

  private buildWeapon(mats: ReturnType<CombatLab['materials']>) {
    const root = new TransformNode('helix-trainer', this.scene);
    box(this.scene, 'frame', 0.028, 0.034, 0.112, root, mats.polymer, 0, 0.006, 0.01);
    box(this.scene, 'dust-cover', 0.024, 0.01, 0.05, root, mats.polymer, 0, 0.02, 0.03);
    const slide = new TransformNode('slide', this.scene);
    slide.parent = root;
    slide.position.set(0, 0.026, 0.012);
    box(this.scene, 'slide-body', 0.026, 0.02, 0.12, slide, mats.slide, 0, 0, 0.01);
    box(this.scene, 'ejection', 0.012, 0.01, 0.028, slide, mats.barrel, 0.008, 0.002, 0.002);
    for (let i = 0; i < 6; i++) {
      box(this.scene, `serr-l-${i}`, 0.003, 0.014, 0.004, slide, mats.barrel, -0.014, 0, -0.038 + i * 0.007);
      box(this.scene, `serr-r-${i}`, 0.003, 0.014, 0.004, slide, mats.barrel, 0.014, 0, -0.038 + i * 0.007);
    }
    const barrel = MeshBuilder.CreateCylinder('barrel', {diameter: 0.011, height: 0.068, tessellation: 10}, this.scene);
    barrel.parent = root;
    barrel.material = mats.barrel;
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.022, 0.082);
    barrel.isPickable = false;
    const muzzle = MeshBuilder.CreateCylinder('muzzle', {diameter: 0.016, height: 0.01, tessellation: 10}, this.scene);
    muzzle.parent = root;
    muzzle.material = mats.accent;
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.022, 0.118);
    muzzle.isPickable = false;
    const grip = new TransformNode('grip', this.scene);
    grip.parent = root;
    grip.position.set(0, -0.012, -0.03);
    grip.rotation.x = 0.32;
    box(this.scene, 'grip-core', 0.024, 0.074, 0.03, grip, mats.polymer, 0, -0.03, 0);
    box(this.scene, 'grip-l', 0.004, 0.06, 0.026, grip, mats.panel, -0.014, -0.028, 0);
    box(this.scene, 'grip-r', 0.004, 0.06, 0.026, grip, mats.panel, 0.014, -0.028, 0);
    box(this.scene, 'mag', 0.02, 0.062, 0.022, grip, mats.barrel, 0, -0.03, 0.002);
    box(this.scene, 'mag-plate', 0.024, 0.008, 0.03, grip, mats.accent, 0, -0.068, 0);
    box(this.scene, 'guard-front', 0.02, 0.006, 0.028, root, mats.polymer, 0, -0.012, 0.018);
    box(this.scene, 'guard-bottom', 0.02, 0.018, 0.006, root, mats.polymer, 0, -0.022, 0.03);
    box(this.scene, 'trigger', 0.006, 0.016, 0.008, root, mats.panel, 0, -0.006, 0.012);
    box(this.scene, 'rear-sight-l', 0.004, 0.01, 0.008, slide, mats.sight, -0.006, 0.014, -0.05);
    box(this.scene, 'rear-sight-r', 0.004, 0.01, 0.008, slide, mats.sight, 0.006, 0.014, -0.05);
    box(this.scene, 'front-sight', 0.004, 0.01, 0.008, slide, mats.sight, 0, 0.015, 0.062);
    const fill = new PointLight('weapon-fill', new Vector3(0.07, 0.08, 0.04), this.scene);
    fill.parent = root;
    fill.diffuse = new Color3(1, 0.92, 0.82);
    fill.intensity = 0.28;
    fill.range = 0.45;
    return {root, slide, slideHome: slide.position.z};
  }

  private buildDummy(mats: ReturnType<CombatLab['materials']>, shadows: ShadowGenerator) {
    const root = new TransformNode('trainer-dummy', this.scene);
    const torso = box(this.scene, 'dummy-torso', 0.44, 0.72, 0.22, root, mats.dummy, 0, COMBAT_RANGE.targetHome.y, 0);
    const head = MeshBuilder.CreateSphere('dummy-head', {diameter: COMBAT_RANGE.headRadius * 2, segments: 8}, this.scene);
    head.parent = root;
    head.material = mats.dummy;
    head.position.set(0, COMBAT_RANGE.targetHome.y + COMBAT_RANGE.headOffset.y, 0);
    head.isPickable = false;
    box(this.scene, 'dummy-shoulder-l', 0.16, 0.12, 0.16, root, mats.dummy, -0.28, COMBAT_RANGE.targetHome.y + 0.28, 0);
    box(this.scene, 'dummy-shoulder-r', 0.16, 0.12, 0.16, root, mats.dummy, 0.28, COMBAT_RANGE.targetHome.y + 0.28, 0);
    box(this.scene, 'dummy-hip', 0.34, 0.16, 0.18, root, mats.dummy, 0, COMBAT_RANGE.targetHome.y - 0.42, 0);
    const pole = MeshBuilder.CreateCylinder('dummy-pole', {diameter: 0.06, height: 0.7, tessellation: 8}, this.scene);
    pole.parent = root;
    pole.material = mats.steel;
    pole.position.set(0, 0.35, 0);
    pole.isPickable = false;
    const carriage = box(this.scene, 'dummy-carriage', 0.28, 0.08, 0.18, root, mats.steel, 0, 0.08, 0);
    for (const [name, r] of [['ring-a', 0.16], ['ring-b', 0.1]] as const) {
      const ring = MeshBuilder.CreateTorus(name, {diameter: r * 2, thickness: 0.012, tessellation: 16}, this.scene);
      ring.parent = root;
      ring.material = mats.ring;
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, COMBAT_RANGE.targetHome.y + 0.06, -0.12);
      ring.isPickable = false;
    }
    for (const mesh of [torso, head, carriage, pole]) shadows.addShadowCaster(mesh);
    torso.receiveShadows = true;
    return {root, body: mats.dummy};
  }
}

declare global {
  interface Window {
    __combatLab?: ReturnType<CombatLab['api']>;
  }
}

const canvas = document.querySelector('#range');
if (canvas instanceof HTMLCanvasElement) {
  const lab = new CombatLab(canvas);
  window.__combatLab = lab.api();
}
