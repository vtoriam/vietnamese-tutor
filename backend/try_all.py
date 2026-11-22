import time
from pathlib import Path

from transcribe import transcribe

AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"}
folder = Path(__file__).parent / "test_audio"   # works from any folder
files = sorted(f for f in folder.iterdir() if f.suffix.lower() in AUDIO_EXTS)

if not files:
    raise SystemExit(f"No audio files found in {folder}")

# Warm-up: loads the model so loading time is not counted below
try:
    transcribe(str(files[0]))
except Exception:
    pass

for f in files:
    t = time.time()
    try:
        text = transcribe(str(f))
        print(f"{f.name:25} {time.time() - t:5.1f}s  {text!r}")
    except Exception as e:
        print(f"{f.name:25} FAILED: {type(e).__name__}: {e}")