# 『얼음, 땡!』 AI 활용 기술 문서 & 시스템 아키텍처

**NAN 2026 사전과제 제출용 | v1.0 (2026.08.02)**

---

## 1. 아키텍처 총괄

### 1.1 설계 원칙

| 원칙 | 설명 |
| --- | --- |
| **Zero Cost** | 외부 API 호출 비용 0원. 모든 AI는 로컬 또는 오픈소스로 구동 |
| **에이전트 분리** | 프론트엔드(React + three.js) / 백엔드(FastAPI) / AI 엔진을 독립 모듈로 분리 |
| **규칙 우선, AI 보조** | LLM이 필요 없는 기능은 규칙 기반으로 처리. AI는 자연어가 필수인 곳에만 사용 |
| **지연 최소화** | 게임 루프에 영향을 주는 판정(금기어)은 50ms 이내 응답 |

### 1.2 시스템 전체도

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   React UI   │  │  three.js    │  │  Web Speech API (STT)  │ │
│  │  (로비/HUD/  │  │  (2.5D 렌더  │  │  마이크 입력 → 텍스트  │ │
│  │   채팅/정산) │  │   엔진)      │  │                        │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘ │
│         │                 │                      │              │
│         └────────┬────────┘                      │              │
│                  │                               │              │
│            WebSocket                        WebSocket           │
│           (게임 상태)                     (음성 텍스트)          │
└──────────────────┬───────────────────────────────┬──────────────┘
                   │                           │
                   ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI)                            │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Game Server  │  │ Speech       │  │  Mission Engine        │ │
│  │ - 상태 관리  │  │ Processor    │  │ - 템플릿 기반 생성     │ │
│  │ - 세션 관리  │  │ - 금기어 판정│  │ - 프롭 슬롯 배치      │ │
│  │ - 턴 제어   │  │ - 형태소분석 │  │ - 단서 관리            │ │
│  │ - 동기화    │  │ - 온보딩분석 │  │                        │ │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬───────────┘ │
│         │                │                       │              │
│  ┌──────┴──────┐  ┌──────┴───────┐  ┌────────────┴───────────┐ │
│  │ AI Director │  │ Forbidden    │  │  AI Partner            │ │
│  │ (규칙 FSM)  │  │ Word Engine  │  │  Dialogue System       │ │
│  │ - 술래 AI   │  │ (규칙 기반)  │  │ - 대사 풀 + 템플릿     │ │
│  │ - 난이도    │  │ - KoNLPy    │  │ - 상황별 선택 로직     │ │
│  │ - 극적 연출 │  │ - 문자열매칭 │  │ - Ollama 보조 (옵션)   │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
│                    ┌──────────────┐                              │
│                    │   Ollama     │  ← 로컬 LLM (옵션)          │
│                    │  (gemma2 등) │     AI 파트너 자연어 생성    │
│                    └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. AI 기능별 기술 명세

### 2.1 금기어 판정 엔진 (핵심 — 실시간)

게임의 가장 중요한 AI 기능. **LLM을 사용하지 않고** 규칙 기반으로 50ms 이내 판정한다.

```
[마이크 입력]
    ▼
[Web Speech API] ── 브라우저 내장, 무료
    │  실시간 텍스트 (interim result)
    ▼
[WebSocket 전송] ── 텍스트만 전송 (경량)
    ▼
[FastAPI: Speech Processor]
    ├─ (1) 정규식 직접 매칭 ─── "열쇠" in transcript  ← 0ms
    ├─ (2) KoNLPy 형태소 분석 ── "열쇠를" → "열쇠" + "를"  ← ~20ms
    └─ (3) 유사 발음 매칭 ──── "열세" → "열쇠" 후보  ← ~10ms
         (자모 분리 + 편집거리)
    ▼
[판정 결과] ── FREEZE / SAFE
    ▼
[WebSocket broadcast] → 모든 클라이언트에 빙결 이벤트
```

