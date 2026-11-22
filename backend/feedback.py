"""Turn a PhoWhisper transcript into structured LLM feedback.

Pipeline: audio -> transcribe.analyse -> find_differences (plain code) -> LLM explains.

Usage:
    export ANTHROPIC_API_KEY=...     # keep the key on the backend only
    python feedback.py audio.wav --target "phở" --meaning "pho (noodle soup)"

Needs: pip install anthropic   (plus what transcribe.py needs)
NOT TESTED against the real API. Check parameter names in the Anthropic docs.
"""
import argparse
import json
import os
import unicodedata
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

LLM_MODEL = "claude-sonnet-5-5"   # check the Anthropic model list for a pinned snapshot id
EFFORT = "low"                    # low / medium / high / xhigh / max; choose in the pilot
MAX_OUTPUT_TOKENS = 2000          # thinking counts toward this, so leave room for it

# Combining marks that carry the six Vietnamese tones (ngang has no mark).
TONE_MARKS = {"\u0300": "huyền", "\u0301": "sắc", "\u0309": "hỏi", "\u0303": "ngã", "\u0323": "nặng"}
CATEGORIES = ["tone", "vowel", "initial_consonant", "final_consonant", "other"]

SYSTEM_PROMPT = """You are a pronunciation tutor for English-speaking learners of Vietnamese (Northern dialect).
You explain differences that have ALREADY been detected. You do not decide whether a difference exists.
Rules:
- Use only the fields in the input. Never say you heard the audio. Never describe sounds the input does not describe.
- The transcript comes from a speech recogniser and may be wrong. Write "the recogniser heard..." or "the transcript suggests...", not "you said...".
- Northern dialect: d, gi and r sound the same, as do s and x, and ch and tr. A spelling difference between them is NOT an error. Never tell the learner to change one into another.
- Each detected difference lists expected_parts, heard_parts and differing_parts (initial, vowel, final, tone). Explain only the parts in differing_parts. You may say the other parts matched.
- Cover tones, vowels, initial consonants and final consonants only. No grammar or vocabulary comments.
- Write in English. Use Vietnamese only for the target word and examples.
- summary: one or two plain, encouraging sentences. No score or percentage.
- Each item: explanation (1-2 sentences, why it matters) and tip (one concrete action).
- If detected_differences is empty, return an empty items list and a short summary saying no issues were found.
- recogniser_confidence is how sure the speech recogniser was. It is not a pronunciation score.
Return JSON only."""

FEEDBACK_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "word_index": {"type": "integer"},
                    "expected": {"type": "string"},
                    "heard": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "category": {"type": "string", "enum": CATEGORIES},
                    "explanation": {"type": "string"},
                    "tip": {"type": "string"},
                },
                "required": ["word_index", "expected", "heard", "category", "explanation", "tip"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "items"],
    "additionalProperties": False,
}


# Northern dialect: letters in the same group sound the same, so a spelling difference is not an error.
INITIAL_SOUND = {"d": "z", "gi": "z", "r": "z", "s": "s", "x": "s", "ch": "c", "tr": "c",
                 "c": "k", "k": "k", "g": "gh", "gh": "gh", "ng": "ng", "ngh": "ng"}
INITIALS = ["ngh", "ng", "nh", "ph", "th", "tr", "ch", "kh", "gh", "gi", "qu",
            "b", "c", "d", "đ", "g", "h", "k", "l", "m", "n", "p", "r", "s", "t", "v", "x"]
VOWELS = "aăâeêioôơuưy"
FINALS = ["ng", "nh", "ch", "c", "m", "n", "p", "t"]
PART_CATEGORY = {"initial": "initial_consonant", "vowel": "vowel", "final": "final_consonant", "tone": "tone"}


def split_tone(syllable):
    """Return (letters without the tone mark, tone name). Vowel marks like ơ or ă are kept."""
    tone, base = "ngang", []
    for ch in unicodedata.normalize("NFD", syllable.lower()):
        if ch in TONE_MARKS:
            tone = TONE_MARKS[ch]
        else:
            base.append(ch)
    return unicodedata.normalize("NFC", "".join(base)), tone


