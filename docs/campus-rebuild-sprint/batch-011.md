# Batch 011 — 2시간 종료 감사와 잔여 위험

## 종료 상태

- 최신 맵 커밋: `c977643`.
- `npm run verify:campus` 통과: solids 2,283, visuals 5,693, rooms 80, doors 127.
- seed 0~199의 필수 anchor·suite·damage quota 계약 통과.
- `npm run build` 통과. Rapier 엔진 청크 크기 경고만 남는다.
- 새로 확인된 충돌·진입 불가·재질 alias P0는 없다.

## 최종 교차 검토

레이아웃 검토는 일반교실 10실이 다섯 layout의 복제쌍으로 남고, 창고·준비실 5실이 같은 service 선반 분기를 공유하는 점을 다음 다양화 우선순위로 판정했다. 이는 방의 기능·동선 계약을 깨지는 않지만, 교실마다 다른 서명을 요구하는 다음 시각 품질 작업이다.

적대 QA는 기존 `gate_gym` 매몰, 정문 blocker 우회, 외부 재질 alias가 수정된 것을 확인했다. 다만 후문 정적 leaf의 open-state 시각 일치, gate capsule sweep, StrictMode/HMR 전체 remount에서의 Rapier soak는 자동 계약 밖에 있어 실제 브라우저 장시간 검증이 필요하다.

## 다음 우선순위

1. 일반교실 복제쌍마다 교사 시야축·책장벽·프로젝트 구역·창가 활동영역 중 하나를 고유 landmark로 만든다.
2. pantry·janitor·print·musicprep·sciprep를 식품 저장·청소 설비·복합기 작업대·악보/악기·과학 준비대 문법으로 각각 분리한다.
3. 후문 leaf를 런타임 gate 상태와 단일 source로 연결하고 capsule sweep 회귀 검사를 추가한다.
4. 브라우저에서 StrictMode/HMR·Canvas 오류 복구를 반복하는 Rapier soak를 수행한다.
5. 저채도 원경 건물과 수목 belt를 visual-only 예산으로 추가한다.
