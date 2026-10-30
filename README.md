# project_fps

브라우저 3D 멀티플레이 히어로 FPS (Three.js + Node.js WebSocket)

## 실행
```
npm install
npm start
```
- 브라우저에서 http://localhost:3000 접속
- 같은 와이파이 친구는 `http://<내 PC IP>:3000` (방화벽에서 3000 포트 허용 필요)

## 구조
| 경로 | 역할 |
|---|---|
| `shared/characters.js` | 캐릭터 정의 (체력·속도·무기·스킬 1개씩) |
| `shared/map.js` | 초원 맵 — 충돌 박스(+Kenney 소품 이름)·나무·스폰. 180° 회전 대칭 |
| `shared/physics.js` | 이동 충돌, 레이캐스트, 히트박스 (클라·서버 공용) |
| `server/server.js` | 정적 파일 서버 + 게임 서버 (히트 판정, 피해, 킬, 부활, 스킬 쿨다운) |
| `client/main.js` | 입력, 이동, 사격, 스킬, 네트워크 처리, 게임 루프 |
| `client/assets.js` | GLB 로딩, 캐릭터 3인 분리·보정, 소품을 충돌 박스에 맞춰 배치, 썸네일 |
| `client/world.js` | 씬·맵 렌더링, 다른 플레이어(걷기 바운스), 총알 궤적, 1인칭 총 |
| `client/models/` | 캐릭터 GLB (CC BY-NC 4.0), Kenney Nature Kit (CC0) |
| `client/hud.js` | HUD, 킬피드, 점수판, 캐릭터 선택 화면 |

## 조작
WASD 이동 · Space 점프 · Shift 걷기 · 좌클릭 사격 · R 재장전 · E 스킬 · Tab 점수판

## 캐릭터 추가 방법
1. `shared/characters.js`에 항목 추가 (`model`은 GLB 안의 노드 이름)
2. 새로운 스킬 `type`이면 처리 코드 추가
   - 이동형 스킬 → `client/main.js`의 `useAbility()`
   - 상태형 스킬 (회복, 버프 등) → `server/server.js`의 `handleAbility()`

## 맵 수정 방법
- `shared/map.js`의 박스 하나 = 서버 충돌 범위 = 화면에 보이는 소품 크기 (`prop` 모델을 박스에 맞춰 늘림)
- 수정 후 클라이언트와 서버 모두 같은 파일을 쓰므로 판정이 자동으로 일치
- 풀·꽃·버섯·작은 덤불은 장식(충돌 없음, 총알 통과)

## 크레디트 / 라이선스
자세한 내용은 [CREDITS.md](CREDITS.md) 참고 (게임 메뉴의 "크레디트 · 라이선스"에도 표시).
- 캐릭터 모델: "chiikawa and friends" by Nini — CC BY-NC 4.0 (**비상업적 이용만 가능**)
- 맵 소품: Kenney Nature Kit — CC0

마우스 고정이 지원되지 않는 환경에서는 **마우스 고정 없이 플레이**를 선택하세요. 우클릭 드래그로 시점을 돌리고, 좌클릭으로 사격합니다. Esc로 조작을 멈춥니다.
