import time, pathlib
from transcribe import transcribe

files = sorted(pathlib.Path("test_audio").glob("*"))
transcribe(str(files[0]))  # warm-up: loads the model, so it is not timed below

for f in files:
    t = time.time()
    text = transcribe(str(f))
    print(f"{f.name:25} {time.time() - t:5.1f}s  {text!r}")