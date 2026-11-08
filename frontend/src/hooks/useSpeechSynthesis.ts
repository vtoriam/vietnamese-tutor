import { useCallback, useEffect, useState } from "react";

export function useSpeechSynthesis() {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      return;
    }

    const updateVoice = () => {
      const vietnameseVoice = window.speechSynthesis
        .getVoices()
        .find((candidate) => candidate.lang.toLowerCase().startsWith("vi"));
      setVoice(vietnameseVoice ?? null);
    };

    updateVoice();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", updateVoice);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!voice) {
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = "vi-VN";
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    },
    [voice],
  );

  return { canSpeak: voice !== null, speak };
}
