# 온보딩 흰 화면 수정 사고 흐름

## 증상

솔로 캐릭터를 확정하면 시작 화면이 사라지고 온보딩 대신 흰 화면이 나타난다. 브라우저 콘솔의 치명 오류는 `react-three-rapier: useRapier must be used within <Physics />`이며 호출 위치는 `ThirdPersonCamera`다.

## 원인 판정

`GameController`와 온보딩 UI는 정상적으로 마운트된다. WebSocket의 초기 연결 종료 메시지도 이후 연결 성공으로 복구되므로 흰 화면의 원인이 아니다. 캐릭터 확정과 동시에 Canvas가 생성되고, `ThirdPersonCamera`가 `<Physics>` 형제 위치에서 `useRapier()`를 호출하면서 Canvas 렌더 트리가 중단된다.

카메라 벽 관통 방지 기능이 Rapier ray cast를 사용하도록 바뀌었지만, 카메라 컴포넌트의 배치가 기존 위치에 남아 컨텍스트 계약이 깨진 것이 직접 원인이다.

## 수정 계약

- `ThirdPersonCamera`를 `<Physics>` 내부로 옮긴다.
- 카메라는 기존처럼 플레이어 ref와 모드를 사용하며, 물리 월드와 같은 컨텍스트에서 ray cast한다.
- `ThreatFeedback`은 Rapier를 사용하지 않으므로 기존 위치를 유지한다.
- WebSocket의 연결 경합 경고와 Three.js deprecated 경고는 이번 흰 화면의 직접 원인이 아니므로 별도 후속으로 다룬다.

## 성공 기준

캐릭터 확정 뒤 Canvas가 중단되지 않고 온보딩 질문이 표시되어야 한다. 클라이언트 production build와 lint가 통과해야 한다.
