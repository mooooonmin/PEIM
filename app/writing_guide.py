"""Read-only writing aids. Editorial examples are bound to the exact question text."""
import json
import re
from pathlib import Path
from app.answer_format import format_answer


def demand_type(text: str) -> str:
    if re.search(r'계산|산출(?!물)|할당 가능한|VLSM', text, re.I):
        return 'calculation'
    if re.search(r'비교|차이|차이점|\bvs\b', text, re.I):
        return 'comparison'
    if re.search(r'설계|아키텍처|구축 방안|구축방안', text):
        return 'design'
    if re.search(r'절차|작성\s*방법|수행\s*방법|단계', text):
        return 'procedure'
    return 'concept'


def demand_hint(text: str) -> str:
    return {
        'calculation': '주어진 조건·단위와 식을 먼저 적고, 중간 계산과 결과를 검산합니다.',
        'comparison': '대상을 정의한 뒤 같은 기준의 표로 차이와 적용 조건을 설명합니다.',
        'design': '요구 조건을 구성 요소·연결 흐름에 대응시키고 설계 선택의 근거를 설명합니다.',
        'procedure': '단계별 입력·활동·산출물을 순서대로 연결합니다.',
        'concept': '묻는 개념을 정의하고 핵심 내용과 근거를 설명합니다.',
    }[demand_type(text)]


def single_outline(text: str, session: int | None) -> list[dict]:
    titles = {
        'calculation': ['조건과 가정', '계산 과정', '결과와 검산'],
        'comparison': ['비교 대상의 개념', '비교 기준과 차이', '적용 조건'],
        'design': ['요구 조건', '구성 요소와 연결', '설계 근거와 검증'],
        'procedure': ['목적과 입력', '수행 절차', '산출물과 확인 사항'],
        'concept': ['개념 정의', '핵심 내용', '적용 조건과 유의점'],
    }[demand_type(text)]
    depth = ('핵심 용어와 관계를 간결하게 정리합니다.' if session == 1 else
             '원리·근거와 적용 사례를 연결해 설명합니다.')
    return [
        {'title': titles[0], 'hint': '문제에 제시된 대상과 조건을 먼저 명확히 합니다.'},
        {'title': titles[1], 'hint': demand_hint(text) + ' ' + depth},
        {'title': titles[2], 'hint': '문제와 관련 있는 조건·한계 또는 검산 결과만 정리합니다.'},
    ]


def normalize(text):
    return re.sub(r"\s+", "", text)


def writing_guide(question, topics):
    text = question['text'].strip()
    entries = json.loads(Path(__file__).with_name('writing_examples.json').read_text(encoding='utf-8'))
    entry = entries.get(question['id'])
    matched = entry is not None and normalize(entry['question_text']) == normalize(text)
    # Keep the question's actual sub-demands; do not infer a technical answer from topic names.
    labels = '가나다라마바사아자차카타파하'
    markers = list(re.finditer(r'(?<!\S)([' + labels + r'])\.\s*', text))
    selected = []
    # Require an ordered list. A lone OCR ending or an in-sentence reference
    # must not discard the stem. The final list follows any premise list.
    for start, marker in enumerate(markers):
        if marker[1] != labels[0]:
            continue
        sequence = [marker]
        for candidate in markers[start + 1:]:
            if len(sequence) < len(labels) and candidate[1] == labels[len(sequence)]:
                sequence.append(candidate)
        if len(sequence) > 1:
            selected = sequence
    requirements = [
        f'{marker[1]}. {text[marker.end():selected[i + 1].start() if i + 1 < len(selected) else len(text)].strip()}'
        for i, marker in enumerate(selected)
    ] if selected else [text]
    if matched:
        return {'kind': 'example', 'requirements': requirements, **entry,
                'example': format_answer(entry['example'], preserve_demands=True),
                'notice': '학습용 작성 예시이며 공식 정답이나 채점 기준이 아닙니다. 주제 상세 해설과 함께 검토하세요.'}
    outline = [{'title': item, 'hint': demand_hint(item)} for item in requirements]
    if len(requirements) == 1:
        outline = single_outline(text, question.get('session'))
    return {
        'kind': 'scaffold', 'requirements': requirements, 'outline': outline,
        'keywords': [t['title'] for t in topics],
        'checklist': [f'요구사항을 빠뜨리지 않았는가: {item}' for item in requirements] + [
            '정의와 설명에 근거가 있고, 문제와 무관한 내용을 줄였는가?',
            '표·도식의 용어와 본문 설명이 서로 일치하는가?'],
        'example': None,
        'notice': ('문항 내용이 변경되어 기존 예시를 표시하지 않습니다. ' if entry else '') +
                  '문제 원문 기반 작성 틀입니다. 목차와 출제어는 초안이며 내용 검수가 필요합니다. 문항별 작성 예시는 아직 등록되지 않았습니다.',
    }
