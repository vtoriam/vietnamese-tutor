"""Transcribe Vietnamese audio with PhoWhisper, with optional token confidence.

Usage:
    python transcribe.py audio.wav                  # prints the transcript
    python transcribe.py audio.wav --details        # adds token confidence
    python transcribe.py audio.wav --json           # everything as JSON
    python transcribe.py audio.wav --model vinai/PhoWhisper-medium

From other code:
    from transcribe import transcribe, analyse
    text = transcribe("audio.wav")        # returns a string
    info = analyse("audio.wav")           # returns a dict (see analyse)

Needs: pip install transformers torch librosa
"""
import argparse
import json
import math
from functools import lru_cache

import librosa
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

DEFAULT_MODEL = "vinai/PhoWhisper-small"
SAMPLE_RATE = 16000       # Whisper models need 16 kHz mono
LOW_CONFIDENCE = 0.6      # token probability below this is marked "low"


@lru_cache(maxsize=2)
def _load(model_id):
    """Load once and reuse. Loading is slow, so never do it per request."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = AutoProcessor.from_pretrained(model_id)
    model = AutoModelForSpeechSeq2Seq.from_pretrained(model_id).to(device).eval()
    return processor, model, device


def analyse(audio_path, model_id=DEFAULT_MODEL):
    """Return a dict: text, tokens (each with confidence), mean_confidence, min_confidence."""
    processor, model, device = _load(model_id)
    speech, _ = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)

    inputs = processor(speech, sampling_rate=SAMPLE_RATE, return_tensors="pt").to(device)
    with torch.no_grad():
        out = model.generate(
            inputs.input_features,
            language="vi",
            task="transcribe",
            return_dict_in_generate=True,
            output_scores=True,
        )
    text = processor.batch_decode(out.sequences, skip_special_tokens=True)[0].strip()

    # Log probability of each token the model chose.
    logp = model.compute_transition_scores(
        out.sequences, out.scores, normalize_logits=True
    )[0]
    # The scores only cover generated tokens, so take that many from the end.
    generated = out.sequences[0][-logp.shape[0]:]

    tokens = []
    for token_id, lp in zip(generated.tolist(), logp.tolist()):
        piece = processor.tokenizer.decode([token_id], skip_special_tokens=False)
        if piece.startswith("<|"):  # control tokens
            continue
        p = math.exp(lp)
        tokens.append({"token": piece.strip(), "confidence": round(p, 3), "low": p < LOW_CONFIDENCE})

    probs = [t["confidence"] for t in tokens]
    return {
        "text": text,
        "tokens": tokens,
        "mean_confidence": round(sum(probs) / len(probs), 3) if probs else None,
        "min_confidence": min(probs) if probs else None,
    }


def transcribe(audio_path, model_id=DEFAULT_MODEL):
    """Return the transcription of the audio file as a string."""
    return analyse(audio_path, model_id)["text"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transcribe Vietnamese audio with PhoWhisper")
    parser.add_argument("audio", help="path to an audio file")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Hugging Face model id")
    parser.add_argument("--details", action="store_true", help="also print token confidence")
    parser.add_argument("--json", action="store_true", help="print everything as JSON")
    args = parser.parse_args()

    if args.json:
        print(json.dumps(analyse(args.audio, args.model), ensure_ascii=False, indent=2))
    elif args.details:
        info = analyse(args.audio, args.model)
        print(info["text"])
        print("\n=== TOKEN CONFIDENCE ===")
        for t in info["tokens"]:
            flag = "  <-- low confidence" if t["low"] else ""
            print(f"'{t['token']}' | {t['confidence'] * 100:.1f}%{flag}")
        print(f"\nmean {info['mean_confidence']} | min {info['min_confidence']}")
    else:
        print(transcribe(args.audio, args.model))