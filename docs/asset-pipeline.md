# 에셋 파이프라인 — 생각의 흐름

> 작성일: 2026-08-04
> 상태: 진행 중

---

## 1. 프리미티브의 한계 인식

### 출발점
- Phase 2에서 Three.js 기본 도형(Box, Cylinder, Sphere)으로 맵과 구조물 구현
- 25x25 맵, 4구역(놀이기구/창고/중앙/골목), 프리미티브 조합

### 문제
- 아무리 많이 쌓아도 "박스 게임"을 벗어나지 못함
- 구역 간 시각 정체성이 약함 — 색 차이만으로는 어느 구역인지 모름
- 술래잡기에 필요한 밀도(시야 차단, 숨을 곳, 갈림길)가 부족
- 시연 영상에서 임팩트 없음

---

## 2. 2.5D → 3D 전환

### 결정 계기
- 2.5D 쿼터뷰로 맵을 플레이해보니 근본적 문제 발견
- 위에서 내려다보면 벽 뒤가 보임 → 숨바꼭질이 성립하지 않음
- Fog를 넣어도 벽이 시야를 가리지 않음 (거리 기반 vs 장애물 기반)

### 전환
- 직교 카메라 → 원근 카메라 (perspective)
- CameraFollow → ThirdPersonCamera (3인칭, 마우스 시점 회전, Pointer Lock)
- WASD 이동을 카메라 방향 기준으로 보정 (camera.getWorldDirection)
- CCTV 모드(OrbitControls)와 3D 모드(ThirdPersonCamera) 듀얼 뷰 — Tab 전환

### 문제
- 3D로 바꾸니 프리미티브의 빈약함이 더 두드러짐
- 건물 안에서 위층이 캐릭터를 가림 → 카메라 높이/각도 조정 필요
- 충돌이 없어서 벽을 통과함 → Rapier 물리 도입

---

## 3. Rapier 물리 도입

### 충돌 구현
- `@react-three/rapier` 설치
- Player: dynamic RigidBody + CapsuleCollider, velocity로 이동
- 벽/구조물: fixed RigidBody
- kinematicPosition → dynamic 전환 (kinematic은 충돌 무시하므로)

### 점프 추가
- Space → 점프 (JUMP_FORCE = 5)
- PTT를 Space → Q로 변경
- 바닥 판정: y 속도가 threshold 이내면 grounded

---

## 4. SchoolCampus.tsx 도입

### 배경
- 직접 만든 50x50 프리미티브 맵의 한계
- 외부에서 생성한 SchoolCampus.tsx (80x80, 3층, 2521줄, 2119개 박스)
- 본관 3층 + 체육관 + 운동장 + 놀이터 + 후문 골목 + 정문

### 적용
- Map.tsx + Structures.tsx를 SchoolCampus로 교체
- 트랩, 게이트, 프롭 슬롯, 순찰 웨이포인트 등 게임 시스템 데이터 포함
- visibleFloors prop으로 층별 필터링 가능

### CCTV 뷰어 강화
- 숫자키 1~4, 0으로 층 전환
- OrbitControls: pan/zoom/rotate 자유 이동
- 우측 상단에 현재 모드/층/조작법 패널

---

## 5. Kenney 에셋 도입 결정

