"""Read-only writing aids. Editorial examples are bound to the exact question text."""
import json
import re
from pathlib import Path


def normalize(text):
    return re.sub(r"\s+", "", text)


def writing_guide(question, topics):
    text = question['text'].strip()
    entries = json.loads(Path(__file__).with_name('writing_examples.json').read_text(encoding='utf-8'))
    entry = entries.get(question['id'])
    matched = entry is not None and normalize(entry['question_text']) == normalize(text)
    # Keep the question's actual sub-demands; do not infer a technical answer from topic names.
    parts = re.split(r"(?<!\S)([가나다라마바사아자차카타파하])\.\s*", text)
    requirements = [f'{parts[i]}. {parts[i+1].strip()}' for i in range(1, len(parts), 2)] if len(parts) > 1 else [text]
    if matched:
        return {'kind': 'example', 'requirements': requirements, **entry,
                'notice': '학습용 작성 예시이며 공식 정답이나 채점 기준이 아닙니다. 주제 상세 해설과 함께 검토하세요.'}
    outline = [{'title': item, 'hint': '요구한 개념을 먼저 쓰고, 핵심 내용과 근거·사례를 이어서 설명하세요.'} for item in requirements]
    if len(requirements) == 1:
        outline = [
            {'title': '개념 정의', 'hint': '문제에서 묻는 대상을 한두 문장으로 정의하세요.'},
            {'title': '요구사항 설명', 'hint': '비교 문제는 같은 기준의 표로, 절차 문제는 순서도로 정리하세요. 문제에 없는 항목을 억지로 늘리지 마세요.'},
            {'title': '핵심 정리', 'hint': '문제와 직접 관련된 적용 조건이나 유의점을 짧게 정리하세요.'},
        ]
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
