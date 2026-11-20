import json
import unittest
from pathlib import Path
from app.writing_guide import writing_guide

class WritingGuideTests(unittest.TestCase):
    def test_examples_match_question_and_never_reuse_after_edit(self):
        entries=json.loads(Path('app/writing_examples.json').read_text(encoding='utf-8'))
        self.assertEqual(len(entries),3)
        for qid, entry in entries.items():
            q={'id':qid,'text':entry['question_text'],'session':1}
            guide=writing_guide(q,[])
            self.assertEqual(guide['kind'],'example')
            for key in ('outline','keywords','checklist','example','source_topic_ids','provenance'):
                self.assertTrue(guide[key])
            self.assertEqual(writing_guide({**q,'text':q['text']+' 변경'},[])['kind'],'scaffold')

    def test_subquestions_preserved_without_invented_example(self):
        guide=writing_guide({'id':'new','text':'새 기술을 설명하시오.\n가. 정의\n나. 장점 및 단점\n다. 적용 시 고려사항'},[{'title':'새 기술'}])
        self.assertEqual(guide['requirements'],['가. 정의','나. 장점 및 단점','다. 적용 시 고려사항'])
        self.assertEqual([x['title'] for x in guide['outline']],guide['requirements'])
        self.assertIsNone(guide['example'])
        self.assertEqual(guide['keywords'],['새 기술'])
        self.assertIn('초안',guide['notice'])

    def test_short_question_retains_actual_demand(self):
        guide=writing_guide({'id':'new','text':'A와 B 비교'},[])
        self.assertEqual(guide['requirements'],['A와 B 비교'])
        self.assertIn('A와 B 비교',guide['checklist'][0])
        self.assertEqual(guide['keywords'],[])
