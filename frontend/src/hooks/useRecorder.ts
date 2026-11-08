import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "recorded" | "submitting" | "error";
export type RecorderError = "mic_blocked" | "too_short" | "unsupported";

type UseRecorderResult = {
  status: RecorderStatus;
  error: RecorderError | null;
  elapsedMs: number;
  audioUrl: string | null;
  audioBlob: Blob | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  setSubmitting: (submitting: boolean) => void;
  handleFile: (file: File | null) => void;
};

const MAX_DURATION_MS = 15_000;
const MIN_DURATION_MS = 500;

function chooseMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

export function useRecorder(): UseRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<RecorderError | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokeAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishRecording = useCallback(() => {
    const startedAt = startedAtRef.current;
    const duration = startedAt === null ? 0 : Date.now() - startedAt;
    setElapsedMs(Math.min(duration, MAX_DURATION_MS));
    clearTimer();
    releaseStream();

    if (duration < MIN_DURATION_MS) {
      chunksRef.current = [];
      setError("too_short");
      setStatus("error");
      return;
    }

    const mimeType = recorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const nextUrl = URL.createObjectURL(blob);
    audioUrlRef.current = nextUrl;
    setAudioBlob(blob);
    setAudioUrl(nextUrl);
    setStatus("recorded");
  }, [clearTimer, releaseStream]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    if (status === "recording") {
      return;
    }

    const mimeType = chooseMimeType();
    if (typeof navigator.mediaDevices?.getUserMedia !== "function" || !mimeType) {
      setError("unsupported");
      setStatus("error");
      return;
    }

    revokeAudioUrl();
    setAudioBlob(null);
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = finishRecording;
      recorder.start();
      setElapsedMs(0);
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        const startedAt = startedAtRef.current ?? Date.now();
        const nextElapsed = Date.now() - startedAt;
        setElapsedMs(Math.min(nextElapsed, MAX_DURATION_MS));
        if (nextElapsed >= MAX_DURATION_MS) {
          stop();
        }
      }, 100);
    } catch {
      releaseStream();
      setError("mic_blocked");
      setStatus("error");
    }
  }, [finishRecording, releaseStream, revokeAudioUrl, status, stop]);

  const reset = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    clearTimer();
    releaseStream();
    revokeAudioUrl();
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = null;
    setAudioBlob(null);
    setElapsedMs(0);
    setError(null);
    setStatus("idle");
  }, [clearTimer, releaseStream, revokeAudioUrl]);

  const setSubmitting = useCallback((submitting: boolean) => {
    setStatus((current) => (submitting && current === "recorded" ? "submitting" : current));
  }, []);

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) {
        return;
      }

      if (file.size === 0) {
        setError("too_short");
        setStatus("error");
        return;
      }

      revokeAudioUrl();
      const nextUrl = URL.createObjectURL(file);
      audioUrlRef.current = nextUrl;
      setAudioBlob(file);
      setAudioUrl(nextUrl);
      setError(null);
      setElapsedMs(0);
      setStatus("recorded");
    },
    [revokeAudioUrl],
  );

  useEffect(() => {
    return () => {
      clearTimer();
      releaseStream();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, [clearTimer, releaseStream]);

  return {
    status,
    error,
    elapsedMs,
    audioUrl,
    audioBlob,
    start,
    stop,
    reset,
    setSubmitting,
    handleFile,
  };
}
