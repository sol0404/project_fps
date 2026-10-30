import * as THREE from 'three';
import { CHARACTERS } from '/shared/characters.js';
import { MAP } from '/shared/map.js';
import { PLAYER, boxBounds, moveAndCollide, rayAABB, rayMap, playerHitboxes } from '/shared/physics.js';
import { Net } from './net.js';
import { loadAssets, renderThumbnails } from './assets.js';
import { buildMap, createWorld, createViewmodel, RemotePlayer } from './world.js';
import * as hud from './hud.js';

const MAP_BOUNDS = MAP.boxes.map(boxBounds);
const SEND_INTERVAL = 1000 / 20;
const SENSITIVITY = 0.0022;
const PHYSICS_STEP = 1 / 120;
const DASH_SPEED = 30;
const DASH_MS = 200;

const net = new Net();
const world = createWorld(document.getElementById('game'));
const { camera, renderer, scene, tracers } = world;
camera.position.set(0, 20, 34); // 메뉴 배경용 전경 시점
camera.lookAt(0, 0, 0);

const players = new Map(); // id -> { name, char, kills, deaths } (나 포함, 킬피드/점수판용)
const remotes = new Map(); // id -> RemotePlayer
const keys = new Set();
let me = null;
let viewmodel = null;
let mouseDown = false;
let lastSend = 0;

// ---------- 메뉴 ----------
let selectedChar = null;
const nameInput = document.getElementById('name-input');
const playBtn = document.getElementById('play-btn');
nameInput.value = localStorage.getItem('fps-name') || '';
let thumbnails = {};

fetch('/lan').then((r) => r.json()).then((urls) => {
  if (urls.length) document.getElementById('lan-hint').textContent = `같은 와이파이 친구 접속 주소: ${urls.join(' · ')}`;
}).catch(() => {});

document.getElementById('credits-btn').onclick = () => document.getElementById('credits').classList.remove('hidden');
document.getElementById('credits-close').onclick = () => document.getElementById('credits').classList.add('hidden');

playBtn.textContent = '모델 불러오는 중…';
loadAssets((done, total) => { playBtn.textContent = `모델 불러오는 중… ${done}/${total}`; })
  .then(() => {
    buildMap(scene);
    thumbnails = renderThumbnails();
    hud.buildCharacterSelect(CHARACTERS, thumbnails, (id) => {
      selectedChar = id;
      playBtn.disabled = false;
      playBtn.textContent = '게임 시작';
    });
    playBtn.textContent = '캐릭터를 선택하세요';
  })
  .catch((err) => {
    console.error(err);
    playBtn.textContent = `모델 로딩 실패: ${err.message}`;
  });

playBtn.onclick = async () => {
  playBtn.disabled = true;
  playBtn.textContent = '접속 중…';
  localStorage.setItem('fps-name', nameInput.value);
  try {
    await net.connect();
    net.send({ t: 'join', name: nameInput.value, char: selectedChar });
  } catch {
    playBtn.disabled = false;
    playBtn.textContent = '접속 실패 — 다시 시도';
  }
};

// ---------- 입력 ----------
const isLocked = () => document.pointerLockElement === renderer.domElement;
let freeLook = false;
let lookDragging = false;
const canControl = () => !!me && me.alive && (isLocked() || freeLook);
const lockMessage = document.getElementById('lock-message');
function clearInput() {
  keys.clear();
  mouseDown = false;
  lookDragging = false;
  if (me) me.dashUntil = 0;
}
function showLockError() {
  if (!me || isLocked()) return;
  lockMessage.textContent = '마우스 조작을 시작하지 못했어요. 게임 창을 선택한 뒤 다시 눌러 주세요. 계속 안 되면 일반 Chrome 창에서 열어 주세요.';
  hud.setLockHint(true);
}
async function lockPointer() {
  if (!me || !me.alive || isLocked()) return;
  try {
    freeLook = false;
    await renderer.domElement.requestPointerLock();
  } catch {
    showLockError();
  }
}
renderer.domElement.addEventListener('click', () => { if (!freeLook) lockPointer(); });
document.getElementById('resume-btn').addEventListener('click', lockPointer);
document.getElementById('free-play-btn').addEventListener('click', () => {
  if (!me || !me.alive) return;
  clearInput();
  freeLook = true;
  hud.setLockHint(false);
  renderer.domElement.focus();
});
renderer.domElement.addEventListener('contextmenu', (e) => { if (freeLook) e.preventDefault(); });
document.addEventListener('pointerlockerror', showLockError);
document.addEventListener('pointerlockchange', () => {
  clearInput();
  lockMessage.textContent = '게임 계속을 누르면 마우스로 시점을 움직일 수 있어요. Esc로 조작을 멈춥니다.';
  if (me) hud.setLockHint(!isLocked());
});
addEventListener('mousemove', (e) => {
  if (!canControl() || (!isLocked() && !lookDragging)) return;
  me.yaw -= e.movementX * SENSITIVITY;
  me.pitch = Math.max(-1.55, Math.min(1.55, me.pitch - e.movementY * SENSITIVITY));
});
addEventListener('mousedown', (e) => {
  if (!canControl()) return;
  if (freeLook && e.target !== renderer.domElement) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2 && freeLook) { lookDragging = true; e.preventDefault(); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) lookDragging = false; });

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && freeLook) { pauseControls(); return; }
  if (!canControl()) return;
  if (['Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyE') useAbility();
});
addEventListener('keyup', (e) => keys.delete(e.code));
function pauseControls() {
  freeLook = false;
  clearInput();
  if (me) hud.setLockHint(true);
}
addEventListener('blur', pauseControls);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseControls(); });

