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
from collections import Counter

from kiwipiepy import Kiwi

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
FALLBACK_POOL = ["열쇠", "시계", "빨간", "커피", "우산"]


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
        if token.tag in ("NNG", "NNP") and len(token.form) >= 2
    ]

    # 제외어 필터
    nouns = [n for n in nouns if n not in EXCLUDED]

    if not nouns:
        logger.warning("no nouns extracted, using fallback pool")
        return FALLBACK_POOL[:count]

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

    # 상위 count개 선택
    result = [word for word, _ in scored[:count]]

    # 부족하면 폴백에서 보충
    if len(result) < count:
        for fallback in FALLBACK_POOL:
            if fallback not in result:
                result.append(fallback)
            if len(result) >= count:
                break

    logger.info(
        "forbidden words extracted: answers=%s → words=%s (scored=%s)",
        answers, result, scored[:6],
    )
    return result
