import { Mic, Square, Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecorder, type RecorderError, type RecorderStatus } from "@/hooks/useRecorder";

export type SubmissionStatus = "uploading" | "transcribing" | "analysing";

type RecorderProps = {
  onSend?: (audio: Blob) => void;
  submissionStatus?: SubmissionStatus;
};

const errorMessages: Record<RecorderError, string> = {
  mic_blocked: "Microphone access is blocked. Allow it in your browser settings, then try again.",
  too_short: "That recording was too short. Say the whole phrase.",
  unsupported: "Recording is not supported in this browser.",
};

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `0:${seconds.toString().padStart(2, "0")}`;
}

function statusLabel(status: RecorderStatus, submissionStatus?: SubmissionStatus): string {
  if (status === "submitting") {
    return `${submissionStatus === "transcribing" ? "Transcribing" : submissionStatus === "analysing" ? "Analysing" : "Uploading"}...`;
  }
  if (status === "recording") {
    return "Recording...";
  }
  return "0:00 / 0:15";
}

export function Recorder({ onSend, submissionStatus }: RecorderProps) {
  const recorder = useRecorder();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSubmitting = recorder.status === "submitting";
  const isRecording = recorder.status === "recording";
  const isRecorded = recorder.status === "recorded";

  const handleSend = () => {
    if (recorder.audioBlob && onSend) {
      recorder.setSubmitting(true);
      onSend(recorder.audioBlob);
    }
  };

  return (
    <section className="recorder-card" aria-label="Audio recorder">
      <div className="waveform" aria-hidden="true">
        {Array.from({ length: 19 }, (_, index) => (
          <span key={index} style={{ height: `${8 + ((index * 7) % 18)}px` }} />
        ))}
      </div>

      <p className="recorder-timer" aria-live="polite">
        {isRecording ? `${formatTime(recorder.elapsedMs)} / 0:15` : statusLabel(recorder.status, submissionStatus)}
      </p>

      {isSubmitting ? (
        <div className="recorder-loading" aria-live="polite">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : (
        <>
          <Button
            type="button"
            className={`record-button ${isRecording ? "record-button-stop" : ""}`}
            onClick={isRecording ? recorder.stop : recorder.start}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
          >
            {isRecording ? <Square /> : <Mic />}
          </Button>
          <p className="record-label">{isRecording ? "Tap to stop" : "Tap to record"}</p>
        </>
      )}

      {recorder.error ? (
        <p className="recorder-error" role="alert">
          {errorMessages[recorder.error]}
        </p>
      ) : null}

      {isRecorded && recorder.audioUrl ? (
        <div className="recorded-controls">
          <audio controls src={recorder.audioUrl} aria-label="Your recording" />
          <div className="recorder-actions">
            <Button type="button" variant="outline" onClick={recorder.reset}>
              Re-record
            </Button>
            <Button type="button" onClick={handleSend} disabled={!onSend}>
              Send
            </Button>
          </div>
        </div>
      ) : null}

      {!isRecording && !isSubmitting && !isRecorded ? (
        <Button type="button" variant="link" className="upload-button" onClick={() => fileInputRef.current?.click()} aria-label="Upload an audio file">
          <Upload />
          Upload an audio file
        </Button>
      ) : null}
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="audio/*"
        onChange={(event) => {
          recorder.handleFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </section>
  );
}