#!/usr/bin/env python3
"""Independently evaluate literal equalities in the new five-four mathematics.

This checks exact numeric equations, not word-problem meaning, diagrams, rounded
calculations or a teacher's approval. It can screen reviewed staging candidates
before import, or the committed quiz banks after import.
"""
import argparse
from fractions import Fraction
import importlib.util
import json
from pathlib import Path
import re
import unicodedata

spec = importlib.util.spec_from_file_location('exact', Path(__file__).with_name('ux-content-arithmetic.py'))
exact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exact)


def value(text):
    if re.fullmatch(r'[+-]?\d+(?:\.\d+)?', text.strip()):
        return Fraction(text.strip())
    return exact.expression_value(text)


def equations(text):
    text = unicodedata.normalize('NFKC', text)
    if re.search(r'近似|保留|估算|四舍五入|大约|≈|约等于', text):
        return []
    rows = []
    for match in re.finditer(r'[0-9.()+*/×÷＋－−=＝\-\s]+', text):
        raw = match.group().strip().replace('＝', '=')
        if '=' not in raw:
            continue
        # Do not interpret the numeric suffix of a variable, a percentage,
        # an incomplete formula or a thousands-separated number as an equation.
        before = text[match.start()-1:match.start()] if match.start() else ''
        after = text[match.end():match.end()+1]
        if (before and before in ',.%□△○') or (after and after in ',.%个十百千万亿') or re.search(r'[A-Za-z]', before + after):
            continue
        parts = [p.strip() for p in raw.split('=')]
        if not all(parts):
            continue
        values = [value(p) for p in parts]
        if all(v is not None for v in values):
            rows.append({'equation': raw, 'values': [str(v) for v in values], 'correct': len(set(values)) == 1})
    return rows


def strings(data, prefix=''):
    if isinstance(data, str):
        yield prefix, data
    elif isinstance(data, dict):
        for key, val in data.items():
            if key not in ('source_ref', 'editorialReview', 'question', 'options', 'common_mistakes'):
                yield from strings(val, prefix + '/' + key)
    elif isinstance(data, list):
        for i, val in enumerate(data):
            yield from strings(val, prefix + '/' + str(i))


def judgments(data, prefix=''):
    if isinstance(data, dict):
        if data.get('type') == 'true_false':
            text = unicodedata.normalize('NFKC', data['question'])
            if re.fullmatch(r'(?:判断[:：]?)?[0-9.()+*/×÷＋－−=＝\-\s]+[。?？]?', text):
                rows = equations(text)
                if len(rows) == 1:
                    row = rows[0]
                    row['computedAnswer'] = '对' if row['correct'] else '错'
                    row['answer'] = data['answer']
                    row['correct'] = row['computedAnswer'] == row['answer']
                    row['kind'] = 'numeric_judgment'
                    yield prefix, data['question'], row
        elif data.get('type') == 'calculation':
            text = unicodedata.normalize('NFKC', data['question'])
            if not re.search(r'近似|保留|估算|四舍五入|大约|约等于|余数|写商|填商|整数商|≈', text):
                # Remove only an explicit answer-entry instruction, never a
                # number or a condition from a word problem.
                expression = re.sub(r'[，,；;。]\s*(?:请|只(?:写|填)|填写|写出|直接写|填入|填数字).+$', '', text)
                computed = exact.expression_value(expression)
                if computed is not None:
                    try:
                        answer = Fraction(str(data['answer']))
                    except (ValueError, ZeroDivisionError):
                        answer = None
                    yield prefix, data['question'], {'kind':'numeric_calculation', 'expression':expression, 'computedAnswer':str(computed), 'answer':data['answer'], 'correct':computed == answer}
        for key, val in data.items():
            yield from judgments(val, prefix + '/' + key)
    elif isinstance(data, list):
        for i, val in enumerate(data):
            yield from judgments(val, prefix + '/' + str(i))


def main():
    assert equations('先算32＋41＝73，再看73－41＝32。') and all(x['correct'] for x in equations('先算32＋41＝73，再看73－41＝32。'))
    assert equations('0.1＋0.2＝0.3。')[0]['correct']
    assert not equations('4＋2＝8。')[0]['correct']
    assert not equations('3÷7＝0.43（保留两位小数）。')
    assert not equations('上底＋下底＝总和；a3＋2＝5。')
    assert not equations('算式4□－27＝22中，□里填几？')
    assert not equations('20＝2个十')
    assert list(judgments({'type':'true_false', 'question':'判断：7×1=1。', 'answer':'错'}))[0][2]['correct']
    assert list(judgments({'type':'calculation', 'question':'计算：0.1＋0.2，请填写数字。', 'answer':'0.3'}))[0][2]['correct']
    assert not list(judgments({'type':'calculation', 'question':'计算：21÷5，只写商。', 'answer':'4'}))
    assert not list(judgments({'type':'calculation', 'question':'每袋200克，4袋共多少克？', 'answer':'800'}))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    files = sorted((args.stage/'units').glob('g*-54-qingdao-u*.json')) if args.stage else sorted(Path('output/math/quizzes').glob('五四制*.json'))
    assert files, 'No five-four mathematics sources found'
    checked = []
    for file in files:
        doc = json.loads(file.read_text())
        for field, text in strings(doc.get('content', doc)):
            # Explanations and mistake advice can quote deliberately wrong
            # alternatives. Do not mistake those quotations for assertions.
            if re.search(r'不|错|误|不能|≠|>|<|＞|＜', text):
                continue
            for row in equations(text):
                checked.append({'file': file.name, 'field': field, 'text': text, 'kind':'affirmative_equation', **row})
        for field, text, row in judgments(doc.get('content', doc)):
            checked.append({'file': file.name, 'field': field, 'text': text, **row})
    failures = [row for row in checked if not row['correct']]
    result = {'status': 'failed' if failures else 'passed', 'files': len(files), 'numericChecks':len(checked), 'exactEqualities':sum(row['kind'] != 'numeric_calculation' for row in checked), 'calculationAnswers':sum(row['kind'] == 'numeric_calculation' for row in checked), 'failures': failures, 'boundary': 'Exact literal equations, numeric judgments and bare arithmetic questions only; contextual answers, rounded calculations and teacher signoff excluded.'}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(result, ensure_ascii=False))
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
