// 캐릭터 정의 — 클라이언트와 서버가 함께 사용한다.
// 각 캐릭터는 고유 무기 1개 + 고유 스킬 1개를 가진다.
// model: client/models/chiikawa_and_friends.glb 안의 노드 이름
// 새 캐릭터를 추가하려면 여기에 항목을 넣고, 새 스킬 type이면 서버/클라이언트의 스킬 처리에 분기를 추가한다.
export const CHARACTERS = {
  chiikawa: {
    name: '치이카와',
    role: '밸런스',
    model: 'Chiikawa',
    color: '#ff9fb8',
    hp: 120,
    speed: 6,
    weapon: { name: '풀베기 카빈', damage: 30, fireRate: 4, mag: 12, reload: 1.9, spread: 0.006, range: 150, auto: false },
    ability: { type: 'heal', name: '용기 충전', cooldown: 12, amount: 50, desc: '체력 50 즉시 회복' },
  },
  hachiware: {
    name: '하치와레',
    role: '돌격',
    model: 'Hachiware',
    color: '#6fb4ff',
    hp: 100,
    speed: 6.5,
    weapon: { name: '노래 라이플', damage: 18, fireRate: 10, mag: 30, reload: 1.8, spread: 0.012, range: 150, auto: true },
    ability: { type: 'dash', name: '대시', cooldown: 6, desc: '이동 방향으로 순간 돌진' },
  },
  usagi: {
    name: '우사기',
    role: '기동',
    model: 'Usagi',
    color: '#ffcf5c',
    hp: 90,
    speed: 7.2,
    weapon: { name: '우라 SMG', damage: 13, fireRate: 14, mag: 35, reload: 1.5, spread: 0.022, range: 80, auto: true },
    ability: { type: 'leap', name: '우라!', cooldown: 7, power: 13, desc: '높이 뛰어올라 고지대 점령' },
  },
};

export const DEFAULT_CHARACTER = 'chiikawa';
export const HEADSHOT_MULTIPLIER = 1.5; // 머리가 몸의 절반이라 배율을 낮게 잡음
