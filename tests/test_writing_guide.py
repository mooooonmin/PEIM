import json
import ipaddress
import unittest
from pathlib import Path
from app.writing_guide import writing_guide

class WritingGuideTests(unittest.TestCase):
    def test_examples_match_question_and_never_reuse_after_edit(self):
        entries=json.loads(Path('app/writing_examples.json').read_text(encoding='utf-8'))
        self.assertGreaterEqual(len(entries),3)
        for qid, entry in entries.items():
            q={'id':qid,'text':entry['question_text'],'session':1}
            guide=writing_guide(q,[])
            self.assertEqual(guide['kind'],'example')
            for key in ('outline','keywords','checklist','example','source_topic_ids','provenance'):
                self.assertTrue(guide[key])
            self.assertEqual(writing_guide({**q,'text':q['text']+' 변경'},[])['kind'],'scaffold')

    def test_vlsm_example_respects_original_network_and_every_department(self):
        entries = json.loads(Path('app/writing_examples.json').read_text(encoding='utf-8'))
        entry = entries['r139-s4-q06']
        questions = json.loads(Path('public/data/questions.json').read_text(encoding='utf-8'))
        self.assertEqual(entry['question_text'], next(q['text'] for q in questions if q['id'] == 'r139-s4-q06'))
        parent = ipaddress.ip_network('192.168.0.0/22')
        needs = {'개발팀': 500, '영업팀': 250, '인사팀': 125, '보안팀': 125}
        networks = []
        for line in entry['example'].splitlines():
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if len(cells) != 5 or cells[0] not in needs:
                continue
            team, cidr, mask, hosts, broadcast = cells
            network = ipaddress.ip_network(cidr)
            self.assertTrue(network.subnet_of(parent))
            self.assertGreaterEqual(network.num_addresses - 2, needs[team])
            self.assertEqual(mask, str(network.netmask))
            self.assertEqual(hosts, f'{network.network_address + 1} ~ {network.broadcast_address - 1}')
            self.assertEqual(broadcast, str(network.broadcast_address))
            self.assertTrue(all(not network.overlaps(other) for other in networks))
            networks.append(network)
        self.assertEqual(len(networks), len(needs))
        self.assertEqual(sum(net.num_addresses for net in networks), parent.num_addresses)

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

    def test_question_type_changes_outline_without_inventing_answer(self):
        for text, expected in [
            ('A와 B의 차이점을 비교하시오.', '비교 기준과 차이'),
            ('서브넷 마스크와 할당 가능한 Host IP 대역을 계산하시오.', '계산 과정'),
            ('서비스 아키텍처를 설계하시오.', '구성 요소와 연결'),
            ('WBS 작성방법', '수행 절차'),
        ]:
            guide = writing_guide({'id': 'new', 'text': text, 'session': 2}, [])
            self.assertIn(expected, [item['title'] for item in guide['outline']])
            self.assertIsNone(guide['example'])
            self.assertNotIn('기술사적 제언', str(guide))

    def test_subdemands_keep_order_but_get_specific_hints(self):
        guide = writing_guide({'id': 'new', 'text': '가. 개념 나. A와 B 비교 다. 비용 계산', 'session': 3}, [])
        self.assertEqual([x['title'] for x in guide['outline']], guide['requirements'])
        self.assertIn('같은 기준', guide['outline'][1]['hint'])
        self.assertIn('단위', guide['outline'][2]['hint'])

    def test_session_depth_and_unknown_question_are_not_fabricated(self):
        short = writing_guide({'id': 'new', 'text': '새 개념', 'session': 1}, [])
        long = writing_guide({'id': 'new', 'text': '새 개념', 'session': 4}, [])
        self.assertNotEqual(short['outline'][1]['hint'], long['outline'][1]['hint'])
        self.assertEqual(short['keywords'], [])

    def test_deliverables_in_procedure_are_not_calculation(self):
        questions = json.loads(Path('public/data/questions.json').read_text(encoding='utf-8'))
        question = next(q for q in questions if q['id'] == 'r130-s1-q10')
        guide = writing_guide(question, [])
        self.assertIn('수행 절차', [item['title'] for item in guide['outline']])
        self.assertNotIn('계산 과정', [item['title'] for item in guide['outline']])
        comparison = next(q for q in questions if q['id'] == 'r138-s2-q04')
        self.assertIn('같은 기준', writing_guide(comparison, [])['outline'][0]['hint'])

    def test_inline_subquestions_and_sentence_endings(self):
        text = '다음을 설명하시오. 가. 정의와 목적 나. 장단점 다. 도입 시 고려사항'
        guide = writing_guide({'id': 'inline', 'text': text}, [])
        self.assertEqual(guide['requirements'], ['가. 정의와 목적', '나. 장단점', '다. 도입 시 고려사항'])
        self.assertEqual([x['title'] for x in guide['outline']], guide['requirements'])
        self.assertEqual(writing_guide({'id': 'plain', 'text': '데이터베이스를 정의하시오. 단. 예시는 제외한다.'}, [])['requirements'], ['데이터베이스를 정의하시오. 단. 예시는 제외한다.'])

    def test_existing_inline_exam_question(self):
        questions = json.loads(Path('public/data/questions.json').read_text(encoding='utf-8'))
        question = next(q for q in questions if q['id'] == 'r78-s2-q06')
        requirements = writing_guide(question, [])['requirements']
        self.assertEqual(len(requirements), 3)
        self.assertTrue(requirements[0].startswith('가. 1차 정규화'))
        self.assertTrue(requirements[1].startswith('나. 2차 정규화'))
        self.assertTrue(requirements[2].startswith('다. 정규화의 목적'))

    def test_cross_reference_ocr_and_premise_lists(self):
        questions = {q['id']: q for q in json.loads(Path('public/data/questions.json').read_text(encoding='utf-8'))}
        cross = writing_guide(questions['r117-s4-q02'], [])['requirements']
        self.assertEqual(len(cross), 2)
        self.assertTrue(cross[1].startswith('나. 위의 가. 조건에서'))
        ocr = questions['r90-s4-q04']
        self.assertEqual(writing_guide(ocr, [])['requirements'], [ocr['text'].strip()])
        premise = writing_guide(questions['r84-s3-q02'], [])['requirements']
        self.assertEqual(len(premise), 3)
        self.assertEqual(premise[0], '가. 기능점수 산출방법의 간이법과 정규법의 차이점을 비교 설명하시오.')
