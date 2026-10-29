#!/usr/bin/env python3
"""Exercise the actual additive importer on isolated, disposable source banks."""
import copy,hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parents[1]/'editions/materialize_five_four.py'
def write(p,d):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
class ImportContract(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.stage=self.root/'stage'
  spec=importlib.util.spec_from_file_location('five_four',SCRIPT);self.importer=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.importer);self.importer.ROOT=self.root
  self.legacy=self.root/'output/math/outlines/旧教材一年级上册.json';write(self.legacy,{'textbook':'原教材','units':[]});self.original=sha(self.legacy)
  self.catalog=self.fixture('math',1)
 def tearDown(self):self.temp.cleanup()
 def fixture(self,subject,grade):
  bid=('' if subject=='math' else subject+'-')+f'g{grade}up-54-qingdao'
  unit={'number':1,'appUnitNumber':101,'title':'学习准备','printedStart':1,'physicalStart':1,'physicalEnd':1,'contentsEntries':['学习准备'],'label':'学习准备','points':[{'name':'数数','description':'数出数量','physicalPages':[1]}]}
  book={'id':bid,'edition':'54-qingdao','editionLabel':'五四制·青岛版','schoolSystem':'5-4','subject':subject,'grade':grade,'semester':'up','sourceTitle':'测试教材','publisherLabel':'青岛版','sourceEdition':'2021年第1版','sourcePrinting':'2021年第1次印刷','pageOffset':0,'stem':f"五四制测试{'一二三四五'[grade-1]}年级上册",'units':[unit]}
  page=self.stage/'pages'/bid/'1.jpg';page.parent.mkdir(parents=True,exist_ok=True);page.write_bytes(b'isolated-source-page-fixture')
  write(self.stage/'page-evidence'/f'{bid}.json',{'pages':[{'physicalPage':1,'sha256':sha(page)}]})
  plan={'bookId':bid,'unit':{k:unit[k] for k in ['number','title','printedStart','physicalStart','physicalEnd','contentsEntries']},'plan':{'points':unit['points']}}
  write(self.stage/'plans'/f'{bid}-u1.json',plan)
  def q(i):return {'type':'choice','difficulty':1,'knowledge_point':'数数','question':f'测试题{i}','options':['1','2','3','4'],'answer':'2','explanation':'测试解析','source_ref':'1'}
  k={'point':'数数','core_concept':'测试概念','key_formula':'','common_mistakes':['测试易错点'],'tips':'测试提示'}
  data={'bookId':bid,'unitNumber':1,'sourcePages':[1],'planSha256':hashlib.sha256(json.dumps(plan,sort_keys=True,ensure_ascii=False).encode()).hexdigest(),'editorialReview':{'status':'verified','kind':'test_fixture'},'content':{'lessons':{'数数':{'knowledge':k,'questions':[q(i) for i in range(6)]}},'exam':[q(i) for i in range(6,12)],'readings':[]}}
  write(self.stage/'units'/f'{bid}-u1.json',data)
  return {'books':[book]}
 def generated(self):return self.root/'output/math/outlines'/f"{self.catalog['books'][0]['stem']}.json"
 def test_additive_identity_source_order_and_idempotence(self):
  result=self.importer.materialize(self.catalog,self.stage);self.assertEqual(result['books'],1);self.assertEqual(result['questions'],12)
  outline=json.loads(self.generated().read_text());self.assertEqual(outline['schoolSystem'],'5-4');self.assertEqual(outline['publisherLabel'],'青岛版');self.assertNotIn('supersedes',outline);self.assertEqual(outline['units'][0]['unit_number'],101)
  before=sha(self.generated());self.importer.materialize(self.catalog,self.stage);self.assertEqual(sha(self.generated()),before);self.assertEqual(sha(self.legacy),self.original)
 def test_source_page_change_rejects_before_any_new_bank(self):
  page=next((self.stage/'pages').rglob('*.jpg'));page.write_bytes(b'changed')
  with self.assertRaises(ValueError):self.importer.materialize(self.catalog,self.stage)
  self.assertFalse(self.generated().exists());self.assertEqual(sha(self.legacy),self.original)
 def test_unreviewed_candidate_rejected(self):
  p=next((self.stage/'units').glob('*.json'));d=json.loads(p.read_text());d['editorialReview']['status']='needs_review';write(p,d)
  with self.assertRaises(ValueError):self.importer.materialize(self.catalog,self.stage)
  self.assertFalse(self.generated().exists())
 def test_legacy_source_path_cannot_be_overwritten(self):
  self.catalog['books'][0]['stem']=self.legacy.stem
  with self.assertRaises(ValueError):self.importer.materialize(self.catalog,self.stage)
  self.assertEqual(sha(self.legacy),self.original)
 def test_wrong_identity_school_system_and_path_rejected(self):
  for field,value in [('id','g1up'),('schoolSystem','6-3'),('stem','../escaped一年级上册')]:
   broken=copy.deepcopy(self.catalog);broken['books'][0][field]=value
   with self.assertRaises(ValueError):self.importer.materialize(broken,self.stage)
  self.assertEqual(sha(self.legacy),self.original)
 def test_existing_identity_refuses_changed_candidate(self):
  self.importer.materialize(self.catalog,self.stage);before=sha(self.generated());p=next((self.stage/'units').glob('*.json'));d=json.loads(p.read_text());d['content']['lessons']['数数']['questions'][0]['explanation']='已改变';write(p,d)
  with self.assertRaises(ValueError):self.importer.materialize(self.catalog,self.stage)
  self.assertEqual(sha(self.generated()),before)
 def test_reading_keeps_words_and_excludes_nonspoken_layout(self):
  catalog=self.fixture('english',3);bid=catalog['books'][0]['id'];p=self.stage/'units'/f'{bid}-u1.json';d=json.loads(p.read_text());d['content']['readings']=[{'title':'Greeting','physicalPages':[1],'sentences':['Hello!','...']}];write(p,d)
  self.importer.materialize(catalog,self.stage);passages=json.loads((self.root/'data/passages/english'/f'{bid}.json').read_text());self.assertEqual(passages['passages'][0]['sentences'],['Hello!']);self.assertEqual(passages['passages'][0]['unitNumber'],101)
 def test_reviewed_positional_explanations_keep_option_order(self):
  for explanation in ['第一项询问帽子的位置，第二项询问颜色。','第二条路线重复经过AB。','其他三项分别表示不同的目的地。','The third option is correct.','应选B。']:
   original={'type':'choice','knowledge_point':'数数','question':'请选择正确答案','options':['10','20','30','40'],'answer':'20','explanation':explanation}
   result=self.importer.question(original,10001,['数数'])
   self.assertEqual(result['options'],original['options'],explanation)
   self.assertEqual(result['answer'],'20')
if __name__=='__main__':unittest.main()
