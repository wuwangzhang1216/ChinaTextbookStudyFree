#!/usr/bin/env python3
"""Independently check strictly numeric arithmetic and unambiguous digit positions.

Word problems, rounding instructions and repeated-digit place questions are
explicitly outside this parser; a runtime grader is not a semantic proof.
"""
import argparse
import ast
from fractions import Fraction
import json
from pathlib import Path
import re
import unicodedata


def expression_value(text):
    text = unicodedata.normalize('NFKC', text).strip()
    text = re.sub(r'^(?:计算(?:下面的算式|下列各题)?|算一算)[:：]?\s*', '', text)
    text = text.rstrip('。?？').strip()
    if text.startswith('$') and text.endswith('$'): text = text[1:-1].strip()
    if text.startswith(r'\(') and text.endswith(r'\)'): text = text[2:-2].strip()
    text = text.replace(r'\left', '').replace(r'\right', '')
    text = text.replace(r'\times', '*').replace(r'\div', '/')
    text = re.sub(r'\\(?:d?frac)\{(-?\d+)\}\{(\d+)\}', r'(\1/\2)', text)
    text = re.sub(r'[=＝]\s*(?:\(\s*\)|[_□]+)?\s*$', '', text).strip()
    # In textbook notation, slash fractions are single operands when the
    # operation is explicitly written × or ÷: 3÷1/4 means 3÷(1/4).
    # Preserve ordinary slash-only chains, whose association is ambiguous.
    if '×' in text or '÷' in text:
        text = re.sub(r'(?<![\d./])(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)(?![\d./])', r'(\1/\2)', text)
    text = text.translate(str.maketrans({'×': '*', '÷': '/', '−': '-', '－': '-', '＋': '+'}))
    if len(text) > 200 or not re.fullmatch(r'[\d\s.()+*/-]+', text) or not re.search(r'[+*/-]', text) or '**' in text or '//' in text:
        return None
    try:
        tree = ast.parse(text, mode='eval')
        def evaluate(node):
            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
                return Fraction(ast.get_source_segment(text, node))
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
                return evaluate(node.operand) * (1 if isinstance(node.op, ast.UAdd) else -1)
            if isinstance(node, ast.BinOp):
                a, b = evaluate(node.left), evaluate(node.right)
                if isinstance(node.op, ast.Add): return a + b
                if isinstance(node.op, ast.Sub): return a - b
                if isinstance(node.op, ast.Mult): return a * b
                if isinstance(node.op, ast.Div): return a / b
            raise ValueError('Unsupported arithmetic')
        return evaluate(tree.body)
    except (SyntaxError, ValueError, ZeroDivisionError):
        return None


def digit_place(text):
    match = re.fullmatch(r'在数?(\d+)中[，,]?\s*数字(\d)所在的数位是[（(]\s*[）)][。？?]?', text)
    if not match: return None
    number, digit = match.groups()
    if number.count(digit) != 1 or number.startswith('0'): return None
    places = ['个位', '十位', '百位', '千位', '万位', '十万位', '百万位', '千万位', '亿位', '十亿位', '百亿位', '千亿位']
    index = len(number) - number.index(digit) - 1
    return places[index] if index < len(places) else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', type=Path, default=Path('apps/web/public'))
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    for expression, answer in [('计算：36－18＋6。', 24), ('计算：65－5×6。', 35), ('计算：（12－6）×6。', 36), ('$0.5 \\times 40=$', 20), (r'$\frac{3}{8}\times 2$', Fraction(3, 4)), ('计算0.1+0.2。', Fraction(3, 10))]:
        assert expression_value(expression) == answer, expression
    for expression, answer in [('3÷1/4', 12), ('2/3÷4/9', Fraction(3, 2)), ('5/6÷5/9×2/3', 1), ('9÷3/4×1/3', 4), ('2÷-3/4', Fraction(-8, 3)), ('12/3/2', 2)]:
        assert expression_value(expression) == answer, expression
    for text in ['每袋200克，4袋重多少克？', '计算3÷7，保留两位小数。', '__import__("os")', '2**9999']:
        assert expression_value(text) is None
    assert digit_place('在数560000中，数字6所在的数位是（ ）。') == '万位'
    assert digit_place('在数660000中，数字6所在的数位是（ ）。') is None
    index = json.loads((args.public/'data/index.json').read_text())
    math_books = [b['id'] for b in index['books'] if b['subject'] == 'math']
    checked, failures, skipped = [], [], 0
    for book in math_books:
        for file in sorted((args.public/'data/books'/book/'lessons').glob('*.json')):
            lesson = json.loads(file.read_text())
            for q in lesson['questions']:
                answer = str(q['answer']).strip()
                place = digit_place(q['question'])
                if place is not None:
                    row = {'lesson': lesson['id'], 'id': q['id'], 'kind': 'digit_place', 'computed': place, 'answer': answer, 'question': q['question']}
                    checked.append(row)
                    if place != answer: failures.append(row)
                elif q['type'] == 'calculation':
                    value = expression_value(q['question'])
                    if value is None or not re.fullmatch(r'[+-]?\d+(?:\.\d+)?(?:/\d+)?', answer):
                        skipped += 1
                        continue
                    row = {'lesson': lesson['id'], 'id': q['id'], 'kind': 'exact_arithmetic', 'computed': str(value), 'answer': answer, 'question': q['question']}
                    checked.append(row)
                    if value != Fraction(answer): failures.append(row)
    report = {'status': 'failed' if failures else 'passed', 'independentCalculations': sum(r['kind']=='exact_arithmetic' for r in checked),
              'independentDigitPositions': sum(r['kind']=='digit_place' for r in checked), 'contextDependentCalculationsNotClaimedVerified': skipped, 'failures': failures, 'checked': checked}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='checked'}, ensure_ascii=False))
    return bool(failures)


if __name__ == '__main__': raise SystemExit(main())
