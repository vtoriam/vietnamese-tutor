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
import unicodedata

LLM_MODEL = "claude-sonnet-5-5"   # check the Anthropic model list for a pinned snapshot id
EFFORT = "low"                    # low / medium / high / xhigh / max; choose in the pilot
MAX_OUTPUT_TOKENS = 2000          # thinking counts toward this, so leave room for it

# Combining marks that carry the six Vietnamese tones (ngang has no mark).
TONE_MARKS = {"\u0300": "huyền", "\u0301": "sắc", "\u0309": "hỏi", "\u0303": "ngã", "\u0323": "nặng"}
CATEGORIES = ["tone", "initial_consonant", "final_consonant", "other"]

SYSTEM_PROMPT = """You are a pronunciation tutor for English-speaking learners of Vietnamese (Northern dialect).
You explain differences that have ALREADY been detected. You do not decide whether a difference exists.
Rules:
- Use only the fields in the input. Never say you heard the audio. Never describe sounds the input does not describe.
- Cover tones, initial consonants and final consonants only. No grammar or vocabulary comments.
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


def split_tone(syllable):
    """Return (letters without the tone mark, tone name). Vowel marks like ơ or ă are kept."""
    tone, base = "ngang", []
    for ch in unicodedata.normalize("NFD", syllable.lower()):
        if ch in TONE_MARKS:
            tone = TONE_MARKS[ch]
        else:
            base.append(ch)
    return unicodedata.normalize("NFC", "".join(base)), tone


def find_differences(target, transcript):
    """Compare target and transcript word by word. Plain code, no LLM.

    Same letters but a different tone mark -> "tone". Anything else -> "other".
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
        exp_base, exp_tone = split_tone(exp)
        heard_base, heard_tone = split_tone(heard)
        if (exp_base, exp_tone) == (heard_base, heard_tone):
            continue
        diff = {"word_index": i, "expected": exp, "heard": heard}
        if exp_base == heard_base:
            diff.update(category="tone", expected_tone=exp_tone, heard_tone=heard_tone)
        else:
            diff["category"] = "other"
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

    client = Anthropic()
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