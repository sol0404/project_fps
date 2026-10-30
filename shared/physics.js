// 이동/충돌/레이캐스트 — 클라이언트(이동 예측)와 서버(히트 판정)가 함께 사용한다.
// 플레이어 위치(pos)는 발바닥 기준이다.
// 치비 체형(머리가 큰 2등신)에 맞춘 크기
export const PLAYER = {
  radius: 0.45,
  height: 1.45,
  eye: 1.1,
  gravity: 22,
  jump: 7.5,
};

const EPS = 1e-4;

export function boxBounds(b) {
  return {
    min: [b.x - b.sx / 2, b.y - b.sy / 2, b.z - b.sz / 2],
    max: [b.x + b.sx / 2, b.y + b.sy / 2, b.z + b.sz / 2],
  };
}

function overlaps(pos, b) {
  const r = PLAYER.radius;
  return pos[0] - r < b.max[0] && pos[0] + r > b.min[0]
    && pos[1] < b.max[1] && pos[1] + PLAYER.height > b.min[1]
    && pos[2] - r < b.max[2] && pos[2] + r > b.min[2];
}

// 축별로 이동 후 겹친 박스 밖으로 밀어낸다. pos, vel은 [x, y, z] 배열이며 직접 수정된다.
// 반환값: 바닥(또는 박스 위)에 서 있는지 여부
export function moveAndCollide(pos, vel, dt, bounds) {
  let onGround = false;
  for (let axis = 0; axis < 3; axis++) {
    const dir = Math.sign(vel[axis]);
    if (dir === 0) continue;
    pos[axis] += vel[axis] * dt;
    for (const b of bounds) {
      if (!overlaps(pos, b)) continue;
      const half = axis === 1 ? 0 : PLAYER.radius;
      if (dir > 0) {
        pos[axis] = b.min[axis] - (axis === 1 ? PLAYER.height : half) - EPS;
      } else {
        pos[axis] = b.max[axis] + half + EPS;
        if (axis === 1) onGround = true;
      }
      vel[axis] = 0;
    }
  }
  if (pos[1] <= 0) {
    pos[1] = 0;
    if (vel[1] < 0) vel[1] = 0;
    onGround = true;
  }
  return onGround;
}

// 슬랩 방식 광선-AABB 교차. d는 정규화된 방향. 맞으면 거리 t, 아니면 Infinity.
export function rayAABB(o, d, min, max) {
  let tmin = 0;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return Infinity;
      continue;
    }
    let t1 = (min[i] - o[i]) / d[i];
    let t2 = (max[i] - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// 맵 박스 중 가장 가까운 충돌 거리
export function rayMap(o, d, bounds, maxDist) {
  let t = maxDist;
  for (const b of bounds) t = Math.min(t, rayAABB(o, d, b.min, b.max));
  if (d[1] < 0) t = Math.min(t, -o[1] / d[1]); // 바닥
  return t;
}

// 머리(얼굴) 박스와 몸통 박스는 겹치지 않게 위아래로 나눈다.
const HIT_RADIUS = 0.55;
const NECK = 0.7;

export function playerHitboxes(p) {
  const [x, y, z] = p;
  const r = HIT_RADIUS;
  return {
    head: { min: [x - r, y + NECK, z - r], max: [x + r, y + PLAYER.height, z + r] },
    body: { min: [x - r, y, z - r], max: [x + r, y + NECK, z + r] },
  };
}