// ---------- 내 플레이어 ----------
function createMe(info) {
  const def = CHARACTERS[info.char];
  me = {
    id: info.id,
    def,
    pos: [...info.p],
    vel: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    onGround: false,
    hp: info.hp,
    alive: true,
    cloaked: false,
    ammo: def.weapon.mag,
    reloadingUntil: 0,
    nextShotAt: 0,
    abilityReadyAt: 0,
    dashUntil: 0,
    dashDir: [0, 0],
  };
  viewmodel = createViewmodel(camera, def.color);
  hud.setWeapon(def.weapon.name);
  hud.setPortrait(thumbnails[info.char], def.color);
}

// 입력 방향 → 월드 기준 수평 이동 벡터(정규화)
function wishDir() {
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const sin = Math.sin(me.yaw);
  const cos = Math.cos(me.yaw);
  let x = -sin * f + cos * s;
  let z = -cos * f - sin * s;
  const len = Math.hypot(x, z);
  if (len > 0) { x /= len; z /= len; }
  return [x, z];
}

function updateMovement(dt, now) {
  const [wx, wz] = wishDir();
  const speed = me.def.speed * ((keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 0.5 : 1);
  if (now < me.dashUntil) {
    me.vel[0] = me.dashDir[0] * DASH_SPEED;
    me.vel[2] = me.dashDir[1] * DASH_SPEED;
  } else {
    me.vel[0] = wx * speed;
    me.vel[2] = wz * speed;
  }
  if (keys.has('Space') && me.onGround) me.vel[1] = PLAYER.jump;

  // 빠른 이동(대시)에서 벽을 뚫지 않도록 고정 간격으로 나눠서 처리
  let remaining = dt;
  while (remaining > 0) {
    const step = Math.min(PHYSICS_STEP, remaining);
    me.vel[1] -= PLAYER.gravity * step;
    me.onGround = moveAndCollide(me.pos, me.vel, step, MAP_BOUNDS);
    remaining -= step;
  }
}

// ---------- 무기 ----------
function startReload() {
  const w = me.def.weapon;
  if (!me.alive || me.reloadingUntil || me.ammo >= w.mag) return;
  me.reloadingUntil = performance.now() + w.reload * 1000;
}

function tryShoot(now) {
  const w = me.def.weapon;
  if (now < me.nextShotAt || me.reloadingUntil) return;
  if (me.ammo <= 0) { startReload(); return; }
  me.nextShotAt = now + 1000 / w.fireRate;
  me.ammo--;
  if (!w.auto) mouseDown = false;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const spread = w.spread * (me.onGround ? 1 : 3);
  dir.x += (Math.random() - 0.5) * 2 * spread;
  dir.y += (Math.random() - 0.5) * 2 * spread;
  dir.z += (Math.random() - 0.5) * 2 * spread;
  dir.normalize();
  const o = camera.position.toArray();
  const d = dir.toArray();
  net.send({ t: 'shoot', o, d });

  // 궤적 끝점은 로컬에서 계산(표시용) — 실제 판정은 서버가 한다.
  let dist = rayMap(o, d, MAP_BOUNDS, w.range);
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    const hb = playerHitboxes(r.target.toArray());
    dist = Math.min(dist, rayAABB(o, d, hb.head.min, hb.head.max), rayAABB(o, d, hb.body.min, hb.body.max));
  }
  const muzzle = viewmodel.muzzle.getWorldPosition(new THREE.Vector3()).toArray();
  tracers.add(muzzle, o.map((v, i) => v + d[i] * dist), me.def.color);
  viewmodel.kick = 1;
}

// ---------- 스킬 ----------
function useAbility() {
  const now = performance.now();
  if (!me.alive || now < me.abilityReadyAt) return;
  const ab = me.def.ability;
  me.abilityReadyAt = now + ab.cooldown * 1000;

  // 이동형 스킬은 즉시 로컬 적용, 상태형(heal, cloak)은 서버 결과가 스냅샷으로 반영된다.
  if (ab.type === 'dash') {
    let [x, z] = wishDir();
    if (x === 0 && z === 0) { x = -Math.sin(me.yaw); z = -Math.cos(me.yaw); }
    me.dashDir = [x, z];
    me.dashUntil = now + DASH_MS;
  } else if (ab.type === 'leap') {
    me.vel[1] = ab.power;
  }
  net.send({ t: 'ability' });
}

