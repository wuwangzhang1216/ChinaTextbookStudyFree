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


def math_text(text):
    # NFKC would turn 5² into 52. Preserve the mathematical meaning first;
    # bounded squares/cubes expand to multiplication without enabling eval/pow.
    def expand(match):
        exponent = {'²':2,'³':3}.get(match[2]) if match[2] else int(match[3])
        return '(' + '×'.join([match[1]] * exponent) + ')'
    text = re.sub(r'(\d+(?:\.\d+)?)(?:([²³])|\^([23]))(?!\d)', expand, text)
    return unicodedata.normalize('NFKC', text).replace('∶', ':')


def value(text):
    if re.fullmatch(r'[+-]?\d+(?:\.\d+)?', text.strip()):
        return Fraction(text.strip())
    return exact.expression_value(text)


def equations(text):
    text = math_text(text)
    text = re.sub(r'(?<=\d)\.{3,}(?=\s*\d)', '余', text)
    if re.search(r'近似|保留|估算|四舍五入|大约|≈|约等于', text):
        return []
    rows = []
    for match in re.finditer(r'[0-9.():+*/×÷＋－−=＝\-\s]+', text):
        raw = match.group().strip().replace('＝', '=').lstrip(':').strip()
        if '=' not in raw:
            continue
        # Do not interpret the numeric suffix of a variable, a percentage,
        # an incomplete formula or a thousands-separated number as an equation.
        before = text[match.start()-1:match.start()] if match.start() else ''
        after = text[match.end():match.end()+1]
        if (before and before in ',.%□△○又^√') or (after and after in ',.%个十百千万亿') or re.search(r'[A-Za-z]', before + after):
            continue
        parts = [p.strip() for p in raw.split('=')]
        if not all(parts):
            continue
        if ':' in raw:
            # Ratios form a complete expression. Never check just the numeric
            # suffix of x:45=3.6:90, or interpret clock arithmetic as division.
            number = r'\d+(?:\.\d+)?'
            if not re.fullmatch(fr'{number}\s*:\s*{number}(?:\s*=\s*{number}\s*:\s*{number})+', raw):
                continue
            ratios = []
            for part in parts:
                a, b = map(Fraction, part.split(':'))
                if not b:
                    break
                ratios.append(a / b)
            if len(ratios) == len(parts):
                rows.append({'equation':raw, 'values':[str(v) for v in ratios], 'correct':len(set(ratios)) == 1})
            continue
        if after == '又':
            fractional = re.match(r'又\s*(\d+)\s*/\s*(\d+)', text[match.end():])
            if len(parts) != 2 or not fractional or not re.fullmatch(r'\d+', parts[1]) or not int(fractional[2]):
                continue
            computed = value(parts[0])
            if computed is not None:
                mixed = Fraction(parts[1]) + Fraction(int(fractional[1]),int(fractional[2]))
                rows.append({'equation':raw + fractional[0], 'values':[str(computed),str(mixed)], 'correct':computed == mixed})
            continue
        if after == '余':
            division = re.fullmatch(r'(\d+(?:\.\d+)?)\s*[÷/]\s*(\d+(?:\.\d+)?)', parts[0])
            remainder = re.match(r'余\s*(\d+(?:\.\d+)?)', text[match.end():])
            if len(parts) != 2 or not division or not remainder or not re.fullmatch(r'\d+', parts[1]):
                continue
            dividend, divisor = map(Fraction, division.groups())
            if not divisor:
                continue
            quotient = dividend // divisor
            rest = dividend - divisor * quotient
            actual = (int(parts[1]), Fraction(remainder[1]))
            rows.append({'equation':raw + remainder[0], 'values':[f'{quotient}余{rest}',f'{actual[0]}余{actual[1]}'], 'correct':actual == (quotient,rest)})
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
            text = math_text(data['question'])
            if re.fullmatch(r'(?:判断[:：]?)?[0-9.()+*/×÷＋－−=＝\-\s]+[。?？]?', text):
                rows = equations(text)
                if len(rows) == 1:
                    row = rows[0]
                    row['computedAnswer'] = '对' if row['correct'] else '错'
                    row['answer'] = data['answer']
                    row['correct'] = row['computedAnswer'] == row['answer']
                    row['kind'] = 'numeric_judgment'
                    yield prefix, data['question'], row
        elif data.get('type') in ('calculation', 'choice'):
            text = math_text(data['question'])
            if not re.search(r'近似|保留|估算|四舍五入|大约|约等于|余数|写商|填商|整数商|≈', text):
                # Remove only an explicit answer-entry instruction, never a
                # number or a condition from a word problem.
                expression = re.sub(r'[，,；;。]\s*(?:请|只(?:写|填)|填写|写出|直接写|填入|填数字).+$', '', text)
                expression = re.sub(r'(?:的结果是多少|的结果是|等于多少)[?？。]?$', '', expression)
                computed = exact.expression_value(expression)
                if computed is not None:
                    try:
                        answer = Fraction(str(data['answer']))
                    except (ValueError, ZeroDivisionError):
                        answer = None
                    if data['type'] != 'choice' or answer is not None:
                        yield prefix, data['question'], {'kind':'numeric_choice' if data['type'] == 'choice' else 'numeric_calculation', 'expression':expression, 'computedAnswer':str(computed), 'answer':data['answer'], 'correct':computed == answer}
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
    assert equations('17÷5＝3余2，余数小于除数。')[0]['correct']
    assert equations('12.5÷2.4＝5余0.5。')[0]['correct']
    assert not equations('17÷5＝2余7。')[0]['correct']
    assert equations('17÷5＝3……2，因此17/5＝3又2/5。')[0]['correct']
    assert equations('17/5＝3又2/5。')[0]['correct']
    assert not equations('17/5＝3又1/5。')[0]['correct']
    assert not equations('1又1/4=1.25。')  # Do not evaluate a suffix of a mixed number.
    assert equations('3.14×3²=28.26。')[0]['correct']
    assert equations('2³＋3^2＝17。')[0]['correct']
    assert not equations('5²=10。')[0]['correct']
    assert equations('比例尺为5:3000=1:600。')[0]['correct']
    assert equations('计算：3＋4＝7。')[0]['correct']
    assert not equations('4:7=12:20。')[0]['correct']
    assert not equations('x:45=3.6:90。')
    assert not equations('8:30+1:20=9:50。')
    assert list(judgments({'type':'true_false', 'question':'判断：7×1=1。', 'answer':'错'}))[0][2]['correct']
    assert list(judgments({'type':'calculation', 'question':'计算：0.1＋0.2，请填写数字。', 'answer':'0.3'}))[0][2]['correct']
    assert not list(judgments({'type':'calculation', 'question':'计算：21÷5，只写商。', 'answer':'4'}))
    assert not list(judgments({'type':'calculation', 'question':'每袋200克，4袋共多少克？', 'answer':'800'}))
    assert list(judgments({'type':'choice', 'question':'计算：3÷1/4的结果是多少？', 'answer':'12'}))[0][2]['correct']
    assert not list(judgments({'type':'choice', 'question':'计算：3＋4。', 'answer':'8'}))[0][2]['correct']
    assert not list(judgments({'type':'choice', 'question':'计算：3＋4。', 'answer':'7个'}))
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
    result = {'status': 'failed' if failures else 'passed', 'files': len(files), 'numericChecks':len(checked), 'exactEqualities':sum(row['kind'] in ('affirmative_equation','numeric_judgment') for row in checked), 'calculationAnswers':sum(row['kind'] == 'numeric_calculation' for row in checked), 'numericChoiceAnswers':sum(row['kind'] == 'numeric_choice' for row in checked), 'failures': failures, 'boundary': 'Exact literal equations, numeric judgments and bare arithmetic questions only; contextual answers, rounded calculations and teacher signoff excluded.'}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(result, ensure_ascii=False))
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
