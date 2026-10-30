import * as THREE from 'three';
import { CHARACTERS } from '/shared/characters.js';
import { MAP, TREES } from '/shared/map.js';
import { boxBounds } from '/shared/physics.js';
import { DECOR_MODELS, createCharacterModel, fitProp, placeProp } from './assets.js';

const SKY = '#b8e6ff';

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 45, 120);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
  camera.rotation.order = 'YXZ';
  scene.add(camera); // 뷰모델(총)을 카메라 자식으로 붙이기 위해 씬에 추가

  scene.add(new THREE.HemisphereLight('#ffffff', '#7fb069', 1.4));
  const sun = new THREE.DirectionalLight('#fff4dd', 2.2);
  sun.position.set(18, 40, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36 });
  scene.add(sun);

  buildGround(scene);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { renderer, scene, camera, tracers: new Tracers(scene) };
}

function buildGround(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.size + 2, MAP.size + 2),
    new THREE.MeshStandardMaterial({ color: '#8fd16f' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 흙길: 바깥 순환로 + 중앙 십자 (레인 안내용)
  const pathMat = new THREE.MeshStandardMaterial({ color: '#ead9a6' });
  const strips = [
    [0, -23, 50, 3], [0, 23, 50, 3], [-23, 0, 3, 50], [23, 0, 3, 50],
    [0, -14, 3, 18], [0, 14, 3, 18], [-14, 0, 18, 3], [14, 0, 18, 3],
  ];
  for (const [x, z, w, d] of strips) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.01, z);
    strip.receiveShadow = true;
    scene.add(strip);
  }
}

// 충돌 박스에 맞춘 소품 + 나무 + 장식. loadAssets() 이후에 호출한다.
export function buildMap(scene) {
  for (const b of MAP.boxes) {
    if (!b.prop) continue;
    // tile: 긴 축을 일정 길이로 나눠 같은 모델을 반복 배치
    const long = b.sx >= b.sz ? 'x' : 'z';
    const length = long === 'x' ? b.sx : b.sz;
    const count = b.tile ? Math.max(1, Math.round(length / b.tile)) : 1;
    const seg = length / count;
    for (let i = 0; i < count; i++) {
      const offset = -length / 2 + seg * (i + 0.5);
      const x = long === 'x' ? b.x + offset : b.x;
      const z = long === 'z' ? b.z + offset : b.z;
      scene.add(fitProp(b.prop, x, b.y, z, long === 'x' ? seg : b.sx, b.sy, long === 'z' ? seg : b.sz));
    }
  }

  for (const t of TREES) scene.add(placeProp(t.model, t.x, t.z, t.h, (t.x * 7 + t.z * 13) % 6));

  scatterDecor(scene);
}

// 고정 시드 난수 — 모든 플레이어에게 같은 배치
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatterDecor(scene) {
  const rand = mulberry32(20261030);
  const bounds = MAP.boxes.map(boxBounds);
  const PAD = 0.8;
  const blocked = (x, z) => bounds.some((b) => x > b.min[0] - PAD && x < b.max[0] + PAD && z > b.min[2] - PAD && z < b.max[2] + PAD)
    || MAP.spawns.some((s) => Math.hypot(s[0] - x, s[2] - z) < 2);

  let placed = 0;
  for (let tries = 0; placed < 260 && tries < 3000; tries++) {
    const x = (rand() - 0.5) * (MAP.size - 3);
    const z = (rand() - 0.5) * (MAP.size - 3);
    if (blocked(x, z)) continue;
    const name = DECOR_MODELS[Math.floor(rand() * DECOR_MODELS.length)];
    const height = name.startsWith('plant_bush') ? 0.8 : name.startsWith('rock') ? 0.35 : 0.35 + rand() * 0.35;
    const prop = placeProp(name, x, z, height, rand() * Math.PI * 2);
    prop.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    scene.add(prop);
    placed++;
  }
}

function makeLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, 128, 42);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 42);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(2, 0.5, 1);
  return sprite;
}

// 다른 플레이어 — 서버 스냅샷 위치로 보간 이동. 리깅이 없어서 걸을 때 통통 튀는 바운스로 대신한다.
export class RemotePlayer {
  constructor(scene, info) {
    const def = CHARACTERS[info.char];
    this.scene = scene;
    this.group = new THREE.Group();

    const { object, materials, height } = createCharacterModel(info.char);
    this.model = object;
    this.materials = materials;

    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: '#333' }));
    gun.position.set(0.55, 0.55, -0.35);
    gun.castShadow = true;
    this.model.add(gun);
    this.materials.push(gun.material);

    this.label = makeLabel(info.name, def.color);
    this.label.position.y = height + 0.35;

    this.group.add(this.model, this.label);
    scene.add(this.group);

    this.target = new THREE.Vector3(...info.p);
    this.group.position.copy(this.target);
    this.lastPos = this.group.position.clone();
    this.yaw = info.yaw;
    this.alive = info.alive;
    this.cloak = false;
    this.appliedCloak = false;
    this.phase = 0;
    this.bounce = 0;
  }

  applyState(s) {
    this.target.set(...s.p);
    this.yaw = s.yaw;
    this.alive = s.alive;
    this.cloak = s.cloak;
  }

  teleport(p) {
    this.target.set(...p);
    this.group.position.copy(this.target);
    this.lastPos.copy(this.target);
  }

  update(dt) {
    this.group.position.lerp(this.target, 1 - Math.exp(-15 * dt));
    let diff = this.yaw - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * (1 - Math.exp(-15 * dt));

    // 걷기 바운스: 수평 속도에 비례해 깡총깡총 + 살짝 찌그러짐
    const p = this.group.position;
    const speed = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) / Math.max(dt, 1e-4);
    this.lastPos.copy(p);
    const moving = speed > 0.8;
    this.bounce += ((moving ? 1 : 0) - this.bounce) * Math.min(1, dt * 10);
    this.phase += dt * Math.min(speed, 12) * 2.2;
    const hop = Math.abs(Math.sin(this.phase)) * 0.18 * this.bounce;
    const squash = Math.cos(this.phase * 2) * 0.06 * this.bounce;
    this.model.position.y = hop;
    this.model.scale.set(1 + squash, 1 - squash, 1 + squash);
    this.model.rotation.z = Math.sin(this.phase) * 0.08 * this.bounce;

    this.group.visible = this.alive;
    if (this.cloak !== this.appliedCloak) {
      this.appliedCloak = this.cloak;
      for (const m of this.materials) {
        m.transparent = this.cloak;
        m.opacity = this.cloak ? 0.06 : 1;
        m.needsUpdate = true;
      }
    }
    this.label.visible = !this.cloak;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

// 총알 궤적 — 짧게 보였다가 사라지는 선
const TRACER_LIFE = 0.08;

export class Tracers {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  add(from, to, color = '#ffe08a') {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true }));
    this.scene.add(line);
    this.list.push({ line, life: TRACER_LIFE });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / TRACER_LIFE);
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}

// 1인칭 총 모델 — 카메라 자식
export function createViewmodel(camera, color) {
  const root = new THREE.Group();
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: '#3a3d44' }));
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.03, 0.3),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }),
  );
  stripe.position.set(0, 0.04, -0.05);
  const muzzle = new THREE.Object3D();
  muzzle.position.z = -0.27;
  root.add(gun, stripe, muzzle);
  root.scale.setScalar(0.6);
  root.position.set(0.24, -0.22, -0.5);
  camera.add(root);
  return { root, muzzle, base: root.position.clone(), kick: 0 };
}
