# 개발 로그 — Day 1~2 (8/3~8/4)

> 의사결정 흐름과 작업 과정을 시간순으로 기록

---

## Day 1 (8/3) — 기획부터 프로토타입까지

### 1. 프로젝트 셋업
- CLAUDE.md 생성 (해커톤 분석, 심사 포인트, 응답 가이드라인)
- docs 디렉토리 구조 설계 (모든 문서를 별도 파일로 관리)
- 의사결정은 ADR 형식으로 기록하기로 결정

### 2. 기술 스택 확정
- **프론트**: React + Vite + Three.js (R3F) + Zustand
- **백엔드**: FastAPI + WebSocket
- **물리**: 초기 없음 → 나중에 Rapier 도입
- **DB**: 사용 안 함 (메모리 + JSON)
- **STT**: Web Speech API (기본) + Whisper (향상)
- ADR 10건 작성 (STT, 형태소분석기, PTT, TTS, 미션구성, 술래AI, 상태관리, 렌더링, 배포)

### 3. Phase 1 — 서버 뼈대 + 금기어 판정
- FastAPI + WebSocket 핸들러 구현
- 금기어 판정 엔진 3단계 파이프라인 (정규식 → kiwipiepy → 자모 유사발음)
- 47개 테스트 전부 통과
- 터미널 수동 테스트 확인
- **트러블슈팅**: `--reload`가 .venv 감시 → `--reload-dir app` 옵션으로 해결

### 4. Phase 2 — 클라이언트 맵 + 캐릭터
- R3F Canvas 기본 씬 → 2.5D 쿼터뷰 직교 카메라
- **트러블슈팅**: OrthographicCamera가 씬을 못 잡음 → Canvas의 orthographic prop + onCreated에서 lookAt 호출
- 25x25 맵, 4구역 구조물 (프리미티브)
- 플레이어 캐릭터 (캡슐+구, WASD, 바운스)
- 카메라 추종, 시야 시스템 (PlayerLight)
- **트러블슈팅**: PlayerHandle export 에러 → `import { type PlayerHandle }` type-only import

### 5. Phase 3 — 게임 루프 연결
- Zustand 게임 스토어
- WebSocket 연결 hook
- Web Speech API Push-to-Talk (Space → 나중에 Q로 변경)
- 음성 → 서버 → 금기어 판정 → 빙결 이벤트 → HUD "얼음!" 알림
- 술래 FSM (PATROL → ALERT → CHASE)
- AI 동료 (플레이어 추종 → 빙결 시 구조)
- **마이크 에러**: `not-allowed` → localhost로 접속해야 Chrome이 허용

### 6. Phase 4 — 미션/온보딩/정산
- 온보딩 화면 (3개 질문, 음성/텍스트 입력)
- 금기어 채집 (kiwipiepy 명사 추출 → 프롭화 점수 → 상위 3개)
- 금기어 발표 화면 (팝업 애니메이션)
- 프롭 메타데이터 + 맵 슬롯 배치
- T1 미션 (E키 조사 → AI 판별 → 단서 획득)
- 최종 주문 (음성 퍼지 매칭)
- 정산 화면

### 7. 프로토타입 리뷰 — 근본적 문제 인식
- **맵이 너무 좁다** — 25x25에서 전부 보임
- **시야 제한이 약하다** — PointLight만으로 부족
- **술래가 멍청하다** — 웨이포인트 순찰봇
- **AI 동료가 그림자다** — 자율성 없음
- **온보딩이 재미없다** — 면접 질문
- **기획서를 제대로 안 읽었다** — 금기어 3분 교체, 최소 3캐릭터, 30초 사망 등 누락

### 8. CLAUDE.md 재작성
- "본선에서 할 것"이라는 접근 전면 삭제
- 기획서 팩트 정확히 반영
- 갭 분석 10개 항목 작성
- 사전과제 자체의 완성도가 평가 대상임을 명시

---

## Day 2 (8/4) — 3D 전환, 맵 확장, 에셋 도입