// ---------- 네트워크 핸들러 ----------
function addRemote(info) {
  players.set(info.id, { name: info.name, char: info.char, kills: info.kills, deaths: info.deaths });
  if (info.id === me.id) return;
  remotes.set(info.id, new RemotePlayer(scene, info));
}

function playerTag(id) {
  const p = players.get(id);
  return p ? { name: p.name, color: CHARACTERS[p.char].color } : { name: '???', color: '#fff' };
}

net.on('welcome', (m) => {
  createMe(m.players.find((p) => p.id === m.id));
  for (const info of m.players) addRemote(info);
  hud.showGame();
  hud.setLockHint(true); // 마우스 고정은 재개 버튼의 사용자 입력으로 요청한다.
});

net.on('join', (m) => addRemote(m.player));

net.on('leave', (m) => {
  remotes.get(m.id)?.dispose();
  remotes.delete(m.id);
  players.delete(m.id);
});

net.on('snapshot', (m) => {
  for (const s of m.players) {
    const info = players.get(s.id);
    if (info) { info.kills = s.kills; info.deaths = s.deaths; }
    if (s.id === me.id) {
      if (s.hp < me.hp) hud.damageFlash();
      me.hp = s.hp;
      me.cloaked = s.cloak;
    } else {
      remotes.get(s.id)?.applyState(s);
    }
  }
});

net.on('shot', (m) => tracers.add(m.o, m.e, CHARACTERS[players.get(m.id)?.char]?.color));

net.on('hit', (m) => hud.hitmarker(m.head, m.kill));

net.on('kill', (m) => {
  hud.addKill(playerTag(m.killer), playerTag(m.victim), m.head);
  if (m.victim === me.id) {
    clearInput();
    me.alive = false;
    me.hp = 0;
    hud.showDeath(playerTag(m.killer).name);
  } else {
    const r = remotes.get(m.victim);
    if (r) r.alive = false;
  }
});

net.on('respawn', (m) => {
  if (m.id === me.id) {
    me.pos = [...m.p];
    me.vel = [0, 0, 0];
    me.hp = me.def.hp;
    me.alive = true;
    me.ammo = me.def.weapon.mag;
    me.reloadingUntil = 0;
    hud.hideDeath();
  } else {
    const r = remotes.get(m.id);
    if (r) { r.teleport(m.p); r.alive = true; }
  }
});

net.on('close', () => {
  hud.setStatus('서버와 연결이 끊어졌습니다. 새로고침하세요.');
  clearInput();
  if (isLocked()) document.exitPointerLock();
  hud.setLockHint(false);
  me = null;
});

// ---------- 게임 루프 ----------
function update(dt) {
  const now = performance.now();

  if (me.alive) {
    updateMovement(dt, now);
    if (mouseDown && canControl()) tryShoot(now);
    if (me.reloadingUntil && now >= me.reloadingUntil) {
      me.ammo = me.def.weapon.mag;
      me.reloadingUntil = 0;
    }
  }

  camera.position.set(me.pos[0], me.pos[1] + PLAYER.eye, me.pos[2]);
  camera.rotation.set(me.pitch, me.yaw, 0);

  // 뷰모델: 반동 + 재장전 시 내리기
  viewmodel.kick = Math.max(0, viewmodel.kick - dt * 12);
  viewmodel.root.visible = me.alive;
  viewmodel.root.position.copy(viewmodel.base);
  viewmodel.root.position.z += viewmodel.kick * 0.06;
  viewmodel.root.rotation.x = viewmodel.kick * 0.08 + (me.reloadingUntil ? -0.6 : 0);

  if (now - lastSend >= SEND_INTERVAL) {
    lastSend = now;
    net.send({ t: 'state', p: me.pos, yaw: me.yaw, pitch: me.pitch });
  }

  for (const r of remotes.values()) r.update(dt);

  hud.setHealth(me.hp, me.def.hp);
  hud.setAmmo(me.ammo, me.def.weapon.mag, !!me.reloadingUntil);
  hud.setAbility(me.def.ability, me.def.color, Math.max(0, (me.abilityReadyAt - now) / 1000));
  hud.setStatus(me.cloaked ? '은신 중' : freeLook ? '우클릭 드래그: 시점 · 좌클릭: 사격 · Esc: 조작 멈춤' : '');
  hud.showScoreboard(keys.has('Tab'), [...players].map(([id, p]) => ({
    id, name: p.name, charName: CHARACTERS[p.char].name, color: CHARACTERS[p.char].color,
    kills: p.kills, deaths: p.deaths,
  })), me.id);
}

// 개발용: ?debug 로 접속하면 콘솔/자동 테스트에서 상태를 들여다볼 수 있다.
if (new URLSearchParams(location.search).has('debug')) {
  window.__debug = { get me() { return me; }, remotes, camera, scene, fire: () => tryShoot(performance.now()) };
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (me) update(dt);
  tracers.update(dt);
  renderer.render(scene, camera);
});
