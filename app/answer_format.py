"""Read-only editorial presentation; source and personal records remain untouched."""
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re


def format_answer(body: str, preserve_demands: bool = False) -> str:
    """Normalize heading labels without reordering demands or touching code blocks."""
    lines = []
    fence = None
    for line in body.splitlines():
        marker = re.match(r'^\s{0,3}(`{3,}|~{3,})(.*)$', line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip():
                fence = None
        elif marker:
            fence = marker[1]
        else:
            heading = re.match(r'^(#{1,6})\s+(.+)$', line)
            if heading:
                prefix = r'^(?:\d+|[IVX]+)\.\s+' if preserve_demands else r'^(?:\d+|[IVX]+|[가-힣])\.\s+'
                title = re.sub(prefix, '', heading[2])
                title = title.replace('등장배경 / 필요성', '배경 및 필요성')
                line = f'{heading[1]} {title.strip()}'
                if lines and lines[-1].strip():
                    lines.append('')
        lines.append(line)
    return '\n'.join(lines).strip()


@lru_cache(maxsize=1)
def reference_edits() -> dict:
    return json.loads(Path(__file__).with_name('reference_edits.json').read_text(encoding='utf-8'))


def reference_answer(topic_id: str, answer: dict) -> dict:
    body = answer['body']
    status = 'format_only'
    edit = reference_edits().get(topic_id, {}).get(answer['variant'])
    if edit:
        if hashlib.sha256(body.encode('utf-8')).hexdigest() == edit['source_sha256']:
            body = edit['body']
            sources = '\n'.join(f"- [{source['title']}]({source['url']}) — {source['scope']}" for source in edit['sources'])
            body += '\n\n## 검토 근거\n' + sources
            status = 'corrected'
        else:
            status = 'source_mismatch'
    return {**answer, 'body': format_answer(body), 'editorial_status': status}
