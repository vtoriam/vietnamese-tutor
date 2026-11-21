import librosa
from transformers import WhisperProcessor, WhisperForConditionalGeneration

M = "vinai/PhoWhisper-small"
proc = WhisperProcessor.from_pretrained(M)
model = WhisperForConditionalGeneration.from_pretrained(M)

audio, _ = librosa.load("test_audio/output2.wav", sr=16000)
feats = proc(audio, sampling_rate=16000, return_tensors="pt").input_features
out = model.generate(
    feats, language="vi", task="transcribe",
    num_beams=5, num_return_sequences=5,
    return_dict_in_generate=True, output_scores=True,
)
for text, score in zip(proc.batch_decode(out.sequences, skip_special_tokens=True),
                       out.sequences_scores):
    print(f"{score:.2f}  {text!r}")