### 9. 맵 & 시야 리디자인 계획
- 시야 반경: 5m 확정
- 맵 크기: 50x50 확정
- 구조물 충돌: 있음 (Rapier)
- Phase A(시야) → B(맵확대) → C(지형물) → D(기믹) 순서 설계

### 10. 2.5D → 3D 전환 결정
- **결정 계기**: 맵을 직접 플레이해보니 2.5D에서 벽 뒤가 보여서 숨바꼭질이 안 됨
- 직교 카메라 → 원근 카메라 (perspective)
- ThirdPersonCamera (3인칭, 마우스 시점 회전, Pointer Lock)
- CCTV 모드(OrbitControls) + 3D 모드 듀얼 뷰 — Tab 전환
- **WASD 방향 문제**: 카메라 yaw 기반 수학 공식 → 실패 → camera.getWorldDirection으로 해결

### 11. Rapier 물리 도입
- `@react-three/rapier` 설치
- Player: kinematicPosition → dynamic 전환 (kinematic은 충돌 무시)
- 벽/구조물: fixed RigidBody
- **충돌 안 됨 문제**: Wall() 컴포넌트로 감싼 것만 충돌 → 모든 고체에 RigidBody 필요

### 12. 점프 추가 + PTT 키 변경
- Space → 점프 (JUMP_FORCE = 5)
- PTT: Space → Q로 변경
- E: 프롭 조사 유지

### 13. SchoolCampus.tsx 도입
- 외부 생성 맵 (80x80, 3층, 2521줄, 2119개 박스)
- 본관 3층 + 체육관 + 운동장 + 놀이터 + 후문 골목 + 정문
- visibleFloors로 층별 필터링
- **3D 모드 문제**: 건물 안에서 위층이 캐릭터를 가림 → 카메라 높이/각도 조정

### 14. CCTV 뷰어 강화
- 숫자키 1~4, 0으로 층 전환
- OrbitControls: pan/zoom/rotate 자유 이동
- 우측 상단 컨트롤 패널 (현재 모드, 층, 조작법)
- 개발 완료까지 유지 (주석으로 명시)

### 15. 에셋 도입 결정
- 프리미티브의 한계 인식 — "박스 게임"을 벗어날 수 없음
- Kenney CC0 에셋 선택 (Building Kit 80개 + Furniture Kit 138개 = 218개)
- AssetTest.tsx로 스타일 확인 → 승인
- **전략**: SchoolCampus 박스 = 충돌(Physics 안), Kenney GLB = 비주얼(Physics 밖)

### 16. WallOverlay — 벽 에셋 배치
- FillWall 함수: start~end 범위에 1m 간격으로 벽 GLB 반복 배치
- 외벽 창문, 칸막이, 출입구 gap 처리
- **출입구 막힘 문제**: GLB가 출입구를 막음 → SchoolCampus 벽 데이터 분석하여 gap 위치 정확히 파악
- WallOverlay 비활성화 → 진입 확인 → gap 반영 후 재활성화

### 17. Furnishings — 가구 에셋 배치
- 방 좌표 역산 (칸막이 벽 x좌표에서 경계 계산)
- 방 템플릿: Classroom, Office, Lobby, NurseRoom, Bathroom, Library, ComputerRoom, Cafeteria, Stairwell
- 복도: 사물함 + 천장등
- 외부: 벤치, 쓰레기통, 화분
- visibleFloors 연동

