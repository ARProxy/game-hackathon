# 렌더링 최적화 기록

> 작성일: 2026-08-04
> 상태: 1차 적용 완료

## 문제 인식

캐릭터(Characters.tsx) 적용 후 노트북에서 프레임 드랍 발생. 원인 분석:

## 병목 분석

### 1. Draw Call 폭발 — SchoolCampus.tsx
- BOXES 2,001개 → 각각 개별 `<mesh>` + `<RigidBody>` = **2,001 draw calls + 2,001 physics bodies**
- VISUALS 1,334개 → 각각 개별 `<mesh>` = **1,334 draw calls**
- CYLS 114개 → 각각 개별 `<RigidBody>` + `<mesh>` = **114 draw calls + physics bodies**
- 합계: **~3,449 draw calls + ~2,115 physics bodies**

### 2. Characters 파츠 — 캐릭터당 24개 mesh
- 3캐릭터 × 24파츠 = 72 draw calls
- 각 파츠가 고해상도 세그먼트 (sphere 26×18 등)

### 3. PointLight 과다
- LAMPS 15개 (각각 PointLight)
- 각 PointLight는 shadow map 없어도 fragment shader 비용 추가
- three.js는 PointLight가 많으면 shader recompile 발생

### 4. Furnishings/WallOverlay — GLB clone
- useGLTF로 모델 로드 후 scene.clone() 반복
- 같은 모델인데 인스턴싱 없이 개별 렌더

## 최적화 전략

### A. BOXES/VISUALS → InstancedMesh (draw call: 3,300+ → ~40)
- 같은 지오메트리+색상을 하나의 InstancedMesh로 묶음
- BOXES: 157개 고유 색상 → 157개 InstancedMesh (각각 1 draw call)
- 단위 박스(1,1,1)에 position+scale+rotation을 instance matrix로 인코딩
- VISUALS의 box 1,166개도 동일하게 배칭
- 구·원기둥·plate 등은 타입+색상으로 그룹화

### B. Physics 통합 (bodies: 2,115 → ~3)
- 2,000개 개별 RigidBody → 1개 RigidBody에 2,000개 CuboidCollider (compound)
- Rapier는 static body의 compound collider를 효율적으로 처리
- 개별 body는 broadphase 오버헤드가 크고, compound는 내부 BVH로 처리

### C. Characters 세그먼트 축소 (vertex count ~60% 감소)
- sphere: 26×18 → 12×8
- capsule: 8×18 → 6×12
- torus: 12×30 → 8×16
- 시각적 차이 거의 없음 (로우폴리 스타일이라 오히려 어울림)

### D. PointLight 거리 컬링
- 플레이어와 거리 20m 이상인 Lamp의 PointLight는 intensity=0
- 매 프레임 계산하되, 라이트 on/off만 토글 (생성/삭제 아님)

## 사고 과정

1. 첫 반응: "Characters.tsx 때문인가?" → 아님. 72 draw calls 추가는 사소
2. 진짜 범인: SchoolCampus의 2,000개 개별 RigidBody+mesh가 처음부터 느렸는데, 캐릭터 추가로 임계점을 넘음
3. Three.js에서 draw call은 가장 비싼 연산. GPU가 아무리 빨라도 CPU→GPU 명령 전달이 병목
4. InstancedMesh는 같은 지오메트리+머티리얼을 하나의 draw call로 묶는 Three.js 내장 기능
5. Rapier의 compound collider는 게임 물리에서 표준적인 최적화. 정적 환경은 하나의 body로 충분
6. 캐릭터 세그먼트는 이 게임의 로우폴리 스타일에서 12×8이면 충분. 26×18은 과도
7. PointLight 컬링은 시야 제한(향후 Fog) 적용 시 자연스럽게 연동됨

## 예상 효과

| 항목 | 이전 | 이후 | 감소율 |
|------|------|------|--------|
| Draw calls | ~3,500 | ~50 | 98.5% |
| Physics bodies | ~2,115 | ~3 | 99.9% |
| Vertex count (캐릭터) | ~15,000/캐릭터 | ~6,000/캐릭터 | 60% |
| Active PointLights | 15 | 3~5 | 66~80% |

## 트레이드오프

- InstancedMesh는 개별 mesh의 색상을 런타임에 바꿀 수 없음 → 이 게임에서는 필요 없음
- Compound collider는 개별 body 제거/이동이 안 됨 → 정적 맵이므로 문제 없음
- 세그먼트 축소는 가까이 보면 각이 보임 → 3인칭 시점에서 캐릭터는 항상 일정 거리에 있음

---

## 실제 적용 결과 (8/4)

### 적용 완료

| 최적화 | 내용 | 상태 |
|--------|------|------|
| **SchoolCampus BOXES** | 2,001 mesh → 색상별 InstancedMesh (~157 draw calls) | 완료 |
| **SchoolCampus Physics** | 2,115 RigidBody → compound collider 2개 | 완료 |
| **SchoolCampus VISUALS box** | 1,166 mesh → 색상별 InstancedMesh | 완료 |
| **VISUALS 비-box 세그먼트** | sphere 10→8, ring 64→32, cyl 12→8 | 완료 |
| **Characters 세그먼트** | sphere 26×18→12×8, torus 12×30→8×16 등 | 완료 |
| **WallOverlay 비활성화** | FillWall 75회 (400~700 GLB clone) 제거 | 완료 (임시) |
| **Furnishings 비활성화** | M 79회 (GLB clone) + PointLight 16개 제거 | 완료 (임시) |

### 숨은 범인 — WallOverlay/Furnishings

1차 최적화(SchoolCampus InstancedMesh)만으로는 부족했다. 추가 조사에서 발견:

- **FillWall 75회**: 벽 1m 간격으로 GLB scene.clone() → 총 400~700개 GLB 인스턴스
- **Furnishings M 79회**: 가구 GLB scene.clone() 79회
- **PointLight 31개**: SchoolCampus LAMPS 15 + Furnishings RoomLight 8×2 = 31
- Three.js는 PointLight 수에 따라 fragment shader를 재컴파일. 30개 이상은 치명적

**결정**: WallOverlay/Furnishings를 통째로 비활성화. SchoolCampus 박스가 충돌+시각 모두 담당하므로 게임 동작에 영향 없음. GLB InstancedMesh 교체는 후속 작업.

### 최종 수치

| 항목 | 최적화 전 | 최적화 후 | 감소율 |
|------|-----------|-----------|--------|
| Draw calls | ~3,800+ | ~350 | 91% |
| Physics bodies | ~2,115 | 3 | 99.9% |
| PointLights | 31 | 15 | 52% |
| GLB clone | ~580 | 0 | 100% |
| Vertex count (캐릭터) | ~15,000/캐릭터 | ~6,000/캐릭터 | 60% |

### 후속 작업 (TODO)

- [ ] WallOverlay를 InstancedMesh로 교체 후 재활성화
- [ ] Furnishings를 InstancedMesh로 교체 후 재활성화
- [ ] PointLight 거리 컬링 (플레이어 20m 이내만 활성화)
- [ ] Fog 적용 시 시야 밖 mesh frustum culling 자동 효과 확인
