// 맵 데이터 — 클라이언트(렌더링)와 서버(충돌/히트 판정)가 같은 박스를 쓴다.
// 박스: 중심 좌표(x, y, z) + 크기(sx, sy, sz). 바닥은 y = 0 평면.
// prop: client/models/kenney-nature 의 모델 이름 — 박스 크기에 정확히 맞춰 늘려서 그린다(보이는 것 = 충돌 범위).
// tile: 긴 박스를 이 길이 단위로 나눠 모델을 반복 배치한다.
// 밸런스를 위해 절반만 정의하고 원점 기준 180° 회전 대칭으로 나머지 절반을 만든다.

const mirror = (b) => ({ ...b, x: -b.x, z: -b.z });
const symmetric = (list) => [...list, ...list.map(mirror)];

const WALL = 'cliff_block_rock';
const STONE = 'cliff_block_stone';

// 나무: 줄기만 충돌(총알·이동 차단), 잎은 통과
const TREES_HALF = [
  { x: -26, z: -14, model: 'tree_oak', h: 6 },
  { x: -12, z: -27, model: 'tree_default', h: 7 },
  { x: -26, z: 14, model: 'tree_fat', h: 5.5 },
  { x: -21, z: -21, model: 'tree_pineRoundA', h: 6.5 },
  { x: -8, z: 10, model: 'tree_detailed', h: 6 },
  { x: -21, z: -8, model: 'tree_cone', h: 6 },
];
export const TREES = symmetric(TREES_HALF);
const TRUNK = 0.7;
const trunkBox = (t) => ({ x: t.x, y: t.h * 0.3, z: t.z, sx: TRUNK, sy: t.h * 0.6, sz: TRUNK, trunk: true });

const BOXES_HALF = [
  // 중앙 고지대 계단 (고지대 본체는 아래에서 한 번만 정의)
  { x: 0, y: 1.0, z: -4.75, sx: 3, sy: 2.0, sz: 1.5, prop: STONE },
  { x: 0, y: 0.7, z: -6.25, sx: 3, sy: 1.4, sz: 1.5, prop: STONE },
  { x: 0, y: 0.35, z: -7.75, sx: 3, sy: 0.7, sz: 1.5, prop: STONE },

  // 레인 벽 — 가운데 통로(4m)를 남기고 두 조각
  { x: -17, y: 1.3, z: -5.5, sx: 1.2, sy: 2.6, sz: 7, prop: WALL, tile: 2.4 },
  { x: -17, y: 1.3, z: 5.5, sx: 1.2, sy: 2.6, sz: 7, prop: WALL, tile: 2.4 },
  { x: -5.5, y: 1.3, z: -17, sx: 7, sy: 2.6, sz: 1.2, prop: WALL, tile: 2.4 },
  { x: 5.5, y: 1.3, z: -17, sx: 7, sy: 2.6, sz: 1.2, prop: WALL, tile: 2.4 },

  // 큰 바위 엄폐물
  { x: -12, y: 1, z: -12, sx: 3, sy: 2, sz: 3, prop: 'rock_tallB' },
  { x: 12, y: 1, z: -12, sx: 3, sy: 2, sz: 3, prop: 'rock_tallA' },
  { x: -22, y: 0.9, z: 3, sx: 2.2, sy: 1.8, sz: 2.6, prop: 'rock_tallH' },
  { x: 4, y: 0.6, z: -22, sx: 2.6, sy: 1.2, sz: 2, prop: 'rock_largeF' },

  // 통나무 더미 · 그루터기 (낮은 엄폐 — 머리만 노출)
  { x: -6, y: 0.6, z: -11, sx: 2.4, sy: 1.2, sz: 1.4, prop: 'log_stackLarge' },
  { x: -24, y: 0.4, z: -8, sx: 1.4, sy: 0.8, sz: 1.4, prop: 'stump_squareDetailedWide' },

  // 울타리 (낮은 엄폐)
  { x: -8, y: 0.5, z: -23, sx: 6, sy: 1, sz: 0.3, prop: 'fence_planks', tile: 2 },
  { x: 23, y: 0.5, z: -9, sx: 0.3, sy: 1, sz: 6, prop: 'fence_planks', tile: 2 },

  // 저격 언덕 + 계단 (1.2m씩 점프로 오름)
  { x: 25.5, y: 1.75, z: -24, sx: 3, sy: 3.5, sz: 4, prop: STONE },
  { x: 23.25, y: 1.2, z: -24, sx: 1.5, sy: 2.4, sz: 2, prop: STONE },
  { x: 21.75, y: 0.6, z: -24, sx: 1.5, sy: 1.2, sz: 2, prop: STONE },
];

export const MAP = {
  size: 60,
  boxes: [
    // 외벽 (안쪽 면이 ±30)
    { x: 0, y: 2.5, z: -30.5, sx: 62, sy: 5, sz: 1, prop: WALL, tile: 3 },
    { x: 0, y: 2.5, z: 30.5, sx: 62, sy: 5, sz: 1, prop: WALL, tile: 3 },
    { x: -30.5, y: 2.5, z: 0, sx: 1, sy: 5, sz: 60, prop: WALL, tile: 3 },
    { x: 30.5, y: 2.5, z: 0, sx: 1, sy: 5, sz: 60, prop: WALL, tile: 3 },
    // 중앙 고지대
    { x: 0, y: 1.3, z: 0, sx: 8, sy: 2.6, sz: 8, prop: STONE, tile: 4 },
    ...symmetric(BOXES_HALF),
    ...TREES.map(trunkBox),
  ],
  spawns: [[-25, 0, -25], [-26, 0, -3], [3, 0, -26], [-14, 0, -21]]
    .flatMap(([x, y, z]) => [[x, y, z], [-x, y, -z]]),
};
