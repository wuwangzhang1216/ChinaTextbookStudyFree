#!/usr/bin/env python3
"""Import reviewed five-four books additively, with explicit source provenance.

The catalog is committed; full editorial candidates, textbook pages, passages and
quiz banks are part of the matching release resources. Never overwrite a source
identity with changed content: a revised import needs new book/edition IDs.
"""
import argparse,copy,hashlib,json,re,shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,d):
 p.parent.mkdir(parents=True,exist_ok=True);t=p.with_suffix(p.suffix+'.tmp');t.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');t.replace(p)
def question(row,number,points):
 q=copy.deepcopy(row);q.pop('source_ref',None);q.update(id=number,score=10)
 if q['knowledge_point'] not in points or not q['question'] or not q['explanation']:raise ValueError('Invalid question content')
 if q['type']=='choice':
  if len(q['options'])!=4 or len(set(q['options']))!=4 or q['answer'] not in q['options']:raise ValueError('Invalid unique choice')
  # Some reviewed explanations refer to "the first option" or list the other
  # alternatives in order. Keep that order rather than invalidate the review.
  positional=re.search(r'第|项|分别|依次|前者|后者|前一|后一|(?:选|答案是)[A-Da-d]|\b(?:first|second|third|fourth|respectively|[A-D])\b',q['explanation'],re.I)
  positional=positional or re.search(r'第[一二三四1-4].{0,3}选项|选项[A-Da-d1-4]|[A-Da-d]项',q['question'])
  if not positional:q['options'].sort(key=lambda option:hashlib.sha256((q['question']+'\0'+option).encode()).digest())
 elif q['type']=='true_false':
  if q['options'] or q['answer'] not in ('对','错'):raise ValueError('Invalid true/false')
 elif q['type']=='calculation':
  if q['options'] or not re.fullmatch(r'-?\d+(?:[./]\d+)?',q['answer']):raise ValueError('Invalid numeric answer')
 else:raise ValueError('Unsupported question type')
 return q
