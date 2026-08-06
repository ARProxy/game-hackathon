"""온보딩 답변에서 금기어 후보를 채집하는 모듈

파이프라인:
1. 답변 텍스트를 kiwipiepy로 형태소 분석
2. 명사(NNG, NNP)만 추출
3. 불용어/제외어 필터
4. 프롭화 가능성 점수로 가중
5. 빈도 x 프롭화 점수 상위 3개 선택
6. 후보 부족 시 기본 풀에서 보충
"""

from __future__ import annotations

import logging
import json
import os
import random
import urllib.request
from collections import Counter

from kiwipiepy import Kiwi

from app.ai.mission import load_prop_dict

logger = logging.getLogger(__name__)

_kiwi = Kiwi()

# 프롭화 가능성 사전 — 맵에 놓을 수 있는 사물/색/방향 어휘 우선
PROP_SCORES: dict[str, float] = {
    # 사물 (높은 점수)
    "열쇠": 1.0, "책": 1.0, "가방": 1.0, "시계": 1.0,
    "컵": 0.9, "커피": 0.9, "물": 0.8, "우산": 0.9,
    "모자": 0.9, "신발": 0.9, "안경": 0.9, "지갑": 0.9,
    "휴대폰": 0.8, "핸드폰": 0.8, "충전기": 0.8,
    "이어폰": 0.8, "노트북": 0.8, "마우스": 0.8,
    "연필": 0.9, "볼펜": 0.9, "공책": 0.9, "종이": 0.8,
    "사과": 0.9, "바나나": 0.9, "빵": 0.9, "과자": 0.8,
    "꽃": 0.9, "화분": 0.9, "인형": 0.9, "공": 0.9,
    "상자": 0.9, "가위": 0.9, "거울": 0.9, "양초": 0.9,
    # 색 (중간 점수)
    "빨간": 0.8, "파란": 0.8, "노란": 0.8, "초록": 0.8,
    "하얀": 0.7, "검은": 0.7, "분홍": 0.8,
    "빨강": 0.8, "파랑": 0.8, "노랑": 0.8,
    # 방향/위치 (중간 점수)
    "왼쪽": 0.7, "오른쪽": 0.7, "위": 0.6, "아래": 0.6,
    # 음식
    "라면": 0.8, "밥": 0.7, "치킨": 0.8, "피자": 0.8,
    "햄버거": 0.8, "떡볶이": 0.8, "김밥": 0.8,
}

# 제외어 — 게임 진행에 필수이거나 너무 일반적인 단어
EXCLUDED = {
    "얼음", "땡", "나", "너", "저", "우리", "여기", "저기", "거기",
    "것", "거", "수", "때", "게", "데", "말", "생각", "사람",
    "오늘", "내일", "어제", "요즘", "보통", "항상", "가끔",
    "좀", "많이", "조금", "정도", "이상", "이하",
    "집", "학교", "회사",  # 너무 흔하거나 맵에 놓기 어려움
}

# 기본 풀 — 후보 부족 시 사용
FALLBACK_POOL = ["열쇠", "시계", "빨간", "커피", "우산", "책", "노트북", "파란"]
QUESTION_POOL = [
    "어두운 교실 책상 위에서 발견한 물건 세 가지를 말해 주세요.",
    "비 오는 날 가방에 꼭 넣고 싶은 물건은 무엇인가요?",
    "지금 가장 먼저 떠오르는 색과 음료를 하나씩 말해 주세요.",
    "학교에 늦었을 때 급하게 챙길 물건 세 가지는 무엇인가요?",
    "문이 잠긴 방에서 도움이 될 물건은 무엇일까요?",
    "친구의 책상에서 쉽게 발견할 법한 물건을 말해 주세요.",
    "파란색과 빨간색 중 좋아하는 색과 그 이유를 말해 주세요.",
    "밤 산책을 나갈 때 챙기고 싶은 물건은 무엇인가요?",
]


