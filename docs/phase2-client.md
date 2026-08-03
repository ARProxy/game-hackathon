# Phase 2: 클라이언트 R3F 맵 + 캐릭터

> 작성일: 2026-08-03
> 상태: 2-1 ~ 2-8 완료, 2-9/2-10은 Phase 3에서 통합 진행

---

## 완료된 단계

### 2-1. R3F 기본 씬
- Vite 보일러플레이트 제거
- `<Canvas>`에 테스트 큐브 + 바닥면 렌더링 확인
- R3F, Three.js, drei, Zustand 정상 동작 확인

### 2-2. 2.5D 쿼터뷰 직교 카메라
- OrthographicCamera 적용 (원근감 없는 균일 시점)
- position [20, 20, 20]에서 원점을 바라보는 쿼터뷰
- `camera.lookAt(0,0,0)` 명시적 호출로 시점 고정

### 2-3. 맵 바닥 + 구역 경계
- 25x25 맵을 4개 구역(12x12)으로 분할
- 구역별 바닥 색 차이로 시각적 구분
- 십자 경계선 + 외곽 벽 4면

### 2-4. 플레이어 캐릭터
- 캡슐(몸통) + 구(머리) + 구x2(눈) 조합
- 시안색 (#52E5FF)
- idle 바운스 애니메이션

### 2-5. WASD 키보드 이동
- `useKeyboard` hook — keydown/keyup으로 현재 눌린 키 추적
- WASD + 방향키 지원, 대각선 이동 정규화
- 이동 방향으로 캐릭터 회전 (lerp로 부드럽게)
- 이동 중 바운스 강해짐 (speed 8, amount 0.12)
- 맵 경계 클램프 (-12.5 ~ 12.5)

### 2-6. 카메라 플레이어 추종
- `CameraFollow` 컴포넌트 — useFrame에서 매 프레임 카메라 위치 갱신
- 쿼터뷰 오프셋(20,20,20) 유지하면서 lerp로 부드러운 추종
- Player를 forwardRef + useImperativeHandle로 groupRef 외부 노출

### 2-7. 구역별 구조물
- A구역(놀이기구): 미끄럼틀, 정글짐, 그네
- B구역(창고): 컨테이너, 적재물 상자, 통로 벽
- C구역(중앙): 조회대, 축구 골대
- D구역(골목출구): 벤치 2개, 가로등(PointLight), 화단
- 전부 프리미티브(Box, Cylinder, Cone) 조합, 커스텀 모델링 없음

### 2-8. 시야 시스템
- 전역 조명을 극도로 낮춤 (ambient 0.08, directional 0.15)
- PlayerLight — PointLight가 플레이어를 따라다님 (intensity 5, distance 12)
- 플레이어 주변만 밝고 바깥은 어둠 → "밤의 운동장" 분위기

---

## 미완료 (Phase 3에서 통합 진행)

- 2-9. Zustand 상태 관리
- 2-10. WebSocket 서버 연결

이 둘은 음성 입력 → 금기어 판정 → 빙결 이벤트의 클라이언트 처리와 함께 붙이는 게 효율적이므로 Phase 3에서 진행한다.

---

## 파일 구조

```
client/src/
├── App.tsx                 # Scene 구성 (카메라, 조명, 컴포넌트 조합)
├── App.css                 # 전체 화면 리셋
├── game/
│   ├── Map.tsx             # 4구역 바닥 + 경계선 + 외곽 벽
│   ├── Structures.tsx      # 구역별 구조물 (프리미티브)
│   ├── Player.tsx          # 플레이어 캐릭터 + WASD 이동
│   ├── PlayerLight.tsx     # 플레이어 추종 시야 조명
│   └── CameraFollow.tsx    # 카메라 플레이어 추종
└── hooks/
    └── useKeyboard.ts      # 키보드 입력 상태 추적
```

---

## 트러블슈팅 기록

### OrthographicCamera가 씬을 못 잡는 문제
- `<OrthographicCamera makeDefault>`로 선언하면 lookAt이 안 먹음
- 해결: Canvas의 `orthographic` prop + `camera` prop으로 직접 설정 + `onCreated`에서 `lookAt` 호출
- 최종적으로 OrbitControls로 디버깅 후 CameraFollow로 교체

### Vite HMR이 변경 반영 안 되는 문제
- `--reload`와 유사하게 HMR 캐시가 꼬일 수 있음
- 해결: Vite 서버 재시작 (Ctrl+C → npm run dev)

### `--reload`가 `.venv` 감시하는 문제 (서버)
- `uvicorn --reload`이 `.venv` 내부 파일 변경에 반응하여 무한 재시작
- 해결: `--reload-dir app` 옵션 추가

### PlayerHandle export 에러
- `export interface`를 named import하면 Vite에서 에러
- 해결: `import { type PlayerHandle }` — type-only import