**기술 스택:**

| 컴포넌트 | 기술 | 비용 |
| --- | --- | --- |
| STT | Web Speech API (Chrome 내장) | 무료 |
| 형태소 분석 | KoNLPy + Mecab | 무료 (로컬) |
| 유사 발음 | jamo 라이브러리 + Levenshtein | 무료 (로컬) |
| 판정 로직 | Python 규칙 엔진 | 무료 |

**판정 로직 상세:**

```python
class ForbiddenWordEngine:
    def check(self, transcript: str, forbidden_words: list[str]) -> bool:
        # 1단계: 직접 매칭 (가장 빠름)
        if self._exact_match(transcript, forbidden_words):
            return True
        # 2단계: 형태소 분석 후 어근 매칭
        morphs = self._extract_morphs(transcript)
        if self._morph_match(morphs, forbidden_words):
            return True
        # 3단계: 유사 발음 매칭 (STT 오인식 보정)
        if self._phonetic_match(transcript, forbidden_words, threshold=0.8):
            return True
        return False
```

### 2.2 온보딩 → 금기어 채집 (게임 시작 전, 1회성)

```
[온보딩 질문 출제] ── 사전 정의된 질문 풀에서 2~3개 선택
    ▼
[플레이어 음성 답변] → Web Speech API → 텍스트
    ▼
[FastAPI: Onboarding Analyzer]
    ├─ KoNLPy 명사 추출
    ├─ 불용어 필터 (조사, 대명사, 게임 시스템어)
    ├─ 프롭화 가능성 점수 부여 (사물/색/방향 어휘 가중)
    └─ 빈도 x 프롭화 점수 → 상위 3개 선택
    ▼
[금기어 확정] → 미션 엔진으로 전달
```

**프롭화 가능성 사전 (예시):**

```python
PROP_DICTIONARY = {
    "책": {"score": 1.0, "prop_type": "object", "mesh": "box"},
    "커피": {"score": 0.9, "prop_type": "object", "mesh": "cylinder"},
    "파란": {"score": 0.8, "prop_type": "color", "hex": "#0066FF"},
    "왼쪽": {"score": 0.7, "prop_type": "direction"},
    "행복": {"score": 0.2, "prop_type": "abstract"},
    "시간": {"score": 0.1, "prop_type": "abstract"},
}
EXCLUDED = {"얼음", "땡", "가", "눌러", "나", "너", "여기", "저기"}
```

### 2.3 미션 생성 엔진 (게임 시작 시, 1회성)

LLM 없이 **템플릿 슬롯 채우기** 방식으로 미션을 생성한다.

```python
MISSION_TEMPLATES = {
    "T1_COLLECT": {
        "description": "맵에 흩어진 {prop_name}을(를) 찾아 회수하세요.",
        "hint_for_partner": "진짜 {prop_name}은(는) {zone}구역에 있습니다.",
        "slots": {
            "prop_name": None,
            "zone": None,
            "decoy_count": 2,
        },
        "clear_reward": None,
    },
    "T2_SIMULTANEOUS": {
        "description": "레버와 상자를 동시에 작동하세요. (3초 내)",
        "slots": {
            "lever_zone": "A",
            "box_zone": "D",
            "time_window": 3.0,
        },
    },
    "T3_RELAY": {
        "description": "파트너가 알려주는 정보를 장치에 입력하세요.",
        "slots": {
            "secret_sequence": None,
            "device_zone": "B",
        },
    },
}
```

### 2.4 AI 파트너 대화 시스템 (게임 중, 실시간)

#### Layer 1: 대사 풀 시스템 (기본, LLM 불필요)

