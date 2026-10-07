#!/usr/bin/env python3
"""Generate missing speech for deterministic UX repairs with installed macOS TTS."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "apps/web/public"
REPORT = ROOT / "docs/ux-repair-evidence/tts-repairs.json"
records = json.loads(REPORT.read_text()) if REPORT.exists() else []
corrections = json.loads((ROOT / "docs/ux-content-corrections.json").read_text())
phonetics = {"xíng": "形", "háng": "航", "hàng": "沆"}
added = 0
for correction in corrections:
    lesson = correction["lesson_id"]
    book = lesson.split("-u")[0]
    data = json.loads((PUBLIC / "data/books" / book / "lessons" / f"{lesson}.json").read_text())
    question = next(q for q in data["questions"] if q["id"] == correction["question_id"])
    fields = [("question", question["question"]), ("explanation", question["explanation"])]
    fields.extend((f"options[{i}]", text) for i, text in enumerate(question["options"]))
    for field, text in fields:
        normalized = " ".join(text.split())
        digest = hashlib.sha1(normalized.encode()).hexdigest()
        relative = Path("audio") / digest[:2] / f"{digest}.opus"
        target = PUBLIC / relative
        if target.exists():
            continue
        target.parent.mkdir(exist_ok=True)
        spoken = phonetics.get(text, text)
        if lesson == "chinese-g2down-u6-kp4" and field == "explanation":
            spoken = "行是多音字。在银行中读航的音，在行走中读形的音。"
        spoken = spoken.replace(" + ", " 加 ").replace(" - ", " 减 ").replace(" = ", " 等于 ")
        with tempfile.TemporaryDirectory() as directory:
            aiff = Path(directory) / "speech.aiff"
            subprocess.run(["say", "-v", "Tingting", "-r", "155", "-o", str(aiff), spoken], check=True)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(aiff),
                            "-c:a", "libopus", "-b:a", "48k", "-ac", "1", str(target)], check=True)
        records.append({"lesson": lesson, "question_id": question["id"], "field": field, "text": text,
                        "audio": str(relative), "provider": "macOS Tingting, local synthesis",
                        "spoken_text": spoken, "teacher_review": "pending"})
        added += 1
REPORT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
print(f"Generated {added} local audio assets; {len(records)} total UX speech repairs; teacher review pending.")
