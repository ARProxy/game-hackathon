# 『얼음, 땡!』 무과금 로컬 AI 아키텍처

> 문서 버전: v0.1
> 작성일: 2026-08-02
> 상태: 기술 검증 전 권장안

---

## 1. 목표

게임 실행 중 상용 AI API를 호출하지 않고도 다음 경험을 제공한다.
- 한국어 음성 인식
- 금기어 발화 판정
- 플레이어의 우회 표현 해석
- AI 동료의 대상 선택과 행동
- 짧은 AI 동료 응답
- 인터넷 또는 AI 추론 장애 시 완주 가능한 폴백

`무료`는 AI 연산이 사라진다는 뜻이 아니라, 클라우드 API 사업자가 처리하던 연산을 로컬 장비가 담당한다는 의미다.

---

## 2. 보유 장비

| 장비 | 메모리 | 역할 |
| --- | --- | --- |
| MacBook M4 Max | 32GB | 플레이 클라이언트, Three.js 렌더링, 체감 지연 검증 |
| Mac Pro M4 | 48GB | FastAPI, 로컬 STT, 로컬 LLM, 게임 상태와 로그 서버 |

---

## 3. 실행 모드

### 3.1 Full Local AI 모드
시연 영상 촬영, 오프라인 본선, 두 장비가 함께 있는 환경.
- 외부 AI API 호출 없음, API 키 없음
- 인터넷 없이 실행 가능
- 음성을 외부 사업자에게 전송하지 않음

### 3.2 Zero-Dependency Demo 모드
심사자가 로컬 AI 서버 없이 웹 빌드를 실행할 때.
- LLM 없어도 게임 완주 가능
- Web Speech API 또는 텍스트 입력
- 규칙 기반 대상 추론 + 고정 미션

### 3.3 향후 Optional Cloud 모드
사전 과제 이후 필요할 때만 추가.

---

## 4. STT 구성

### 초기 후보
- `faster-whisper`: FastAPI와 같은 Python 환경
- `whisper.cpp`: 네이티브 실행과 WebAssembly 실험
- Transformers.js Whisper: 브라우저 WebGPU 폴백
- Web Speech API: 빠른 프로토타입 및 온라인 폴백

### 권장 시작점
48GB 장비에서 `faster-whisper` 다국어 Base 또는 Small 모델을 우선 비교.

### 두 개의 음성 처리 경로
- **빠른 경로**: 금기어 판정 (결정론적, 즉시)
- **추론 경로**: AI 동료 의도 추론 (최종 전사 대기 허용)

---

## 5. 무료 로컬 LLM

### 실행 후보
- Ollama, llama.cpp, Apple Silicon MLX, MLC LLM, WebLLM (브라우저 폴백)

### 모델 후보 기준
- 한국어 지시 이해, 0.5B~3B급, 구조화 JSON 출력, 상업적 라이선스

### LLM이 담당할 일
- 두세 개 후보 중 우회 표현과 가장 가까운 프롭 선택
- 의도 분류 (이동, 확인, 가져오기, 구조)
- 금기어를 피한 짧은 응답 생성

### 담당하지 않을 일
- 금기어 최종 판정, 충돌/빙결/구조/승패
- 술래 순찰과 경로 탐색, 장기 계획, 자유 장문 대화

---

## 6. 하이브리드 추론 (LLM 호출 최소화)

1단계: 결정론적 특징 추출 (구역, 특성, 행동)
2단계: 프롭 후보 점수 계산
3단계: 신뢰도 라우팅
- 1위 점수 높음 → LLM 없이 행동
- 1위/2위 비슷 → 로컬 LLM에 후보만 전달
- 후보 없음 → 확인 질문
- LLM 실패 → 화면에 후보 선택 UI

---

## 7. 공통 AI 인터페이스

```tsx
interface IntentProvider {
  resolve(context: IntentContext): Promise<AIIntent>;
}
```

구현체: LocalLLMIntentProvider, RuleBasedIntentProvider, ScriptedDemoIntentProvider, BrowserLocalIntentProvider, OptionalCloudIntentProvider

---

## 8. 초기 성능 목표

| 항목 | 초기 목표 |
| --- | --- |
| 금기어 판정 | 발화 후 1초 이내 |
| AI 동료 행동 시작 | 발화 종료 후 2초 이내 |
| 구조화 출력 성공률 | 95% 이상 |
| AI 실패 시 폴백 전환 | 1초 이내 |
| 외부 유료 AI 호출 | 0회 |

---

## 9. 미결정 사항

- 두 장비의 정확한 Apple 칩 모델과 GPU 코어 수
- 심사자가 원격 URL로만 플레이해야 하는지
- STT 최종 모델 크기
- 로컬 LLM 런타임과 모델
- 브라우저 STT를 기본 경로로 둘지 폴백으로만 둘지
- 모델 파일을 빌드와 함께 제공할지 최초 실행 시 다운로드할지