### 18. 학교 외관 색상 — 벽돌 학교
- 외벽: 적벽돌 (#9C6644)
- 체육관: 어두운 벽돌 (#8B5E3C)
- 복도 내벽: 크림 (#E8DCC8)
- 교실 칸막이: 베이지 (#D4C8B0)
- 후문 담장: 콘크리트 회색 (#7A7A7A)
- GLB material 색상 변경 구현 (scene.clone → traverse → material.color.set)

### 19. 가로등 조명
- SchoolCampus LAMPS 데이터 기반 14개 배치
- 3가지 톤: warm(운동장), amber(골목), cool(건물)
- PointLight 2개 (위쪽 강한 빛 + 바닥 반사광)

### 20. 창문 + 실내 조명
- **문제**: Kenney 창문 모델이 구멍만 뚫려있어 밤에 안 보임
- 창문 위치에 발광 패널(meshBasicMaterial, 반투명) 추가 → "불 켜진 교실" 느낌
- 각 방에 RoomLight (천장등 모델 + PointLight + 창문 밖 빛 새어나옴)
- 방별 다른 조명 톤 (교실=따뜻, 화장실=차가운, 도서실=부드러운)

### 21. 놀이터 에셋 검색
- Tiny Treats Fun Playground (32개+, CC0, GLTF) — GitHub에 없음 (itch.io만)
- Tiny Treats Pretty Park — GitHub에서 clone 성공
- 나무, 벤치, 분수, 울타리, 꽃 등 확보
- Fun Playground는 itch.io에서 수동 다운로드 필요

---

## 현재 상태 (Day 2 끝)

### 동작하는 것
- 3D 3인칭 게임 시점 (마우스 시점 회전, WASD 카메라 기준 이동, 점프)
- CCTV 디버그 뷰 (층별 전환, 자유 이동)
- 80x80 3층 학교 맵 (SchoolCampus 충돌 + Kenney 벽/가구 비주얼)
- 적벽돌 학교 외관 + 교실 내부 가구 + 조명
- 온보딩 → 금기어 채집 → 발표 → 미션 → 주문 → 정산 전체 플로우
- 음성 입력 (Q PTT) → 금기어 판정 → 빙결 → 술래 추격 → AI 동료 구조

### 남은 핵심 작업
- 놀이터/운동장/후문 에셋 배치
- 시야 제한 (Fog 재적용)
- 술래 AI 강화 (음성 반응)
- AI 동료 자율성
- 금기어 3분 교체
- 사운드
- 시연 영상 + 제출 문서

### 핵심 교훈
1. **기획서를 먼저 정확히 읽어라** — 추측으로 구현하면 나중에 전부 고쳐야 한다
2. **직접 플레이해봐야 안다** — 2.5D→3D 전환은 직접 걸어다녀봐서 발견한 문제
3. **"본선에서 할 것"은 없다** — 사전과제 안에서 완성해야 한다
4. **프리미티브에는 한계가 있다** — 일찍 에셋을 도입할수록 좋다
5. **충돌은 처음부터 넣어라** — 나중에 넣으면 좌표 전부 재작업

---

## Day 3 (8/4 오후) — 에셋 정리, 캐릭터 적용, 렌더링 최적화

### 22. 에셋 정리
- **문제**: `public/assets/`에 Kenney 원본 킷 3개(building/city/furniture) + ZIP 4개 = ~44MB가 git에 노출
- **결정**: 사용 중인 GLB 48개만 `public/models/`에 유지, 나머지 `_assets-archive/`로 이동
- 미사용 GLB 170개 + 원본 킷 + ZIP → `_assets-archive/{kenney-kits, kenney-zips, unused-models}/`
- `.gitignore`에 `_assets-archive/` 추가
- **결과**: git 추적 대상 에셋 218개 → 48개 (78% 감소)

### 23. 2.5D vs 3D 전환 분석
- 기획서는 "2.5D 쿼터뷰" 명시. 실제로는 3D 3인칭으로 전환된 상태
- **전환 이유 재확인**: 숨바꼭질에서 "벽 뒤가 보이면 안 된다". 2.5D에서는 구조적으로 불가능
- 3D에서 얻은 것: 시야 차단, 코너 긴장, 수직 동선 의미
- **결정**: 3D 유지. 기획서는 최종 때 업데이트 (사고 과정은 3d-transition.md에 이미 기록)

### 24. Characters.tsx 적용 — 프리미티브 → 어몽어스형 콩
- 외부 제작된 캐릭터 세트(6종) 도입. 프리미티브 조합(캡슐+구+눈)에서 개성 있는 캐릭터로 교체
- **캐릭터 배정**:
  - 플레이어: R01 "캡" (오렌지, 야구모자, 운동화)
  - AI 동료: R05 "헤드셋" (연두, 헤드셋+마이크, 작업화)
  - 술래: R00 "술래" (빨강, 돔 헬멧+안테나, 부츠)
- **적용 방식**: 기존 Player/Partner/Seeker의 물리+AI 로직은 유지, 비주얼만 `CharacterModel`로 교체
- **추가 기능**: 빙결 시 얼음 결정 껍질, 술래 위장(정지 3초 후 투명화), 등 번호 배지
- **콜라이더 규격 통일**: Characters.tsx의 COLLIDER (캡슐 r0.4, halfHeight 0.35)로 맞춤
- `App.tsx`에서 `assignCharacters(seed, 3)`으로 결정적 배정

### 25. 렌더링 성능 위기 — 캐릭터 적용 후 노트북 프레임 드랍
- **증상**: 캐릭터 적용 후 극심한 프레임 드랍
- **첫 반응**: "캐릭터 72 draw call이 원인?" → 아님
- **진짜 범인 발견**: 기존 SchoolCampus가 이미 draw call 3,449개 + physics body 2,115개. 캐릭터가 임계점을 넘긴 것
- 상세 병목 분석 (docs/rendering-optimization.md에 기록)

### 26. 렌더링 최적화 1차 — SchoolCampus InstancedMesh
- **BOXES 2,001개**: 개별 mesh+RigidBody → 색상별 InstancedMesh (157 draw calls) + 1 compound RigidBody
  - 단위 박스(1,1,1)에 position+scale+rotation을 instance matrix로 인코딩
  - 같은 색 박스를 하나의 InstancedMesh로 묶어 1 draw call
- **CYLS 114개**: 개별 RigidBody → 1 compound RigidBody (mesh는 유지, 수가 적어 배칭 불필요)
- **VISUALS box 1,166개**: 개별 mesh → 색상별 InstancedMesh
- **VISUALS 비-box (168개)**: sphere/plate/ring/cyl 세그먼트 축소 (sphere 10×8→8×6, ring 64→32)

### 27. 렌더링 최적화 2차 — Characters 세그먼트 축소
- sphere: 26×18 → 12×8
- capsule: 8×18 → 4×10
- torus: 12×30 → 8×16
- cylinder: 18 → 10, cone: 14 → 8, circle: 34 → 16, ring: 44 → 20
- **vertex count ~60% 감소**, 로우폴리 스타일에서 시각적 차이 거의 없음

### 28. 렌더링 최적화 3차 — WallOverlay/Furnishings 비활성화
- **숨은 범인 발견**: FillWall 75회 호출 × W(scene.clone) = 400~700개 GLB clone
- Furnishings의 M 컴포넌트도 79회 scene.clone() + RoomLight 8개 × PointLight 2개 = PointLight 16개
- 전체 PointLight: SchoolCampus 15 + Furnishings 16 = **31개** (three.js 권장 한도 초과)
- **결정**: WallOverlay/Furnishings를 통째로 비활성화 (SchoolCampus 박스가 충돌+시각 모두 담당)
- GLB InstancedMesh 교체는 후속 작업으로 분리
- **결과**: draw call ~3,800+ → ~350, physics bodies 2,115 → 3, PointLight 31 → 15

### 핵심 교훈 (추가)
6. **성능 문제의 원인은 마지막에 추가한 것이 아닐 수 있다** — 캐릭터가 범인이 아니라, 기존 맵이 이미 한계였다
7. **InstancedMesh는 Three.js 필수 최적화** — 같은 지오메트리+머티리얼이면 반드시 배칭
8. **PointLight 개수를 통제하라** — 5~10개 넘으면 shader recompile + fragment 비용 폭증
9. **GLB scene.clone()은 비싸다** — 같은 모델이면 InstancedMesh 또는 재사용 구조로
