# 금기어 판정 엔진

> 작성일: 2026-08-03
> 파일: `server/app/ai/forbidden.py`
> 테스트: `server/tests/test_forbidden.py`
> 상태: 구현 완료, 24/24 테스트 통과

---

## 설계 원칙

- LLM을 사용하지 않는다
- 서버 판정 로직은 50ms 이내
- 3단계 파이프라인으로 단계별 비용이 다르다 — 싼 단계에서 걸리면 비싼 단계를 실행하지 않는다

---

## 3단계 파이프라인

### 1단계: 정규식 직접 매칭 (~0ms)

금기어가 전사 텍스트에 그대로 포함되어 있는지 확인한다. 한국어 조사 결합(`은/는/이/가/을/를/의/와/과/에/서/로/도/만/까지`)도 패턴에 포함한다.

```python
re.compile(rf"{re.escape(word)}(?:[은는이가을를의와과에서로도만까지])?")
```

- 가장 빠름. 대부분의 금기어 발화가 여기서 잡힌다.
- 패턴은 엔진 초기화 시 사전 컴파일한다.

### 2단계: 형태소 분석 후 어근 매칭 (~20ms)

kiwipiepy로 형태소 분석 후 명사(NNG, NNP)와 어근(XR) 태그의 형태소만 추출하여 금기어와 비교한다.

- "뜨거운 커피잔이 있어" → 형태소 분리 → "커피" 추출 → 매칭
- "그 빨간색 물건" → "빨간" 추출 → 매칭
- 1단계에서 놓치는 합성어, 복합 표현을 잡는다.

### 3단계: 유사 발음 매칭 (~10ms)

STT 오인식 대응. 전사 텍스트의 각 어절을 자모 분리(`jamo`)한 뒤 금기어의 자모 시퀀스와 편집거리(`Levenshtein ratio`)를 비교한다.

- "열세" → 자모 분리 → "열쇠"와 비교 → 유사도 0.75 이상이면 매칭
- threshold 기본값: 0.75

---

## 의존성

| 패키지 | 용도 |
|--------|------|
| kiwipiepy | 한국어 형태소 분석 (2단계) |
| jamo | 한글 자모 분리 (3단계) |
| python-Levenshtein | 편집거리 계산 (3단계) |

KoNLPy+Mecab 대신 kiwipiepy를 선택한 이유는 ADR-002 참고.

---

## 출력 구조

```python
@dataclass
class JudgeResult:
    is_forbidden: bool              # 금기어 판정 여부
    matched_word: str | None        # 매칭된 금기어
    matched_stage: str | None       # "exact" | "morph" | "phonetic"
    confidence: float               # 신뢰도 (exact=1.0, morph=0.95, phonetic=0.75~1.0)
    elapsed_ms: float               # 판정 소요 시간 (ms)
    transcript: str                 # 원본 전사 텍스트
```

---

## 주요 메서드

| 메서드 | 용도 |
|--------|------|
| `check(transcript)` | 전사 텍스트를 받아 금기어 판정 결과 반환 |
| `update_words(new_words)` | 금기어 목록 교체 (라운드 시작 시) |

---

## 테스트 결과 (2026-08-03)

```
24 passed in 2.20s
```

| 테스트 그룹 | 케이스 | 결과 |
|---|---|---|
| 정확한 매칭 | 3 | 통과 |
| 조사 결합 | 5 | 통과 |
| 형태소 분석 | 2 | 통과 |
| 유사 발음 | 2 | 통과 |
| 오탐 방지 | 5 | 통과 |
| 성능 (50ms 이내) | 2 | 통과 |
| 금기어 교체 | 2 | 통과 |
| 경계 케이스 | 3 | 통과 |

---

## 다음 단계

- [ ] WebSocket 핸들러에 연결 (speech 메시지 → 판정 → freeze 이벤트 broadcast)
- [ ] GameState에 빙결 상태 반영
- [ ] 실제 Web Speech API interim result로 테스트 (브라우저 연결 후)
- [ ] 게임 배경음 환경에서의 오탐률 측정
