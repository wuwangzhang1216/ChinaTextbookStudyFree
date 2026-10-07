#!/usr/bin/env python3
"""Bundle audio for the reviewed lessons and deterministic UX content repairs."""
import gzip
import hashlib
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps/web/public"
lessons = {json.loads(p.read_text())["lesson_id"] for p in (ROOT / "docs/lesson-reviews").glob("*.json")}
lessons.update(c["lesson_id"] for c in json.loads((ROOT / "docs/ux-content-corrections.json").read_text()))
files = set()

def collect(value):
    if isinstance(value, dict):
        for item in value.values():
            collect(item)
    elif isinstance(value, list):
        for item in value:
            collect(item)
    elif isinstance(value, str) and value.startswith("/audio/"):
        base = Path(value.lstrip("/"))
        files.update((base.with_suffix(".opus"), base.with_suffix(".mp3")))

for lesson in sorted(lessons):
    book = lesson.split("-u")[0]
    collect(json.loads((PUBLIC / "data/books" / book / "lessons" / f"{lesson}.json").read_text()))

bundle = ROOT / "deploy-output/ux-content-audio.tar.gz"
bundle.parent.mkdir(exist_ok=True)
entries = []
with bundle.open("wb") as output, gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0) as compressed, tarfile.open(fileobj=compressed, mode="w|") as archive:
    for relative in sorted(files):
        source = PUBLIC / relative
        content = source.read_bytes()
        assert content, f"Empty audio: {relative}"
        info = archive.gettarinfo(str(source), arcname=str(relative))
        info.uid = info.gid = 0
        info.uname = info.gname = ""
        info.mtime = 0
        info.mode = 0o644
        with source.open("rb") as stream:
            archive.addfile(info, stream)
        entries.append({"path": str(relative), "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})

manifest = {"base_assets": "v1.2.0-assets", "release_tag": "v1.3.0-ux-content", "reviewed_lessons": 137,
            "covered_lessons": len(lessons), "bundle": bundle.name, "sha256": hashlib.sha256(bundle.read_bytes()).hexdigest(),
            "bytes": bundle.stat().st_size, "files": entries}
(ROOT / "docs/ux-content-assets.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"Bundled {len(entries)} files for {len(lessons)} lessons: {manifest['bytes']} bytes; SHA256 {manifest['sha256']}")