def _ollama_json(prompt: str) -> dict | None:
    """선택적 로컬 Ollama 호출. 실패는 게임 흐름을 막지 않는다."""
    base_url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "gemma3:4b")
    request = urllib.request.Request(
        f"{base_url}/api/generate",
        data=json.dumps({
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.9},
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=float(os.getenv("OLLAMA_TIMEOUT", "15"))) as response:
            envelope = json.loads(response.read().decode("utf-8"))
        return json.loads(envelope.get("response", "{}"))
    except Exception as error:
        logger.info("onboarding local AI unavailable; using randomized fallback: %s", error)
        return None


def generate_onboarding_questions(count: int = 3) -> list[str]:
    prompt = f"""한국어 공포 협동 게임의 짧고 재미있는 온보딩 질문을 {count}개 만들어라.
답변에서 다음 단어가 자연스럽게 나오기 쉬워야 한다: {', '.join(sorted(supported_prop_words()))}.
개인정보를 묻지 말고 질문끼리 주제를 겹치지 마라. JSON만 반환: {{"questions":["...?"]}}"""
    generated = _ollama_json(prompt)
    questions = generated.get("questions", []) if isinstance(generated, dict) else []
    valid = [str(question).strip() for question in questions if 8 <= len(str(question).strip()) <= 80]
    if len(valid) >= count:
        return valid[:count]
    return random.sample(QUESTION_POOL, k=min(count, len(QUESTION_POOL)))


def generate_forbidden_words(answers: list[str], count: int = 3) -> list[str]:
    """AI가 답변 맥락과 지원 프롭 풀에서 매 판 다른 금기어를 고른다."""
    supported = sorted(supported_prop_words())
    prompt = f"""음성 협동 게임의 금기어를 정확히 {count}개 골라라.
플레이어 답변: {json.dumps(answers, ensure_ascii=False)}
선택 가능한 단어: {', '.join(supported)}
답변에 등장했거나 답변과 자연스럽게 연상되고, 게임 중 다시 말할 가능성이 높은 서로 다른 단어를 선택하라.
JSON만 반환: {{"words":["단어1","단어2","단어3"]}}"""
    generated = _ollama_json(prompt)
    raw_words = generated.get("words", []) if isinstance(generated, dict) else []
    words: list[str] = []
    for word in raw_words:
        normalized = str(word).strip()
        if normalized in supported and normalized not in words:
            words.append(normalized)
        if len(words) == count:
            return words

    # AI 장애나 불완전 JSON에서도 고정 앞부분 대신 매 판 다른 안전 조합을 사용한다.
    remaining = [word for word in supported if word not in words]
    random.shuffle(remaining)
    return (words + remaining)[:count]


def supported_prop_words() -> set[str]:
    """T1에서 우회 표현 두 개 이상으로 식별 가능한 단어를 반환한다."""
    prop_dict = load_prop_dict()
    return {
        word
        for word, prop in prop_dict.items()
        if len({description.strip() for description in prop.get("descriptions", []) if description.strip()}) >= 2
    }


def extract_forbidden_words(
    answers: list[str],
    count: int = 3,
) -> list[str]:
    """온보딩 답변에서 금기어 후보를 추출한다."""

    # 모든 답변을 합쳐서 형태소 분석
    all_text = " ".join(answers)
    tokens = _kiwi.tokenize(all_text)

    # 명사만 추출
    nouns = [
        token.form
        for token in tokens
        if token.tag in ("NNG", "NNP")
    ]

    # 제외어와 T1 미지원 단어를 제거한다. 사전 밖 단어를
    # generic prop으로 만들면 식별 단서가 하나뿐이어서 동료 명령이 영원히 성립하지 않는다.
    supported = supported_prop_words()
    nouns = [n for n in nouns if n not in EXCLUDED and n in supported]

    if not nouns:
        logger.warning("no nouns extracted, using fallback pool")
        return [word for word in FALLBACK_POOL if word in supported][:count]

    # 빈도 계산
    freq = Counter(nouns)

    # 빈도 x 프롭화 점수로 최종 점수
    scored: list[tuple[str, float]] = []
    for word, f in freq.items():
        prop_score = PROP_SCORES.get(word, 0.5)  # 사전에 없으면 기본 0.5
        final_score = f * prop_score
        scored.append((word, final_score))

    # 점수 내림차순 정렬
    scored.sort(key=lambda x: x[1], reverse=True)

    # 답변에 실제로 등장한 지원 단어를 먼저 유지한다.
    result = [word for word, _ in scored[:count]]

    # 부족하면 폴백에서 보충
    if len(result) < count:
        for fallback in FALLBACK_POOL:
            if fallback not in supported:
                continue
            if fallback not in result:
                result.append(fallback)
            if len(result) >= count:
                break

    logger.info(
        "forbidden words extracted: answers=%s → words=%s (scored=%s)",
        answers, result, scored[:6],
    )
    return result
