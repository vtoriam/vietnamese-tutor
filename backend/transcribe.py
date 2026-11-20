"""Transcribe a Vietnamese audio file with PhoWhisper.

Usage:
    python transcribe.py path/to/audio.wav
    python transcribe.py path/to/audio.wav --model vinai/PhoWhisper-medium

From other code:
    from transcribe import transcribe
    text = transcribe("path/to/audio.wav")

Needs: pip install transformers torch
       ffmpeg installed on the system (used to read and resample the audio)
"""
import argparse
from functools import lru_cache

import torch
from transformers import pipeline

DEFAULT_MODEL = "vinai/PhoWhisper-small"


@lru_cache(maxsize=2)
def _load_pipeline(model_id: str):
    """Load the model once and reuse it. Loading is slow, so never do it per request."""
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    return pipeline(
        "automatic-speech-recognition",
        model=model_id,
        device=device,
        chunk_length_s=30,  # lets clips longer than 30 s work; harmless for short clips
    )


def transcribe(audio_path: str, model_id: str = DEFAULT_MODEL) -> str:
    """Return the transcription of the audio file as a string."""
    asr = _load_pipeline(model_id)
    result = asr(
        audio_path,
        generate_kwargs={"language": "vi", "task": "transcribe"},  # skip language guessing
    )
    return result["text"].strip()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transcribe Vietnamese audio with PhoWhisper")
    parser.add_argument("audio", help="path to an audio file (wav, mp3, m4a, webm, ...)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Hugging Face model id")
    args = parser.parse_args()
    print(transcribe(args.audio, args.model))