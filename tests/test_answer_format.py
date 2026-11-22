import hashlib
import json
from pathlib import Path
import unittest

from app.answer_format import format_answer, reference_answer


class AnswerFormatTests(unittest.TestCase):
    def test_headings_are_consistent_without_changing_code_tables_or_links(self):
        text = '## 1. 개요\n본문 [[id|이름]]\n### 가. 정의\n| A | B |\n|---|---|\n```python\n## 1. 코드 주석\n```'
        result = format_answer(text)
        self.assertIn('## 개요\n', result)
        self.assertIn('### 정의\n', result)
        self.assertIn('```python\n## 1. 코드 주석\n```', result)
        self.assertIn('| A | B |\n|---|---|', result)
        self.assertIn('[[id|이름]]', result)
        self.assertEqual(format_answer(result), result)

    def test_corrections_require_exact_source_and_keep_original_input(self):
        edits = json.loads(Path('app/reference_edits.json').read_text(encoding='utf-8'))
        answers = {}
        for path in Path('public/data/answers').glob('*.json'):
            answers.update(json.loads(path.read_text(encoding='utf-8')))
        for tid, variants in edits.items():
            for variant, edit in variants.items():
                original = answers[tid][variant]
                self.assertEqual(hashlib.sha256(original.encode()).hexdigest(), edit['source_sha256'])
                result = reference_answer(tid, {'variant': variant, 'body': original})
                self.assertEqual(result['editorial_status'], 'corrected')
                self.assertIn('검토 근거', result['body'])
                self.assertEqual(answers[tid][variant], original)
                mismatch = reference_answer(tid, {'variant': variant, 'body': original + ' 수정'})
                self.assertEqual(mismatch['editorial_status'], 'source_mismatch')
                self.assertTrue(mismatch['body'].endswith('수정'))

    def test_all_reference_bodies_keep_structure_when_formatted(self):
        for path in Path('public/data/answers').glob('*.json'):
            for variants in json.loads(path.read_text(encoding='utf-8')).values():
                for body in variants.values():
                    formatted = format_answer(body)
                    self.assertEqual(formatted.count('```'), body.count('```'))
                    self.assertEqual(formatted.count('[['), body.count('[['))
                    self.assertEqual(format_answer(formatted), formatted)
