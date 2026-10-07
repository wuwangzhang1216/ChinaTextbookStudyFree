#!/usr/bin/env python3
"""Read-only audit of the complete generated bank and static export.

Integrity errors fail the check. Coverage and content warnings are reported
separately: file existence and valid input formats do not certify pedagogy.
"""
import argparse
import collections
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[2]
TYPES = {'choice', 'true_false', 'fill_blank', 'calculation', 'word_problem',
         'fill_blank_text', 'word_order', 'matching'}
TRUE_FALSE = {'对', '错', '正确', '错误', 'true', 'false', 't', 'f', '✓', '√', '✗', '×', 'y', 'n', 'yes', 'no'}


def image_size(path):
    with path.open('rb') as f:
        header = f.read(24)
        if header.startswith(b'\x89PNG\r\n\x1a\n') and header[12:16] == b'IHDR':
            width, height = struct.unpack('>II', header[16:24])
            if width == 0 or height == 0:
                raise ValueError('zero-sized PNG')
            return width, height
        f.seek(2)
        if not header.startswith(b'\xff\xd8'):
            raise ValueError('not a supported JPEG/PNG')
        while True:
            byte = f.read(1)
            if not byte:
                raise ValueError('no JPEG dimensions')
            if byte != b'\xff':
                continue
            while (marker := f.read(1)) == b'\xff':
                pass
            if not marker:
                raise ValueError('truncated JPEG')
            code = marker[0]
            if code in (0xd8, 0xd9) or 0xd0 <= code <= 0xd7 or code == 0x01:
                continue
            if code == 0xda:
                raise ValueError('JPEG scan before dimensions')
            raw = f.read(2)
            if len(raw) != 2:
                raise ValueError('truncated JPEG segment')
            length = struct.unpack('>H', raw)[0]
            if code in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
                raw = f.read(5)
                if len(raw) != 5:
                    raise ValueError('truncated JPEG frame')
                height, width = struct.unpack('>HH', raw[1:])
                if width == 0 or height == 0:
                    raise ValueError('zero-sized JPEG')
                return width, height
            f.seek(length - 2, 1)