### 문제 인식
- SchoolCampus의 벽이 전부 어두운 단색 박스 (#1c242e)
- 건물 외관이 검정 덩어리 — "학교"로 안 보임
- 가구도 박스 — 교실인지 화장실인지 구분 안 됨

### 선택지 검토

| 방식 | 퀄리티 | 시간 |
|------|--------|------|
| 무료 로우폴리 에셋 팩 (Kenney 등) | 중상 | 빠름 |
| AI 3D 생성 (Meshy, Tripo) | 중 | 중간 |
| Blender 직접 모델링 | 상 | 비현실적 |
| 프리미티브 고도화 | 하 | 느림 |

### 결정: Kenney CC0 에셋
- Building Kit: 벽, 바닥, 문, 창문, 계단, 기둥 (80개)
- Furniture Kit: 책상, 의자, 책장, 침대, 소파, 가전 (138개)
- 둘 다 CC0 라이선스, GLTF/GLB 포맷, R3F에서 useGLTF로 즉시 로드
- 총 218개 에셋 확보

### 스타일 테스트
- AssetTest.tsx로 교실/복도/화장실 세트 미리보기
- 로우폴리 플랫 셰이딩 스타일이 기존 색상 시스템과 어울림
- 밤 조명에서도 형태가 잘 구분됨

---

## 6. 에셋 적용 전략 — 하이브리드

### 왜 하이브리드인가
- SchoolCampus.tsx의 2119개 박스를 전부 GLB로 교체하는 건 비현실적
- 박스는 콜라이더로 유지 (물리 담당)
- GLB는 비주얼 오버레이 (보이는 것 담당)

### 구현 구조
```
SchoolCampus.tsx — 벽/바닥 박스 (콜라이더) — Physics 안
WallOverlay.tsx  — Kenney 벽 GLB (비주얼)  — Physics 밖
Furnishings.tsx  — Kenney 가구 GLB (비주얼) — Physics 밖
```

### WallOverlay — 벽 GLB 배치
- SchoolCampus의 벽 좌표를 분석하여 같은 위치에 GLB 반복 배치
- FillWall 함수: start~end 범위에 1m 간격으로 벽 유닛 배치
- 외벽: 3칸마다 창문 (wall-window-square.glb)
- 칸막이: 일반 벽 (wall.glb)
- 출입구 gap: 벽을 배치하지 않음 (현관 x=-11.5~-8, 별관 x=-27~-23)
- 코너: wall-corner.glb
- 1F에만 외부 출입구 gap, 2F/3F는 연속 벽

### 출입구 문제 발생 및 해결
- WallOverlay GLB가 출입구를 막아서 플레이어가 진입 불가
- 원인: 복도 남벽 전체에 GLB를 깔아서 gap이 없었음
- SchoolCampus 벽 데이터를 분석하여 정확한 gap 위치 파악
- 1F gap 2개 (별관, 현관)를 피해서 구간별 배치로 수정

### Furnishings — 가구 GLB 배치
- 방 좌표 정확히 파악 (칸막이 벽 x좌표에서 경계 계산)
- 방 템플릿 컴포넌트: Classroom, Office, Lobby, NurseRoom, Bathroom, Library, ComputerRoom, Cafeteria
- 계단실: Kenney stairs-center.glb 배치
- 복도: 사물함 + 천장등 반복
- 외부: 벤치, 쓰레기통, 화분, 박스
- visibleFloors 연동 — 층별 필터링

---

## 7. 가로등 조명

### SchoolCampus LAMPS 데이터
- 14개 가로등, 3가지 톤
- warm (#ffe9c4): 운동장, 놀이터
- amber (#ffd9a0): 골목, 정문
- cool (#cfe3ff): 건물 입구

### 구현
- 프리미티브 기둥 + 전등 갓 + 발광 구
- PointLight 2개: 위쪽(강한 빛, 넓은 범위) + 바닥(약한 반사광)
- distance = 가로등 높이 x 2.5 (빛 분산)
- decay = 2 (자연스러운 감쇠)

---

## 8. 현재 상태와 남은 작업

### 완료
- [x] Kenney Building Kit + Furniture Kit 218개 에셋 확보
- [x] WallOverlay — 본관 벽 3층 (외벽 창문, 칸막이, 출입구 gap)
- [x] Furnishings — 교실/행정실/로비/보건실/화장실/급식실/도서실/컴퓨터실/계단실
- [x] 가로등 14개 (톤별 조명 분산)
- [x] CCTV 뷰어 (층별 전환, 자유 이동)

### 남은 에셋 작업
- [ ] 체육관 내부 가구
- [ ] 놀이터 구조물 (미끄럼틀, 그네, 정글짐 — Tiny Treats Playground 팩 검토)
- [ ] 후문 골목 소품
- [ ] 정문/주차장 소품
- [ ] 옥상 구조물
- [ ] 바닥 타일 (교실/복도/운동장 구분)
- [ ] 윙 건물 벽 (급식실/도서실/미술실 구역)

### 남은 시스템 작업
- [ ] SchoolCampus 박스 벽 색상 조정 (GLB와 겹치는 부분 숨기기)
- [ ] 3D 모드 시야 제한 (Fog 재적용)
- [ ] 술래/AI동료를 새 맵 좌표에 맞춰 업데이트

---

## 원칙

- **SchoolCampus 박스 = 충돌**, **GLB = 비주얼** 분리 유지
- GLB는 Physics 밖에 배치 (충돌 중복 방지)
- 에셋 라이선스: 전부 CC0 (Kenney), 자산 대장에 기록
- 방 좌표는 SchoolCampus 벽 데이터에서 역산 — 추측하지 않음
