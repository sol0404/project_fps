import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTERS } from '/shared/characters.js';
import { MAP, TREES } from '/shared/map.js';

const CHARACTER_URL = '/client/models/chiikawa_and_friends.glb';
const NATURE_URL = '/client/models/kenney-nature/';

// 원본 모델은 키 약 0.6m — 치이카와 키가 약 1.4m(PLAYER.height)가 되도록 셋 모두 같은 배율로 키운다.
const CHARACTER_SCALE = 2.4;

// 충돌 없는 장식용 소품
export const DECOR_MODELS = [
  'grass', 'grass_large', 'grass_leafsLarge', 'grass',
  'flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_redB', 'flower_yellowB', 'flower_purpleB',
  'mushroom_redGroup', 'mushroom_tanGroup', 'plant_bushDetailed', 'rock_smallA', 'rock_smallFlatA',
];

const loader = new GLTFLoader();
const characters = {}; // id -> { template, height }
const props = {}; // 모델 이름 -> gltf.scene

const box = new THREE.Box3();
const v = new THREE.Vector3();

export async function loadAssets(onProgress) {
  const propNames = new Set([
    ...MAP.boxes.filter((b) => b.prop).map((b) => b.prop),
    ...TREES.map((t) => t.model),
    ...DECOR_MODELS,
  ]);
  const jobs = [loadCharacters(), ...[...propNames].map(loadProp)];
  let done = 0;
  for (const job of jobs) job.then(() => onProgress?.(++done, jobs.length));
  await Promise.all(jobs);
}

async function loadCharacters() {
  const gltf = await loader.loadAsync(CHARACTER_URL);
  gltf.scene.updateMatrixWorld(true);

  for (const [id, def] of Object.entries(CHARACTERS)) {
    const node = gltf.scene.getObjectByName(def.model);
    if (!node) throw new Error(`캐릭터 모델에 '${def.model}' 노드가 없습니다`);

    // Sketchfab 루트의 축 변환(Z-up → Y-up)과 0.01 스케일을 노드에 구워 넣는다.
    const model = node.clone(true);
    model.applyMatrix4(node.parent.matrixWorld);

    // 원점: 발바닥 중앙. 원본은 셋이 x축으로 나란히 서 있어서 각자 중심으로 옮긴다.
    const pivot = new THREE.Group();
    pivot.add(model);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    // 방향: 원본 얼굴은 +Z, 게임의 정면은 -Z
    pivot.rotation.y = Math.PI;
    pivot.scale.setScalar(CHARACTER_SCALE);

    const template = new THREE.Group();
    template.add(pivot);
    template.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    box.setFromObject(template);
    characters[id] = { template, height: box.getSize(v).y };
  }
}

async function loadProp(name) {
  const gltf = await loader.loadAsync(`${NATURE_URL}${name}.glb`);
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // Kenney GLB는 metallicFactor가 빠져 있어 기본값 1(금속)로 읽힌다 → 환경맵이 없으면 그늘진 면이 새까맣게 보임
      o.material.metalness = 0;
      o.material.roughness = 1;
    }
  });
  props[name] = gltf.scene;
}

// 캐릭터 인스턴스 — 은신(투명화)을 위해 재질은 인스턴스마다 복제한다.
// 재질은 KHR_materials_unlit → MeshBasicMaterial. 얼굴은 알파 마스크 텍스처, 어두운 Material.00x는 외곽선(뒤집힌 껍질)이다.
export function createCharacterModel(id) {
  const { template, height } = characters[id];
  const object = template.clone(true);
  const materials = [];
  object.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      materials.push(o.material);
    }
  });
  return { object, materials, height };
}

// 박스 중심/크기에 모델을 정확히 맞춰 배치한다(보이는 모양 = 서버 충돌 범위).
// 박스의 긴 축이 모델과 다르면 Y축으로 90° 돌려서 맞춘다.
export function fitProp(name, x, y, z, sx, sy, sz) {
  const inner = props[name].clone(true);
  box.setFromObject(inner);
  const size0 = box.getSize(new THREE.Vector3());
  if (Math.abs(size0.x - size0.z) > 0.05 && (size0.x > size0.z) !== (sx > sz)) inner.rotation.y = Math.PI / 2;

  box.setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  inner.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

  const outer = new THREE.Group();
  outer.add(inner);
  outer.scale.set(sx / size.x, sy / size.y, sz / size.z);
  outer.position.set(x, y - sy / 2, z);
  return outer;
}

// 비율을 유지한 채 높이(height)에 맞춰 바닥 (x, z)에 세운다.
export function placeProp(name, x, z, height, rotationY = 0) {
  const inner = props[name].clone(true);
  box.setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  inner.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

  const outer = new THREE.Group();
  outer.add(inner);
  outer.scale.setScalar(height / size.y);
  outer.position.set(x, 0, z);
  outer.rotation.y = rotationY;
  return outer;
}

// 캐릭터 선택 카드용 정면 썸네일
export function renderThumbnails(size = 220) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const result = {};
  for (const id of Object.keys(characters)) {
    const scene = new THREE.Scene();
    const { object, height } = createCharacterModel(id);
    scene.add(object);
    camera.position.set(0, height * 0.55, -height * 2.6); // 정면(-Z)에서 바라봄
    camera.lookAt(0, height * 0.45, 0);
    renderer.render(scene, camera);
    result[id] = renderer.domElement.toDataURL('image/png');
  }
  renderer.dispose();
  return result;
}
