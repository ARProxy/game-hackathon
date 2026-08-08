# Batch 5: 지하 파이널 미션 설계

## 기획서 원문 (game-design-v3.md 8.2절)

> 기계실, 전기실, 급식창고와 방공호의 좁은 통로를 사용한다.
> 배전반, 급수 밸브 또는 비상 발전기를 정해진 순서나 동시 조건으로 복구한다.
> 장치 상태는 서로 다른 방에서만 확인할 수 있어 AI 보고가 필요하다.
> 최종 주문이 올바르면 비상 터널 또는 지하 출구가 열린다.
> 술래는 좁은 공간에서 빠르기보다 차단과 수색으로 압박한다.

## 서버 구현 명세

### BasementFinalMission

```
장치 3개: 배전반(B1_PANEL), 급수 밸브(B1_VALVE), 발전기(B1_GENERATOR)
각 장치는 서로 다른 방에 위치한다.
```

**흐름**:
1. 파이널 진입 시 3개 장치 + 올바른 순서가 시드로 결정
2. 각 장치에는 "현재 상태"가 있다 (off/standby/active)
3. 장치의 상태는 **해당 장치 앞에 있는 actor만** 확인 가능
4. AI가 자기 위치의 장치 상태를 음성 보고 → 플레이어가 순서 판단
5. 올바른 순서로 3개 장치를 모두 active로 전환하면 미션 완료
6. 잘못된 순서 → 전체 리셋 (off로 복귀)

**서버 상태**:
```python
@dataclass
class BasementFinalMission:
    devices: list[BasementDevice]  # 3개
    correct_order: list[str]       # device_id 순서
    activated_order: list[str]     # 실제 활성화 순서
    completed: bool = False
```

**검증**:
- 장치 작동 시 actor가 해당 장치 2.25m 이내인지 확인
- 활성화 순서가 correct_order와 일치하면 완료
- 불일치 시 모든 장치 off + 술래에게 소리 핑

**AI 역할**:
- AI 2명이 각각 다른 장치 방에 배치
- 자기 장치의 상태를 음성 보고: "여기 밸브는 아직 꺼져 있어"
- 플레이어 명령에 따라 장치 활성화: "밸브 돌려!" → AI 실행
- 금기어 회피 적용

### 맵 슬롯 필요

```
BASEMENT_FINAL_ENTRY       — 지하 진입 위치
BASEMENT_DEVICE_PANEL      — 배전반 위치
BASEMENT_DEVICE_VALVE      — 급수 밸브 위치
BASEMENT_DEVICE_GENERATOR  — 발전기 위치
BASEMENT_ESCAPE_GATE       — 비상 터널 출구
```

### vertical_flow.py 수정사항

- `activate_basement_device()` — 장치 작동 + 순서 검증
- `get_basement_device_status()` — 장치 상태 조회 (근접 actor만)
- BasementFinalMission을 session에 저장

### companion.py 수정사항

- BASEMENT_FINAL일 때 AI가 배정된 장치 방으로 이동
- 도착 후 장치 상태를 주기적으로 보고
- 플레이어 명령에 따라 장치 활성화 action 실행
