# Batch 010 — 외부 재료·입면·출입구 P0 통합

## 문제

OUT 983개 primitive 중 690개가 즉석 HEX를 사용해 metal·concrete·fabric 역할까지 모두 기본 paint로 렌더링됐다. 외벽의 어두운 base도 F1·F2·F3마다 반복되어 하나의 건물보다 층별로 쌓인 다른 상자처럼 보였다. 정문과 중앙 현관은 같은 학교라는 공통 identity가 없었다.

## 변경

- 외부 전용 13개 PAL token과 PBR family mapping을 추가했다.
- `makeRoof`, 외부계단, 중정, 운동장, 정문·담장·후문, 실외등의 raw HEX를 역할 기반 token으로 치환했다.
- 외벽 회벽 body를 세 층이 공유하고 높이 0.65m 콘크리트 plinth는 F1에만 생성한다.
- y=3.40/7.00/10.55에 다섯 외벽 run을 감싸는 수평 band 15개를 추가했다.
- 중앙 현관에 3.6m opening을 보존한 header·pier·캐노피·post·청색 교명 사인·전용 조명을 추가했다.
- 정문 문주 높이를 3.2m, 철문 높이를 2.7m로 정리하고 중앙 현관과 같은 `schoolBlue` 사인을 사용했다.
- 후문은 service concrete와 dark steel만 사용해 주 출입구와 다른 위계를 유지했다.
- 담장 높이를 2.2m로 통일하고 운동장 구조물은 concrete/steel/blue seat 체계로 정리했다.

## 검증

- OUT·ROOF 비발광 primitive의 raw 색 비율 `70.2% → 0%`.
- facade band 각 5개와 정확한 높이, F1-only plinth 높이를 자동 검사한다.
- 중앙 현관 landmark 수와 폭 3.1m keep-out의 collider 0개를 검사한다.
- `npm run export:collision`, `npm run verify:campus`, `npm run build` 통과.

## 다음 단계

- 일반 보행등 높이를 4.2~5.0m로 정리하고 지면 curb/drain 높이 규칙을 추가한다.
- 수목 belt와 저채도 원경 건물은 실제 카메라 구도를 확인한 뒤 visual-only 예산으로 추가한다.
