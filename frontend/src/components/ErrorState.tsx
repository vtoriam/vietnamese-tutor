import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { unitLabel, type Unit } from "@/lib/unitLabel";

type ErrorStateProps = {
  code: string;
  onRetry: () => void;
  unit: Unit;
};

const errorMessages: Record<string, { message: string | ((unit: Unit) => string); action: string }> = {
  MIC_BLOCKED: {
    message: "Microphone access is blocked. Allow it in your browser settings, then try again.",
    action: "Try again",
  },
  NO_SPEECH_DETECTED: {
    message: "We could not hear anything. Move closer to the microphone and try again.",
    action: "Record again",
  },
  AUDIO_TOO_SHORT: {
    message: (unit) => `That recording was too short. Say the whole ${unitLabel(unit)}.`,
    action: "Record again",
  },
  AUDIO_TOO_LONG: {
    message: "That recording was too long. Keep it under 15 seconds.",
    action: "Record again",
  },
  NETWORK_ERROR: {
    message: "Could not reach the server. Check your connection.",
    action: "Try again",
  },
  UPLOAD_ERROR: {
    message: "Could not reach the server. Check your connection.",
    action: "Try again",
  },
  TIMEOUT: {
    message: "This is taking too long.",
    action: "Try again",
  },
  TRANSCRIPTION_FAILED: {
    message: "Something went wrong while checking your recording.",
    action: "Try again",
  },
  ANALYSIS_FAILED: {
    message: "Something went wrong while checking your recording.",
    action: "Try again",
  },
  INTERNAL_ERROR: {
    message: "Something went wrong while checking your recording.",
    action: "Try again",
  },
};

export function ErrorState({ code, onRetry, unit }: ErrorStateProps) {
  const content = errorMessages[code] ?? errorMessages.INTERNAL_ERROR;
  const message = typeof content.message === "function" ? content.message(unit) : content.message;

  return (
    <Alert variant="destructive" className="error-state">
      <AlertCircle />
      <AlertTitle>We could not check that recording</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <Button type="button" variant="outline" onClick={onRetry}>
        {content.action}
      </Button>
    </Alert>
  );
}