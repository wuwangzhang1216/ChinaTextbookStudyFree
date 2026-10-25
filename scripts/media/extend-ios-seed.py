#!/usr/bin/env python3
"""Add a current textbook and its first-lesson AAC to the offline iOS seed.

Input archives are the official iOS Release assets. Both must match the
manifest before anything is written. Existing seed books stay available for
older saved progress and the portable UI-test suite.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--book", default="g1up-2026")
    parser.add_argument("--lesson", default="g1up-2026-u1-kp1")
    parser.add_argument("--seed", type=Path, default=Path(__file__).resolve().parents[2] / "apps/mobile/ChinaTextbookStudy/Resources/seed-data.zip")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    book = next(b for b in manifest["books"] if b["bookId"] == args.book)
    for kind, archive in [("data", args.data), ("audio", args.audio)]:
        expected = book[kind]
        if archive.name != expected["name"] or hashlib.sha256(archive.read_bytes()).hexdigest() != expected["sha256"]:
            raise SystemExit(f"Release checksum mismatch: {archive}")
    with ZipFile(args.seed) as original:
        files = {entry.filename: original.read(entry) for entry in original.infolist() if not entry.is_dir()}
    with ZipFile(args.data) as data:
        lesson = data.read(f"books/{args.book}/lessons/{args.lesson}.json").decode()
        for entry in data.infolist():
            if not entry.is_dir() and entry.filename.startswith(f"books/{args.book}/"):
                files["data/" + entry.filename] = data.read(entry)
    references = set(re.findall(r'/audio/([^"\s]+)\.(?:mp3|opus|m4a)', lesson))
    with ZipFile(args.audio) as audio:
        for stem in references:
            name = f"audio/{stem}.m4a"
            files[name] = audio.read(name)  # Missing AAC is a hard failure.
    temporary = args.seed.with_suffix(".next.zip")
    try:
        with ZipFile(temporary, "w", ZIP_DEFLATED) as output:
            for name, data in sorted(files.items()):
                output.writestr(name, data)
        temporary.replace(args.seed)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Added {args.book}, {len(references)} verified first-lesson AAC files; seed {args.seed.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