```python
PARTNER_LINES = {
    "T1_HINT_CORRECT": ["그거 맞아! 그쪽에 있는 거!", ...],
    "T1_HINT_WRONG": ["음... 그건 아닌 것 같은데?", ...],
    "T2_TIMING_CALL": ["준비됐어? 하나... 둘...", ...],
    "T3_DESCRIBE_COLOR_RED": ["사과 색! 소방차 색!", ...],
    "WARN_SEEKER_NEARBY": ["조용! 뭔가 온다...", ...],
    "RESCUE_FROZEN": ["내가 갈게! 버텨!", ...],
    "IDLE_CHAT": ["이쪽은 별거 없어~", ...],
    "ACCIDENTAL_FORBIDDEN": [...],  # 5% 확률로 파트너 빙결 이벤트
}
```

#### Layer 2: Ollama 보조 (선택적 확장)
- Layer 1에 매칭되는 상황 태그가 없을 때만 호출
- 호출 빈도: 최대 10초에 1회
- 모델: gemma2:2b 또는 phi3:mini

### 2.5 AI 술래 (순수 규칙 기반, LLM/ML 미사용)

```
[PATROL] ──핑 감지──→ [ALERT] ──위치확인──→ [CHASE] ──태그──→ [KILL]
   │                                                          │
   │←──────────────────── 쿨다운 후 ──────────────────────────┘
   │──주문 감지──→ [RUSH_GATE] ──도달──→ [GATE_GUARD]
```

| 상태 | 이동 속도 | 시야 | 행동 |
| --- | --- | --- | --- |
| PATROL | 플레이어의 60% | 전방 90도 | 웨이포인트 순회 |
| ALERT | 정지 | 360도 | 핑 방향 주시, 1.5초 대기 |
| CHASE | 플레이어의 80~100% | 전방 120도 | 최단 경로 이동 |
| RUSH_GATE | 플레이어의 110% | - | 게이트 직행 |

### 2.6 AI 디렉터 (순수 규칙 기반)

```python
class AIDirector:
    def _calculate_tension(self, state):
        factors = [
            state.seeker_distance_normalized * 0.4,
            state.frozen_player_ratio * 0.3,
            (1 - state.time_remaining_ratio) * 0.2,
            state.mission_remaining / 3.0 * 0.1,
        ]
        return clamp(sum(factors), 0.0, 1.0)
```

### 2.7 최종 미션 판정 (음성 주문)
- 단서 3개 중 2/3 이상 포함 시 관대 판정으로 통과
- 자모 퍼지 매칭 사용
- 실패 시 피드백 + 재시도 허용

---

## 3. 통신 아키텍처

| 통신 | 프로토콜 | 이유 |
| --- | --- | --- |
| 게임 상태 동기화 | WebSocket | 양방향 실시간, 구현 간단 |
| 음성 텍스트 전송 | WebSocket | 텍스트만 전송하므로 경량 |
| AI 파트너 음성 출력 | Web Speech Synthesis | 브라우저 내장 TTS, 무료 |
| 플레이어 간 음성 (멀티) | WebRTC P2P | 사전과제는 AI 충원이므로 후순위 |

### WebSocket 메시지 설계

```tsx
// Client → Server
interface ClientMessage {
  type: "speech" | "action" | "interact" | "spell";
  payload: {
    transcript?: string;
    is_final?: boolean;
    position?: { x: number; z: number };
    action_type?: "move" | "rescue" | "interact";
    target_id?: string;
    spell_text?: string;
  };
}

// Server → Client
interface ServerMessage {
  type: "game_state" | "freeze" | "mission_update" | "partner_speak"
      | "seeker_update" | "gate_open" | "sfx_trigger";
  payload: any;
  timestamp: number;
}
```

---

## 4. 기술 스택 상세

| 영역 | 기술 | 비용 |
| --- | --- | --- |
| UI | React 18 | 무료 |
| 3D 렌더링 | three.js (R3F) | 무료 |
| 상태 관리 | Zustand | 무료 |
| STT | Web Speech API | 무료 |
| TTS | Web Speech Synthesis | 무료 |
| 서버 | FastAPI (Python) | 무료 |
| 통신 | WebSocket | 무료 |
| 형태소 분석 | KoNLPy + Mecab | 무료 |
| 자모 처리 | jamo + Levenshtein | 무료 |
| 로컬 LLM (옵션) | Ollama (gemma2:2b) | 무료 |
| 인프라 | Docker Compose | 무료 |
| **합계** | | **0원** |