def parse_syllable(syllable):
    """Split a syllable into initial, vowel, final and tone."""
    base, tone = split_tone(syllable)
    initial = next((i for i in INITIALS if base.startswith(i)), "")
    rest = base[len(initial):]
    if initial == "gi" and (not rest or rest[0] not in VOWELS):
        rest = "i" + rest  # in gi, gì, gin the i is also the vowel
    final = ""
    for f in FINALS:
        if rest.endswith(f) and len(rest) > len(f):
            final, rest = f, rest[: -len(f)]
            break
    vowel = "i" if rest == "y" else rest  # y and i are spelling variants
    return {"initial": initial, "vowel": vowel, "final": final, "tone": tone}


def find_differences(target, transcript):
    """Compare target and transcript word by word. Plain code, no LLM.

    Each word is split into initial, vowel, final and tone. Initials that sound
    the same in the Northern dialect (d, gi, r and so on) count as equal.
    Words are matched by position, which is fine for single words and short phrases.
    """
    clean = lambda w: w.strip(".,!?;:\"' ")
    expected_words = target.split()
    heard_words = [clean(w) for w in transcript.split() if clean(w)]
    diffs = []
    for i, exp in enumerate(expected_words):
        heard = heard_words[i] if i < len(heard_words) else None
        if heard is None:
            diffs.append({"word_index": i, "expected": exp, "heard": None, "category": "other"})
            continue
        e, h = parse_syllable(exp), parse_syllable(heard)
        differing = []
        if INITIAL_SOUND.get(e["initial"], e["initial"]) != INITIAL_SOUND.get(h["initial"], h["initial"]):
            differing.append("initial")
        for part in ("vowel", "final", "tone"):
            if e[part] != h[part]:
                differing.append(part)
        if not differing:
            continue
        diff = {
            "word_index": i, "expected": exp, "heard": heard,
            "category": PART_CATEGORY[differing[0]] if len(differing) == 1 else "other",
            "differing_parts": differing,
            "expected_parts": e, "heard_parts": h,
        }
        if "initial" not in differing and e["initial"] != h["initial"]:
            diff["note"] = f"initials {e['initial']!r} and {h['initial']!r} sound the same in the Northern dialect"
        diffs.append(diff)
    return diffs


def validate(feedback, n_words):
    """Return an error message, or None if the feedback is acceptable."""
    for item in feedback["items"]:
        if item["category"] not in CATEGORIES:
            return f"bad category {item['category']!r}"
        if not 0 <= item["word_index"] < n_words:
            return f"word_index {item['word_index']} out of range"
    return None


def get_feedback(target, meaning, transcript, confidence=None):
    """Ask the LLM to explain the detected differences. One retry on a bad response."""
    from anthropic import Anthropic  # imported here so the code above can be tested without it

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            'ANTHROPIC_API_KEY is not set. Add it to backend/.env or set it in your environment.'
        )

    client = Anthropic(api_key=api_key)
    diffs = find_differences(target, transcript)
    message = {
        "target_word": target,
        "english_meaning": meaning,
        "transcript": transcript,
        "detected_differences": diffs,
        "recogniser_confidence": confidence,
    }
    for _ in range(2):
        resp = client.messages.create(
            model=LLM_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(message, ensure_ascii=False)}],
            output_config={
                "effort": EFFORT,
                "format": {"type": "json_schema", "schema": FEEDBACK_SCHEMA},
            },
        )
        if resp.stop_reason == "max_tokens":  # cut off, so the JSON is not complete
            continue
        try:
            feedback = json.loads(resp.content[0].text)
        except (IndexError, AttributeError, json.JSONDecodeError):
            continue
        if validate(feedback, len(target.split())) is None:
            return {"detected_differences": diffs, "feedback": feedback}
    raise RuntimeError("LLM did not return valid feedback after one retry")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PhoWhisper transcript -> LLM feedback")
    parser.add_argument("audio")
    parser.add_argument("--target", required=True, help="the word or phrase the learner should say")
    parser.add_argument("--meaning", default="", help="English meaning")
    args = parser.parse_args()

    from transcribe import analyse  # loads PhoWhisper

    asr = analyse(args.audio)
    print("Transcript:", asr["text"])
    result = get_feedback(
        args.target, args.meaning, asr["text"],
        {"mean": asr["mean_confidence"], "min": asr["min_confidence"]},
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))