import subprocess
import tempfile
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from feedback import find_differences

MAX_AUDIO_BYTES = 10 * 1024 * 1024
MIN_DURATION_SECONDS = 0.5
MAX_DURATION_SECONDS = 5.0
AUDIO_DIRECTORY = Path(__file__).parent / "Audio"
AUDIO_FILES = {
    "pilot_001": "xinchao.m4a",
    "pilot_002": "bankhoekhong.m4a",
    "pilot_004": "xinloi.m4a",
    "pilot_010": "Oigioioi.m4a",
    "pilot_011": "dungroi.m4a",
}

app = FastAPI(title="Vietnamese Pronunciation Tutor API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https://.*\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = {}
attempts = {}
attempts_lock = Lock()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def error_attempt(attempt_id, code, message):
    with attempts_lock:
        attempt = attempts[attempt_id]
        attempt["status"] = "failed"
        attempt["error"] = {"code": code, "message": message}


def wav_duration_seconds(path):
    with wave.open(str(path), "rb") as wav_file:
        return wav_file.getnframes() / float(wav_file.getframerate())


def convert_to_wav(source_path, wav_path):
    command = [
        "ffmpeg", "-y", "-i", str(source_path),
        "-vn", "-ac", "1", "-ar", "16000",
        str(wav_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "FFmpeg could not convert the audio")


def deterministic_feedback(target_text, transcript, confidence):
    differences = find_differences(target_text, transcript)
    items = []
    for difference in differences:
        category = "other" if difference["category"] == "vowel" else difference["category"]
        if category == "other":
            explanation = "The recogniser heard a difference from the target text."
            tip = "Slow down and pronounce each part of the word clearly."
        elif category == "tone":
            explanation = "The recogniser heard a tone that differs from the target tone."
            tip = "Hold the expected tone shape from start to finish."
        elif category == "initial_consonant":
            explanation = "The recogniser heard an initial consonant that differs from the target."
            tip = "Repeat the first consonant slowly, then add the rest of the syllable."
        else:
            explanation = "The recogniser heard a final consonant that differs from the target."
            tip = "Focus on the ending sound and keep it clear."
        items.append({
            "word_index": difference["word_index"],
            "expected": difference["expected"],
            "heard": difference["heard"],
            "category": category,
            "explanation": explanation,
            "tip": tip,
            "estimated_from_transcript": True,
        })

    if items:
        summary = "Good effort. The transcript suggests a few pronunciation differences to review."
    else:
        summary = "Good effort. The recogniser did not find any differences from the target text."
    return {"summary": summary, "items": items, "acoustic": None}


def process_attempt(attempt_id, source_path, target_text):
    wav_path = None
    try:
        from transcribe import analyse

        with attempts_lock:
            attempts[attempt_id]["status"] = "transcribing"

        wav_path = Path(source_path).with_name("normalized.wav")
        convert_to_wav(source_path, wav_path)

        duration = wav_duration_seconds(wav_path)
        if duration < MIN_DURATION_SECONDS:
            error_attempt(attempt_id, "AUDIO_TOO_SHORT", "The recording was too short.")
            return
        if duration > MAX_DURATION_SECONDS:
            error_attempt(attempt_id, "AUDIO_TOO_LONG", "The recording was longer than 5 seconds.")
            return

        asr = analyse(str(wav_path))
        transcript = asr["text"].strip()
        with attempts_lock:
            attempts[attempt_id]["transcript"] = transcript or None

        if not transcript:
            error_attempt(attempt_id, "NO_SPEECH_DETECTED", "No speech could be detected.")
            return

        with attempts_lock:
            attempts[attempt_id]["status"] = "analysing"

        confidence = {
            "mean": asr["mean_confidence"],
            "min": asr["min_confidence"],
        }
        feedback = deterministic_feedback(target_text, transcript, confidence)
        with attempts_lock:
            attempts[attempt_id]["status"] = "done"
            attempts[attempt_id]["feedback"] = feedback
    except Exception as exc:
        error_attempt(
            attempt_id,
            "ANALYSIS_FAILED",
            f"Could not analyse the recording: {exc}",
        )
    finally:
        for path in (source_path, wav_path):
            if path:
                try:
                    Path(path).unlink(missing_ok=True)
                except OSError:
                    pass
        try:
            Path(source_path).parent.rmdir()
        except OSError:
            pass


@app.post("/sessions", status_code=201)
async def create_session():
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    session = {"session_id": session_id, "created_at": utc_now()}
    sessions[session_id] = session
    return session


@app.get("/audio/{prompt_id}")
async def get_prompt_audio(prompt_id: str):
    filename = AUDIO_FILES.get(prompt_id)
    if filename is None:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Audio not found"})

    audio_path = AUDIO_DIRECTORY / filename
    if not audio_path.is_file():
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Audio file not found"})

    return FileResponse(audio_path, media_type="audio/mp4")


@app.post("/attempts", status_code=202)
async def create_attempt(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    prompt_id: str = Form(...),
    target_text: str = Form(...),
    unit: str = Form(...),
    dialect: str = Form("north"),
    feedback_language: str = Form("en"),
    audio: UploadFile = File(...),
):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Unknown session_id"})
    if unit not in {"word", "phrase", "sentence"}:
        raise HTTPException(status_code=400, detail={"code": "INVALID_REQUEST", "message": "Invalid unit"})
    if dialect != "north" or feedback_language != "en":
        raise HTTPException(status_code=400, detail={"code": "INVALID_REQUEST", "message": "Invalid dialect or feedback language"})

    audio_bytes = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail={"code": "AUDIO_TOO_LARGE", "message": "Audio file is too large"})

    if not audio_bytes:
        raise HTTPException(status_code=400, detail={"code": "INVALID_REQUEST", "message": "Audio file is empty"})

    attempt_id = f"att_{uuid.uuid4().hex[:8]}"
    attempt = {
        "attempt_id": attempt_id,
        "session_id": session_id,
        "prompt_id": prompt_id,
        "status": "uploading",
        "created_at": utc_now(),
        "transcript": None,
        "feedback": None,
        "error": None,
    }
    with attempts_lock:
        attempts[attempt_id] = attempt

    suffix = Path(audio.filename or "recording").suffix.lower() or ".wav"
    if suffix not in {".wav", ".webm", ".mp3", ".m4a", ".ogg", ".flac", ".mp4"}:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_AUDIO", "message": "Unsupported audio format"})

    temporary_directory = tempfile.mkdtemp(prefix="vietnamese-tutor-")
    source_path = str(Path(temporary_directory) / f"input{suffix}")
    Path(source_path).write_bytes(audio_bytes)

    background_tasks.add_task(process_attempt, attempt_id, source_path, target_text)
    return {"attempt_id": attempt_id, "status": "uploading"}


@app.get("/attempts/{attempt_id}")
async def get_attempt(attempt_id: str):
    with attempts_lock:
        attempt = attempts.get(attempt_id)
        if attempt is None:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Attempt not found"})
        return dict(attempt)