def normalized_option(value):
    return re.sub(r'\s+', '', re.sub(r'^[A-D][.、]\s*', '', value).lower())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', type=Path, default=ROOT/'apps/web/public')
    parser.add_argument('--site', type=Path, default=ROOT/'apps/web/out')
    parser.add_argument('--report', type=Path, default=ROOT/'deploy-output/qa-site-integrity.json')
    args = parser.parse_args()
    errors = []
    counts = collections.Counter()
    question_types = collections.Counter()
    lesson_sizes = collections.Counter()
    subjects = collections.Counter()
    media_refs = collections.Counter()
    references = set()
    routes = {'/', '/profile/', '/review/', '/shop/', *[f'/grade/{n}/' for n in range(1, 7)]}
    long_options, long_questions, long_stories, long_passages, long_knowledge = [], [], [], [], []
    no_knowledge = []
    control_characters = []
    latex_warnings = []
    legacy_guide_omissions = []
    media_format_mismatches = []

    def error(location, message):
        errors.append({'location': location, 'message': message})

    def read(path):
        counts['json_files'] += 1
        try:
            return json.loads(path.read_text())
        except (OSError, ValueError) as exc:
            error(str(path.relative_to(args.public)), str(exc))
            return None

    def visit(value, location):
        if isinstance(value, dict):
            for key, child in value.items():
                visit(child, f'{location}.{key}')
        elif isinstance(value, list):
            for idx, child in enumerate(value):
                visit(child, f'{location}[{idx}]')
        elif isinstance(value, str):
            if value.startswith(('/audio/', '/story-images/', '/textbook-pages/')):
                references.add(value)
                media_refs[value.split('/')[1]] += 1
            if re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', value):
                control_characters.append({'location': location, 'text': value})
            if re.search(r'\\(?:bdiv|xdiv|tfrac|frac|bigcirc)', value) and '$' not in value:
                latex_warnings.append({'location': location, 'text': value})

    def questions(items, location, story=False):
        if not isinstance(items, list) or not items:
            error(location, 'empty or invalid question array')
            return
        ids = set()
        for q in items:
            label = f'{location} #{q.get("id")}'
            if q.get('id') in ids:
                error(label, 'duplicate question id inside a lesson/story')
            ids.add(q.get('id'))
            counts['story_questions' if story else 'lesson_questions'] += 1
            question_types[('story:' if story else '') + q.get('type', '?')] += 1
            for key in ('question', 'answer', 'explanation'):
                if not isinstance(q.get(key), str) or not q[key].strip():
                    error(label, f'missing {key}')
            if q.get('type') not in TYPES:
                error(label, 'unsupported question type')
            opts = q.get('options')
            if not isinstance(opts, list) or any(not isinstance(opt, str) or not opt.strip() for opt in opts):
                error(label, 'invalid options')
                continue
            if q.get('audio', {}).get('question'):
                counts['question_audio'] += 1
            if q.get('audio', {}).get('explanation'):
                counts['explanation_audio'] += 1
            if q.get('type') == 'choice':
                if not 2 <= len(opts) <= 4:
                    error(label, 'choice must have two to four options')
                correct = normalized_option(q.get('answer', ''))
                matches = sum(normalized_option(opt) == correct for opt in opts)
                label_answer = re.fullmatch(r'[a-d](?:[.、].*)?', q.get('answer', '').strip(), re.I)
                if matches == 0 and not label_answer:
                    error(label, 'choice answer cannot be resolved to an option')
                if len({opt.strip() for opt in opts}) != len(opts):
                    error(label, 'duplicate choice options')
                long_options.append({'route': location, 'question': q.get('id'), 'length': max(map(len, opts), default=0), 'options': opts})
            if q.get('type') == 'matching':
                if len(opts) != 8:
                    error(label, 'matching renderer requires exactly eight options')
                pairs = q.get('answer', '').replace('，', ',').replace(' ', '').split(',')
                if len(pairs) != 4 or not all(re.fullmatch('[A-D]-[1-4]', p) for p in pairs) or len({p[0] for p in pairs}) != 4 or len({p[-1] for p in pairs}) != 4:
                    error(label, 'matching answer must contain four distinct complete pairs')
            if q.get('type') == 'word_order':
                sequence = [p.strip() for p in q.get('answer', '').replace('，', ',').split(',')]
                if collections.Counter(sequence) != collections.Counter(opts):
                    error(label, 'word order answer differs from available tokens')
            if q.get('type') == 'true_false' and q.get('answer', '').strip().lower() not in TRUE_FALSE:
                error(label, 'unsupported true/false answer')
            long_questions.append({'route': location, 'question': q.get('id'), 'length': len(q.get('question', '')), 'text': q.get('question')})

    index = read(args.public/'data/index.json')
    if not index:
        raise SystemExit('Index could not be read')
    books = index.get('books', [])
    if len(books) != 44:
        error('index', f'expected 44 books, found {len(books)}')
    if len({b['id'] for b in books}) != len(books):
        error('index', 'duplicate books')
    for book in books:
        book_id = book['id']
        subjects[book.get('subject', 'math')] += 1
        counts['books'] += 1
        folder = args.public/'data/books'/book_id
        outline = read(folder/'outline.json')
        if not outline:
            continue
        visit(outline, f'{book_id}/outline')
        routes.add(f'/book/{book_id}/')
        lessons = {}
        listed = outline.get('lessons', [])
        if len(listed) != book.get('lessonsCount'):
            error(book_id, 'index lessonsCount differs from outline')
        for meta in listed:
            lesson = read(folder/'lessons'/f'{meta["id"]}.json')
            if not lesson:
                continue
            lessons[meta['id']] = lesson
            counts['lessons'] += 1
            route = f'/lesson/{book_id}/{meta["id"]}/'
            routes.add(route)
            if lesson.get('id') != meta['id'] or lesson.get('bookId') != book_id:
                error(meta['id'], 'lesson id/book mismatch')
            lesson_sizes[len(lesson.get('questions', []))] += 1
            questions(lesson.get('questions'), route)
            visit(lesson, meta['id'])
            knowledge = lesson.get('knowledge')
            if not knowledge:
                no_knowledge.append(meta['id'])
            else:
                long_knowledge.append({'route': route, 'length': len(knowledge.get('core_concept', '')), 'text': knowledge.get('core_concept')})
                for key in ('core_concept', 'key_formula', 'tips'):
                    if knowledge.get(key):
                        counts['knowledge_text_fields'] += 1
                        if knowledge.get('audio', {}).get(key):
                            counts['knowledge_audio_fields'] += 1
        if len(lessons) != len(set(meta['id'] for meta in listed)):
            error(book_id, 'duplicate or missing outline lesson ids')
        for unit in outline.get('units', []):
            counts['units'] += 1
            n = unit['unit_number']
            routes.add(f'/book/{book_id}/guide/{n}/')
            actual = [l for l in lessons.values() if l['unitNumber'] == n and l.get('knowledge')]
            old = [lessons[k]['knowledge'] for i in range(1, len(unit.get('knowledge_points', [])) + 1)
                   if (k := f'{book_id}-u{n}-kp{i}') in lessons and lessons[k].get('knowledge')]
            if len(actual) != len(old):
                legacy_guide_omissions.append({'route': f'/book/{book_id}/guide/{n}/', 'actual': len(actual), 'previous': len(old)})
        for kind, flag in [('passages', 'hasPassages'), ('stories', 'hasStories')]:
            path = folder/f'{kind}.json'
            if bool(book.get(flag)) != path.exists():
                error(book_id, f'{flag} differs from {kind} file presence')
            if not path.exists():
                continue
            doc = read(path)
            if not doc:
                continue
            visit(doc, f'{book_id}/{kind}')
            items = doc.get(kind, [])
            if not items:
                error(book_id, f'empty {kind}')
            prefix = 'reading' if kind == 'passages' else 'stories'
            routes.add(f'/{prefix}/{book_id}/')
            for item in items:
                route = f'/{prefix}/{book_id}/{item["id"]}/'
                routes.add(route)
                counts[kind] += 1
                if item.get('bookId') != book_id:
                    error(route, 'book id mismatch')
                sentences = item.get('sentences', [])
                if not sentences or any(not s.get('text', '').strip() for s in sentences):
                    error(route, 'empty sentence data')
                counts[f'{kind}_sentences'] += len(sentences)
                counts[f'{kind}_sentence_audio'] += sum(bool(s.get('audio')) for s in sentences)
                sample = {'route': route, 'sentences': len(sentences), 'length': sum(len(s.get('text', '')) for s in sentences)}
                if kind == 'stories':
                    questions(item.get('questions'), route, story=True)
                    counts['story_images'] += bool(item.get('image'))
                    long_stories.append(sample)
                else:
                    counts['passages_with_original_pages'] += bool(item.get('pageImages'))
                    long_passages.append(sample)

    for key, expected in [('totalLessons', counts['lessons']), ('totalQuestions', counts['lesson_questions'])]:
        if index.get(key) != expected:
            error('index', f'{key}: index={index.get(key)}, actual={expected}')
    image_dimensions = collections.Counter()
    media_counts = collections.Counter()
    for reference in sorted(references):
        path = args.public/reference.lstrip('/')
        if not path.is_file() or path.stat().st_size == 0:
            error(reference, 'missing or empty media')
            continue
        media_counts[reference.split('/')[1]] += 1
        if reference.startswith('/audio/'):
            with path.open('rb') as f:
                header = f.read(4)
                if header != b'OggS':
                    if header.startswith(b'ID3') or (len(header) >= 2 and header[0] == 0xff and header[1] & 0xe0 == 0xe0):
                        if path.suffix.lower() != '.mp3':
                            media_format_mismatches.append({'path': reference, 'content_type': 'audio/mpeg'})
                    else:
                        error(reference, 'unrecognized audio signature')
        elif path.suffix.lower() in {'.jpg', '.jpeg'}:
            try:
                w, h = image_size(path)
                image_dimensions[f'{reference.split("/")[1]}:{w}x{h}'] += 1
                with path.open('rb') as f:
                    if f.read(8) == b'\x89PNG\r\n\x1a\n':
                        media_format_mismatches.append({'path': reference, 'content_type': 'image/png'})
            except ValueError as exc:
                error(reference, str(exc))

    missing_routes = []
    if args.site.exists():
        for route in sorted(routes):
            file = args.site/route.lstrip('/')/'index.html'
            if not file.is_file():
                missing_routes.append(route)
        for route in missing_routes:
            error(route, 'expected static route has no index.html')
        if not (args.site/'404.html').is_file():
            error('/404', 'missing static fallback')
    else:
        error(str(args.site), 'static export directory does not exist')
    report = {
        'created_at': datetime.now(timezone.utc).isoformat(), 'counts': dict(counts),
        'subjects': dict(subjects), 'question_types': dict(question_types),
        'lesson_question_counts': dict(sorted(lesson_sizes.items())),
        'expected_routes': len(routes), 'missing_routes': missing_routes,
        'unique_media': dict(media_counts), 'media_references': dict(media_refs),
        'image_dimensions': dict(image_dimensions), 'integrity_errors': errors,
        'warnings': {'lessons_without_knowledge': len(no_knowledge), 'lessons_without_knowledge_examples': no_knowledge[:10],
                     'one_question_lessons': lesson_sizes[1], 'control_character_fields': len(control_characters),
                     'control_character_examples': control_characters[:20], 'raw_latex_fields': len(latex_warnings),
                     'raw_latex_examples': latex_warnings[:10], 'previous_guide_omissions': legacy_guide_omissions},
        'pressure_samples': {'options': sorted(long_options, key=lambda p:p['length'], reverse=True)[:10],
                             'questions': sorted(long_questions, key=lambda p:p['length'], reverse=True)[:10],
                             'knowledge': sorted(long_knowledge, key=lambda p:p['length'], reverse=True)[:5],
                             'stories': sorted(long_stories, key=lambda p:p['length'], reverse=True)[:5],
                             'passages': sorted(long_passages, key=lambda p:p['length'], reverse=True)[:5]},
    }
    report['media_format_mismatches'] = dict(collections.Counter(item['content_type'] for item in media_format_mismatches))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({key:report[key] for key in ['counts', 'subjects', 'question_types', 'expected_routes', 'unique_media', 'image_dimensions']}, ensure_ascii=False, indent=2))
    print(f'Integrity errors: {len(errors)}; full report: {args.report}')
    for item in errors[:20]:
        print(item)
    raise SystemExit(bool(errors))


if __name__ == '__main__':
    main()
