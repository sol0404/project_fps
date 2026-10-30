import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { CHARACTERS, DEFAULT_CHARACTER, HEADSHOT_MULTIPLIER } from '../shared/characters.js';
import { MAP } from '../shared/map.js';
import { PLAYER, boxBounds, rayAABB, rayMap, playerHitboxes } from '../shared/physics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const TICK_RATE = 20;
const RESPAWN_MS = 3000;
const MAP_BOUNDS = MAP.boxes.map(boxBounds);

// ---------- 정적 파일 서버 ----------
const ROUTES = {
  '/client/': 'client',
  '/shared/': 'shared',
  '/vendor/': 'node_modules/three/build',
  '/vendor-addons/': 'node_modules/three/examples/jsm',
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

// 같은 네트워크의 다른 기기가 접속할 주소 (내부 IPv4)
function lanUrls() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((a) => a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a.address}:${PORT}`);
}

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/lan') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(lanUrls()));
  }
  if (url === '/') url = '/client/index.html';
  const prefix = Object.keys(ROUTES).find((p) => url.startsWith(p));
  const base = prefix && path.join(ROOT, ROUTES[prefix]);
  const file = base && path.join(base, url.slice(prefix.length));
  if (!file || !file.startsWith(base)) return notFound(res);
  fs.readFile(file, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function notFound(res) {
  res.writeHead(404);
  res.end('Not found');
}

// ---------- 게임 상태 ----------
const players = new Map(); // id -> player
let nextId = 1;

function publicInfo(p) {
  return {
    id: p.id, name: p.name, char: p.char, p: p.p, yaw: p.yaw, pitch: p.pitch,
    hp: p.hp, alive: p.alive, kills: p.kills, deaths: p.deaths,
  };
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.id !== exceptId && p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

// 살아있는 적에게서 가장 먼 스폰 지점
function pickSpawn(selfId) {
  let best = MAP.spawns[0];
  let bestDist = -1;
  for (const s of MAP.spawns) {
    let nearest = Infinity;
    for (const p of players.values()) {
      if (p.id === selfId || !p.alive) continue;
      nearest = Math.min(nearest, Math.hypot(p.p[0] - s[0], p.p[2] - s[2]));
    }
    if (nearest > bestDist) { bestDist = nearest; best = s; }
  }
  return [...best];
}

function isVec3(v) {
  return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
}

function handleJoin(p, msg) {
  p.name = String(msg.name || '').trim().slice(0, 16) || `Player${p.id}`;
  p.char = CHARACTERS[msg.char] ? msg.char : DEFAULT_CHARACTER;
  p.hp = CHARACTERS[p.char].hp;
  p.p = pickSpawn(p.id);
  p.alive = true;
  p.joined = true;
  send(p.ws, { t: 'welcome', id: p.id, players: [...players.values()].filter((o) => o.joined).map(publicInfo) });
  broadcast({ t: 'join', player: publicInfo(p) }, p.id);
  console.log(`[join] ${p.name} (${p.char})`);
}

function handleState(p, msg) {
  if (!p.alive || !isVec3(msg.p)) return;
  // TODO: 서버 측 이동 검증(속도 제한 등) — 지금은 클라이언트 위치를 신뢰한다.
  const lim = MAP.size / 2;
  p.p = [
    Math.max(-lim, Math.min(lim, msg.p[0])),
    Math.max(0, Math.min(50, msg.p[1])),
    Math.max(-lim, Math.min(lim, msg.p[2])),
  ];
  if (Number.isFinite(msg.yaw)) p.yaw = msg.yaw;
  if (Number.isFinite(msg.pitch)) p.pitch = msg.pitch;
}

function handleShoot(p, msg, now) {
  if (!p.alive || !isVec3(msg.o) || !isVec3(msg.d)) return;
  const weapon = CHARACTERS[p.char].weapon;
  if (now - p.lastShot < (1000 / weapon.fireRate) * 0.75) return; // 연사 속도 제한
  p.lastShot = now;
  p.cloakUntil = 0;

  const len = Math.hypot(...msg.d);
  if (len < 1e-6) return;
  const d = msg.d.map((v) => v / len);
  const eye = [p.p[0], p.p[1] + PLAYER.eye, p.p[2]];
  const o = Math.hypot(msg.o[0] - eye[0], msg.o[1] - eye[1], msg.o[2] - eye[2]) < 1.5 ? msg.o : eye;

  let dist = rayMap(o, d, MAP_BOUNDS, weapon.range);
  let target = null;
  let head = false;
  for (const other of players.values()) {
    if (other.id === p.id || !other.alive || !other.joined) continue;
    const hb = playerHitboxes(other.p);
    const th = rayAABB(o, d, hb.head.min, hb.head.max);
    const tb = rayAABB(o, d, hb.body.min, hb.body.max);
    const t = Math.min(th, tb);
    if (t < dist) { dist = t; target = other; head = th <= tb; }
  }

  const end = o.map((v, i) => v + d[i] * dist);
  broadcast({ t: 'shot', id: p.id, o, e: end }, p.id);

  if (target) {
    const dmg = Math.round(weapon.damage * (head ? HEADSHOT_MULTIPLIER : 1));
    const killed = applyDamage(target, dmg, p, head);
    send(p.ws, { t: 'hit', head, kill: killed });
  }
}

function applyDamage(target, dmg, attacker, head) {
  target.hp -= dmg;
  if (target.hp > 0) return false;
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  attacker.kills++;
  broadcast({ t: 'kill', killer: attacker.id, victim: target.id, head });
  setTimeout(() => respawn(target), RESPAWN_MS);
  return true;
}

function respawn(p) {
  if (!players.has(p.id)) return;
  p.p = pickSpawn(p.id);
  p.hp = CHARACTERS[p.char].hp;
  p.alive = true;
  p.cloakUntil = 0;
  broadcast({ t: 'respawn', id: p.id, p: p.p });
}

function handleAbility(p, now) {
  if (!p.alive || now < p.abilityReadyAt - 300) return; // 지연 보정용 300ms 허용
  const def = CHARACTERS[p.char];
  const ab = def.ability;
  p.abilityReadyAt = now + ab.cooldown * 1000;
  // 이동형 스킬(dash, leap)은 클라이언트가 처리하고, 상태형 스킬은 서버가 처리한다.
  if (ab.type === 'heal') p.hp = Math.min(def.hp, p.hp + ab.amount);
  if (ab.type === 'cloak') p.cloakUntil = now + ab.duration * 1000;
  broadcast({ t: 'ability', id: p.id, type: ab.type });
}

// ---------- 네트워크 ----------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const p = {
    id: nextId++, ws, joined: false, name: '', char: DEFAULT_CHARACTER,
    p: [0, 0, 0], yaw: 0, pitch: 0, hp: 100, alive: false, kills: 0, deaths: 0,
    lastShot: 0, abilityReadyAt: 0, cloakUntil: 0,
  };
  players.set(p.id, p);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const now = Date.now();
    if (msg.t === 'join') { if (!p.joined) handleJoin(p, msg); return; }
    if (!p.joined) return;
    switch (msg.t) {
      case 'state': handleState(p, msg); break;
      case 'shoot': handleShoot(p, msg, now); break;
      case 'ability': handleAbility(p, now); break;
    }
  });

  ws.on('close', () => {
    players.delete(p.id);
    if (p.joined) {
      broadcast({ t: 'leave', id: p.id });
      console.log(`[leave] ${p.name}`);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  const list = [];
  for (const p of players.values()) {
    if (!p.joined) continue;
    list.push({
      id: p.id, p: p.p, yaw: p.yaw, pitch: p.pitch, hp: p.hp, alive: p.alive,
      cloak: now < p.cloakUntil, kills: p.kills, deaths: p.deaths,
    });
  }
  if (list.length) broadcast({ t: 'snapshot', players: list });
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`FPS 서버 실행 중: http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`같은 네트워크의 다른 PC 접속 주소: ${url}`);
});
