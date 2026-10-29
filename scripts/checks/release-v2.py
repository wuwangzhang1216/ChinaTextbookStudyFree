"""Exercise split-package fresh installs, upgrades, corruption and path isolation."""
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pack = load('packager', ROOT / 'scripts/package-release.py')
alias = load('aliases', ROOT / 'scripts/tts/apply_audio_versions.py')
guide = load('guide', ROOT / 'scripts/release-download-guide.py')
with tempfile.TemporaryDirectory() as temporary:
    tmp = Path(temporary);cache = tmp / 'archives';cache.mkdir()
    assets, records = [], []

    def archive(name, kind, destinations, members):
        with zipfile.ZipFile(cache / name, 'w') as z:
            for path, payload in members.items():
                z.writestr(path, payload)
                records.append({'archive': name, 'path': path, 'bytes': len(payload),
                                'sha256': hashlib.sha256(payload).hexdigest()})
        raw = (cache / name).read_bytes()
        assets.append({'name': name, 'kind': kind, 'destinations': destinations,
                       'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                       'files': len(members), 'uncompressed_bytes': sum(map(len, members.values()))})

    for i in (1, 2):
        archive(f'audio-original-part{i:02d}.zip', 'audio-original', {'source': 'apps/web/public', 'static': '.'},
                {f'audio/aa/{i}.opus': f'new original {i}'.encode()})
        archive(f'audio-web-part{i:02d}.zip', 'audio-web', {'source': 'apps/web/public', 'static': '.'},
                {f'audio/aa/{i}.mp3': f'new web {i}'.encode()})
    archive('data.zip', 'data', {'source': 'apps/web/public/data', 'static': 'data'}, {'index.json': b'{"new":true}'})
    archive('web-app.zip', 'web', {'static': '.'}, {'index.html': b'current page', 'sw.js': b'current cache version'})
    archive('web-source.zip', 'source', {'source': '.'}, {'README.md': b'current instructions'})
    archive('data-source.zip', 'source-data', {'source': 'data'}, {'passages/fixture.json': b'{"passages":[]}'})

    def manifest():
        inventory = ''.join(json.dumps(r) + '\n' for r in records).encode()
        (cache / 'files.jsonl').write_bytes(inventory)
        value = {'schema_version': 2, 'tag': 'fixture', 'assets': assets,
                 'file_inventory': {'name': 'files.jsonl', 'bytes': len(inventory), 'sha256': hashlib.sha256(inventory).hexdigest()}}
        (cache / 'manifest.json').write_text(json.dumps(value))

    manifest()

    # A platform's download links must use its own release, while entry points
    # stay on the primary release. Old single-release manifests remain valid.
    bundle = lambda name: {'name': name, 'bytes': 1, 'sha256': 'fixture'}
    ios_entry = {'bookId': 'g1up', 'data': bundle('data-g1up.zip'), 'audio': bundle('audio-ios-g1up.zip')}
    guide_manifest = {'schema_version': 2, 'tag': 'v1.7.0', 'resource_tag': 'v1.7.0-web-resources',
                      'ios_resource_tag': 'v1.7.0-ios-resources', 'assets': assets + [
                          {'name': 'install-release.py', 'kind': 'installer'},
                          {'name': 'INSTALL.md', 'kind': 'instructions'},
                          dict(ios_entry['data'], kind='ios-data'), dict(ios_entry['audio'], kind='ios-audio')]}
    book_index = {'books': [{'id': 'g1up', 'subject': 'math', 'grade': 1, 'semester': 'up', 'textbookName': '一年级上册'}]}
    rendered = guide.render(guide_manifest, {'books': [ios_entry]}, book_index)
    for path in ['/v1.7.0/install-release.py', '/v1.7.0/INSTALL.md', '/v1.7.0/SHA256SUMS',
                 '/v1.7.0-web-resources/web-source.zip', '/v1.7.0-web-resources/data.zip',
                 '/v1.7.0-ios-resources/data-g1up.zip', '/v1.7.0-ios-resources/audio-ios-g1up.zip']:
        assert path in rendered, path
    del guide_manifest['resource_tag'], guide_manifest['ios_resource_tag']
    legacy_guide = guide.render(guide_manifest, {'books': [ios_entry]}, book_index)
    assert '/v1.7.0/data-g1up.zip' in legacy_guide and '/v1.7.0/data.zip' in legacy_guide

    # Per-asset tags allow a code patch to reuse old data/audio without duplicate
    # uploads. Destinations are still restricted to this repository's releases.
    reused = dict(guide_manifest, resource_tag='v1.8.1-web-resources')
    reused['assets'] = [dict(a, release_tag='v1.8.0-web-resources') if a['name']=='data.zip' else a for a in guide_manifest['assets']]
    links = guide.render(reused, {'books': [ios_entry]}, book_index)
    assert '/v1.8.0-web-resources/data.zip' in links
    assert '/v1.8.1-web-resources/web-app.zip' in links
    installer = load('installer_reuse', ROOT/'scripts/install-release.py')
    assert installer.asset_base(reused, 'v1.8.1', {'release_tag': 'v1.8.0-web-resources'}).endswith('/v1.8.0-web-resources')
    for bad in ['../escape', 'https://evil.invalid', 'x/y']:
        try: installer.asset_base(reused, 'v1.8.1', {'release_tag': bad})
        except ValueError: pass
        else: raise AssertionError('unsafe release override accepted')

    # Exercise the actual downloader with recorded URLs and real SHA verification.
    import shutil
    from unittest.mock import patch
    original = json.loads((cache/'manifest.json').read_text())
    original['resource_tag'] = 'fixture-new'
    original['assets'][0]['release_tag'] = 'fixture-old'
    (cache/'manifest.json').write_text(json.dumps(original))
    urls = []
    def retrieve(url, destination):
        urls.append(url)
        shutil.copyfile(cache/url.rsplit('/', 1)[1], destination)
    with patch.object(sys, 'argv', ['installer', '--tag', 'fixture', '--mode', 'static', '--root', str(tmp/'remote-install')]), patch.object(installer.urllib.request, 'urlretrieve', retrieve):
        installer.main()
    assert any('/fixture-old/'+assets[0]['name'] in url for url in urls)
    assert any('/fixture-new/web-app.zip' in url for url in urls)
    manifest()  # Restore the ordinary fixture for the existing upgrade checks.

    def run(target, mode='static', extra=(), success=True):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/install-release.py'), '--tag', 'fixture',
                                 '--root', str(target), '--mode', mode, '--archives-dir', str(cache), *extra],
                                capture_output=True, text=True)
        assert (result.returncode == 0) == success, result.stdout + result.stderr
        return result

    fresh = tmp / 'fresh';run(fresh);run(fresh, extra=['--verify-only'])
    ci = tmp / 'ci-source-data'
    run(ci, mode='source', extra=['--asset-kind', 'source-data'])
    run(ci, mode='source', extra=['--asset-kind', 'source-data', '--verify-only'])
    assert (ci / 'data/passages/fixture.json').read_bytes() == b'{"passages":[]}'
    assert not (ci / 'apps').exists(), 'CI source-only install must not download/install audio'
    assert json.loads((ci / 'ASSETS-VERSION.json').read_text())['installed_asset_kinds'] == ['source-data']
    absent = tmp / 'missing-kind'
    run(absent, mode='source', extra=['--asset-kind', 'absent'], success=False)
    assert not absent.exists()
    upgrade = tmp / 'upgrade';(upgrade / 'audio/aa').mkdir(parents=True)
    (upgrade / 'index.html').write_bytes(b'old page');(upgrade / 'audio/aa/1.mp3').write_bytes(b'old GPT')
    (upgrade / 'notes.txt').write_bytes(b'keep custom file')
    run(upgrade);run(upgrade, extra=['--verify-only'])
    assert (upgrade / 'notes.txt').read_bytes() == b'keep custom file'
    for p in fresh.rglob('*'):
        if p.is_file():assert p.read_bytes() == (upgrade / p.relative_to(fresh)).read_bytes()
    source = tmp / 'source';run(source, mode='source', extra=['--with-source'])
    run(source, mode='source', extra=['--with-source', '--verify-only'])
    assert (source / 'README.md').read_bytes() == b'current instructions'
    (upgrade / 'audio/aa/1.mp3').write_bytes(b'corrupt installed file')
    run(upgrade, extra=['--verify-only'], success=False)
    run(upgrade)
    # The last corrupt split must prevent every installed file from changing.
    before = {p.relative_to(upgrade): p.read_bytes() for p in upgrade.rglob('*') if p.is_file()}
    audio = cache / 'audio-web-part02.zip';original = audio.read_bytes();audio.write_bytes(b'broken part')
    run(upgrade, success=False)
    assert all((upgrade / rel).read_bytes() == raw for rel, raw in before.items())
    audio.unlink();run(upgrade, success=False);audio.write_bytes(original)
    # A malicious but correctly checksummed archive still cannot escape staging.
    archive('escape.zip', 'data', {'static': '.'}, {'../escaped.txt': b'bad'})
    manifest();run(upgrade, success=False)
    assert not (tmp / 'escaped.txt').exists()
    assert all((upgrade / rel).read_bytes() == raw for rel, raw in before.items())
    # Verify split boundaries and complete membership with differently sized files.
    entries = []
    for i, size in enumerate([500, 1600, 500, 1600]):
        p = tmp / f'{i}.mp3';p.write_bytes(b'a' * size);entries.append((p, p.name))
    chunks = pack.split_audio(entries, 6000)
    assert len(chunks) > 1 and [item for part in chunks for item in part] == entries
    inventory = (tmp / 'test-inventory.jsonl').open('w')
    for i, part in enumerate(chunks):
        out = tmp / f'part{i}.zip';pack.write_zip(out, part, inventory, stored=True);assert out.stat().st_size < 6000
    inventory.close()
    # A stale alias must fail before changing generated JSON.
    public = tmp / 'public';(public / 'audio/aa').mkdir(parents=True);(public / 'data').mkdir()
    a = public / 'audio/aa/a.mp3';b = public / 'audio/aa/a.edge-test.mp3';a.write_bytes(b'audio');b.write_bytes(b'audio')
    data = public / 'data/index.json';data.write_text('{"text":"keep text","audio":"/audio/aa/a.mp3"}')
    mapping = tmp / 'map.json';mapping.write_text(json.dumps({'mapping': {'/audio/aa/a.mp3': {'url': '/audio/aa/a.edge-test.mp3', 'sha256': hashlib.sha256(b'audio').hexdigest()}}}))
    assert alias.apply(public, mapping) == 1
    assert json.loads(data.read_text()) == {'text': 'keep text', 'audio': '/audio/aa/a.edge-test.mp3'}
    before_data = data.read_bytes();b.write_bytes(b'changed')
    try:alias.apply(public, mapping)
    except ValueError:pass
    else:raise AssertionError('Mismatched alias accepted')
    assert data.read_bytes() == before_data
    # Edition-only voice replacements must not change another book sharing text.
    b.write_bytes(b'audio')
    newer = public / 'audio/aa/a.edge-new.mp3';newer.write_bytes(b'new Edge voice')
    for book in ['chinese-g5up', 'chinese-g5up-2026']:
        folder = public / 'data/books' / book;folder.mkdir(parents=True)
        (folder / 'lesson.json').write_text('{"id":"keep-id","audio":"/audio/aa/a.mp3"}')
    scoped = {'/audio/aa/a.edge-test.mp3': {'url': '/audio/aa/a.edge-new.mp3',
              'source_sha256': hashlib.sha256(b'audio').hexdigest(),
              'sha256': hashlib.sha256(b'new Edge voice').hexdigest()}}
    config = json.loads(mapping.read_text());config['book_mapping'] = {'chinese-g5up-2026': scoped}
    mapping.write_text(json.dumps(config));assert alias.apply(public, mapping) == 2
    old = public / 'data/books/chinese-g5up/lesson.json';new = public / 'data/books/chinese-g5up-2026/lesson.json'
    assert json.loads(old.read_text()) == {'id': 'keep-id', 'audio': '/audio/aa/a.edge-test.mp3'}
    assert json.loads(new.read_text()) == {'id': 'keep-id', 'audio': '/audio/aa/a.edge-new.mp3'}
    assert alias.apply(public, mapping) == 0
    prior = new.read_bytes();newer.write_bytes(b'corrupt replacement')
    try:alias.apply(public, mapping)
    except ValueError:pass
    else:raise AssertionError('Corrupt scoped voice replacement accepted')
    assert new.read_bytes() == prior
    newer.write_bytes(b'new Edge voice')
    config['mapping'] = {};mapping.write_text(json.dumps(config))
    b.write_bytes(b'changed source')
    try:alias.apply(public, mapping)
    except ValueError:pass
    else:raise AssertionError('Changed source for scoped audio replacement accepted')
    assert new.read_bytes() == prior
    b.write_bytes(b'audio')
    for book in ['../escape', 'missing-edition']:
        config['book_mapping'] = {book: scoped};mapping.write_text(json.dumps(config))
        try:alias.apply(public, mapping)
        except ValueError:pass
        else:raise AssertionError('Invalid or absent edition for scoped audio accepted')
        assert new.read_bytes() == prior
print('PASS: split-package fresh/source installs, upgrades, preservation, corruption, missing parts, traversal and audio alias validation')