---

## 5. 디렉토리 구조

```
ice-tag/
├── client/                     # React + three.js
│   ├── src/
│   │   ├── components/         # React UI (Lobby, HUD, Onboarding, ResultScreen)
│   │   ├── game/               # three.js (Scene, Map, Player, Seeker, Partner, Props, Lighting, Effects)
│   │   ├── hooks/              # useSpeech, useWebSocket, useGameState
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── server/                     # FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── ws/                 # WebSocket handler, manager
│   │   ├── game/               # state, session, loop
│   │   ├── ai/                 # forbidden, onboarding, mission, seeker, director, partner, ollama
│   │   └── data/               # prop_dict.json, lines.json, questions.json
│   ├── requirements.txt
│   └── Dockerfile
├── docs/
├── docker-compose.yml
└── README.md
```

---

## 6. AI 활용 요약

| 게임 단계 | AI 기능 | 기술 | 역할 |
| --- | --- | --- | --- |
| 온보딩 | 자연어 분석 | KoNLPy + 규칙 | 플레이어 발화에서 금기어 자동 채집 |
| 게임 준비 | 미션 자동 생성 | 템플릿 엔진 | 금기어 기반 미션/프롭/맵 배치 자동 구성 |
| 게임 중 | 실시간 음성 판정 | STT + 형태소 분석 + 퍼지 매칭 | 금기어 위반 즉시 감지 (50ms 이내) |
| 게임 중 | AI 파트너 협동 | 대사 풀 FSM + Ollama(옵션) | 우회 화법으로 미션 힌트 제공 |
| 게임 중 | AI 술래 행동 | FSM + A* 경로탐색 | 순찰/감지/추격의 자율 행동 |
| 게임 중 | AI 디렉터 연출 | 긴장도 기반 규칙 엔진 | 난이도/극적 흐름 실시간 조율 |
| 최종 미션 | 음성 주문 판정 | STT + 퍼지 매칭 | 소리 내어 외친 주문의 관대한 인식 |

> **핵심 가치**: "AI가 NPC 대사를 생성한다" 수준이 아니라, **플레이어의 언어 습관이 게임 규칙이 되고, 음성이 곧 게임 입력이 되는** 구조. AI는 게임의 장식이 아니라 게임 메카닉 그 자체다.

---

## 7. 개발 과정 AI 활용 내역

> 이 섹션은 개발이 진행되면서 채워진다.

### 7.1 사용 AI 도구

| 도구 | 용도 | 활용 단계 |
| --- | --- | --- |
| Claude (Opus) | | |
| Claude Code (CLI) | | |
| Codex | | |
| | | |

### 7.2 주요 프롬프트 예시

#### 게임 내 AI 프롬프트

<!-- 게임 런타임에서 사용하는 프롬프트 (온보딩 분석, AI 파트너 의도 추론 등) -->

#### 개발 보조 AI 프롬프트

<!-- 코드 구현, 기획 검토, 디버깅 등에 사용한 프롬프트 -->

### 7.3 AI 활용 구분

| 영역 | AI 활용 여부 | 상세 |
| --- | --- | --- |
| 게임 기획 | | |
| 아키텍처 설계 | | |
| 프론트엔드 구현 | | |
| 백엔드 구현 | | |
| AI 엔진 구현 | | |
| 아트/사운드 | | |
| 문서 작성 | | |
| 디버깅/테스트 | | |

### 7.4 AI가 기여한 것 vs 직접 판단한 것

<!-- AI 도구가 생성한 결과물 중 그대로 사용한 것, 수정한 것, 거부한 것을 구분 기록 -->
