# Batch 003 — Rapier 문 갱신 안정화

## 문제

문 122개가 닫혀 있고 움직이지 않아도 매 프레임 `setNextKinematicRotation()`을 호출했다. 개발 모드 StrictMode/HMR에서 많은 rigid body가 생성·제거되는 상황과 겹치면 Rapier WASM borrow 압력을 키울 수 있었다.

## 변경

- 층 시각 필터와 무관하게 문 actor/collider의 안정된 ID와 mount를 유지한다.
- 사용자가 목표 상태를 바꾼 문만 `activeDoorIds`에 넣는다.
- 활성 문만 감쇠 회전을 쓰고 목표에 도달하면 즉시 활성 집합에서 제거한다.
- 평상시 Rapier 문 회전 쓰기는 프레임당 0회다.

## 검증

- TypeScript와 Vite production build 통과.
- 학교 구조·서버 충돌·슬롯 자동 계약 통과.
- 남은 수동 검증: StrictMode 진입/이탈, HMR, 문 반복 토글에서 alias/free 오류와 body/collider count 누수를 브라우저로 계측한다.