def materialize(catalog,stage):
 pending=[];resources=[];evidence=[];ids=set();stats={'books':0,'lessons':0,'questions':0,'challenges':0,'readings':0}
 for b in catalog['books']:
  bookid=b['id'];edition=b['edition'];subject=b['subject']
  if (not re.fullmatch(r'[a-z0-9-]+',bookid) or not re.fullmatch(r'54-[a-z0-9-]+',edition) or bookid in ids or b['schoolSystem']!='5-4' or b['grade'] not in range(1,6) or b.get('supersedes')):raise ValueError('Unsafe parallel book identity')
  ids.add(bookid);outline={'textbook':b['sourceTitle'],'edition':edition,'editionLabel':b['editionLabel'],'schoolSystem':'5-4','publisherLabel':b['publisherLabel'],'sourceEdition':b['sourceEdition'],'sourcePrinting':b['sourcePrinting'],'units':[]}
  expected_base=('' if subject=='math' else subject+'-')+f"g{b['grade']}{b['semester']}"
  if bookid!=expected_base+'-'+edition or Path(b['stem']).name!=b['stem'] or '/' in b['stem'] or '\\' in b['stem']:raise ValueError('Book/source identity mismatch')
  passages=[];mapping=[];pn=0
  for u in b['units']:
   n=u['number'];app_n=u.get('appUnitNumber',n);file=stage/'units'/f'{bookid}-u{n}.json';candidate=read(file)
   if candidate['bookId']!=bookid or candidate['unitNumber']!=n or candidate['sourcePages']!=list(range(u['physicalStart'],u['physicalEnd']+1)) or candidate['editorialReview'].get('status')!='verified':raise ValueError(f'Unverified/mismatched unit: {file}')
   plan=read(stage/'plans'/file.name)
   if plan['unit']!={k:u[k] for k in ['number','title','printedStart','physicalStart','physicalEnd','contentsEntries']}:raise ValueError(f'Changed source plan: {file}')
   fingerprint=hashlib.sha256(json.dumps(plan,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
   if candidate['planSha256']!=fingerprint:raise ValueError(f'Candidate source digest mismatch: {file}')
   names=[p['name'] for p in u['points']];data=candidate['content'];knowledge=[];qs=[]
   if set(data['lessons'])!=set(names) or len(data['exam'])!=6:raise ValueError(f'Incomplete unit: {file}')
   for point in names:
    entry=data['lessons'][point];k=entry['knowledge']
    if k['point']!=point or not k['core_concept'] or not k['tips'] or not k['common_mistakes'] or len(entry['questions'])!=6 or any(q['knowledge_point']!=point for q in entry['questions']):raise ValueError(f'Incomplete knowledge: {file}')
    knowledge.append(k);qs.extend(entry['questions'])
   if len({json.dumps([q['question'].strip(),sorted(q['options'])],ensure_ascii=False) for q in qs+data['exam']})!=len(qs)+6:raise ValueError(f'Duplicate complete questions: {file}')
   qs=[question(q,app_n*10000+i,names) for i,q in enumerate(qs,1)];exam=[question(q,app_n*10000+9000+i,names) for i,q in enumerate(data['exam'],1)]
   quiz={'textbook':outline['textbook'],'unit':u['title'],'unit_number':app_n,'unit_test':{'title':u['title']+'·配套练习','total_score':len(qs)*10,'time_minutes':max(10,len(qs)),'questions':qs},'exam':{'title':u['title']+'·单元挑战','total_score':60,'time_minutes':15,'questions':exam},'knowledge_summary':knowledge}
   pending.append((ROOT/'output'/subject/'quizzes'/f"{b['stem']}_unit{app_n}.json",quiz))
   outline['units'].append({'unit_number':app_n,'title':u['title'],**({'label':u['label']} if u.get('label') else {}),'knowledge_points':[{'name':p['name'],'description':p['description'],'difficulty':1,'question_types':['choice','true_false'] if subject!='math' else ['choice','true_false','calculation']} for p in u['points']]})
   fingerprints=[]
   for physical in candidate['sourcePages']:
    page=stage/'pages'/bookid/f'{physical}.jpg'
    expected=next(p for p in read(stage/'page-evidence'/f'{bookid}.json')['pages'] if p['physicalPage']==physical)['sha256']
    if digest(page)!=expected:raise ValueError('Textbook image changed: '+str(page))
    fingerprints.append(expected)
   evidence.append({'bookId':bookid,'unit':app_n,'sourceSectionOrdinal':n,'candidateSha256':digest(file),'sourcePhysicalPages':candidate['sourcePages'],'sourceImagesDigest':hashlib.sha256(json.dumps(fingerprints).encode()).hexdigest(),'editorialReview':candidate['editorialReview']})
   for r in data['readings']:
    if subject!='english' or not r['sentences'] or not r['physicalPages'] or not set(r['physicalPages'])<=set(candidate['sourcePages']):raise ValueError('Invalid reading source')
    # Continuation marks on a writing task are page layout, not an utterance.
    # Keep every actual word; the original page image retains its punctuation.
    spoken_sentences=[s for s in r['sentences'] if re.search(r'[A-Za-z0-9\u4e00-\u9fff]',s)]
    if not spoken_sentences:continue
    pn+=1;pid=f'{bookid}-p{pn}';pages=r['physicalPages']
    passages.append({'id':pid,'unitNumber':app_n,'lessonNumber':pn,'title':r['title'],'kind':'dialogue','author':'','language':'English','sentences':spoken_sentences,'page_hint':pages[0]-b['pageOffset'],'curriculumRole':'main'})
    mapping.append({'passage_id':pid,'page_hint':pages[0]-b['pageOffset'],'pdf_page':pages[0],'pages':pages})
    for physical in pages:resources.append((stage/'pages'/bookid/f'{physical}.jpg',ROOT/'apps/web/public/textbook-pages'/bookid/f'p{physical}.jpg'))
   stats['lessons']+=len(names);stats['questions']+=len(qs)+6;stats['challenges']+=1
  if passages:
   outline['requiredPassageTitles']=[p['title'] for p in passages]
   pending.append((ROOT/'data/passages'/subject/f'{bookid}.json',{'bookId':bookid,'subject':subject,'grade':b['grade'],'textbook':b['sourceTitle'],'passages':passages}))
   pending.append((ROOT/'apps/web/public/textbook-pages'/bookid/'pages.json',{'bookId':bookid,'offset':b['pageOffset'],'passages':mapping}))
  pending.append((ROOT/'output'/subject/'outlines'/f"{b['stem']}.json",outline));stats['books']+=1;stats['readings']+=len(passages)
 # Validate the complete transaction before writing any production input.
 # Idempotent re-import is allowed; changed data requires a new ID.
 for target,data in pending:
  if target.exists() and read(target)!=data:raise ValueError('Refusing to replace an existing source identity: '+str(target))
 for source,target in set(resources):
  target.parent.mkdir(parents=True,exist_ok=True)
  if target.exists() and digest(source)!=digest(target):raise ValueError('Changed textbook image: '+str(target))
  if not target.exists():shutil.copy2(source,target)
 for target,data in pending:write(target,data)
 manifest={'schemaVersion':1,'schoolSystem':'5-4','stats':stats,'editorialSignoff':'model_screen_not_teacher_signoff','sources':evidence,'resourceFiles':[{'path':str(p.relative_to(ROOT)),'sha256':digest(p)} for p,_ in pending]}
 write(ROOT/'content/editions/five-four/resource-manifest.json',manifest);return stats
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--stage',type=Path,required=True);parser.add_argument('--catalog',type=Path,default=ROOT/'content/editions/five-four/catalog.json');args=parser.parse_args()
 print(json.dumps(materialize(read(args.catalog),args.stage),ensure_ascii=False))
