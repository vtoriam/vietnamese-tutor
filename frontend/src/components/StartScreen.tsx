import { Mic } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { unitPluralLabel, type Unit } from "@/lib/unitLabel";

type StartScreenProps = {
  onBegin: () => Promise<void>;
  isStarting: boolean;
  startError: string | null;
  unit: Unit;
};

export function StartScreen({ onBegin, isStarting, startError, unit }: StartScreenProps) {
  const [micStatus, setMicStatus] = useState<"Not tested" | "Mic works">("Not tested");
  const [micTesting, setMicTesting] = useState(false);

  const checkMicrophone = async () => {
    setMicTesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      stream.getTracks().forEach((track) => track.stop());
      setMicStatus("Mic works");
    } catch {
      setMicStatus("Not tested");
    } finally {
      setMicTesting(false);
    }
  };

  return (
    <main className="stage-one">
      <section className="setup-card" aria-labelledby="setup-heading">
        <p className="eyebrow">Vietnamese pronunciation tutor</p>
        <h1 id="setup-heading">Practice Vietnamese pronunciation</h1>
        <p className="intro">Record yourself saying {unitPluralLabel(unit)}. You will get brief feedback in English.</p>
        <div className="before-start-card">
          <strong>Before you start</strong>
          <p>Find a quiet room. Use headphones so the model voice is not picked up by your microphone.</p>
        </div>
        <div className="mic-check-card">
          <div className="card-heading">
            <strong>Microphone check</strong>
            <span>{micStatus}</span>
          </div>
          <div className={`mic-level ${micStatus === "Mic works" ? "mic-level-active" : ""}`} />
          <Button type="button" variant="outline" onClick={() => void checkMicrophone()} disabled={micTesting}>
            <Mic />
            {micTesting ? "Testing..." : "Record 2 seconds and play back"}
          </Button>
        </div>
        <div className="consent-placeholder">[CONSENT TEXT: to be added after ethics approval]</div>
        {startError ? <p className="start-error" role="alert">{startError}</p> : null}
        <Button type="button" className="begin-button" onClick={() => void onBegin()} disabled={isStarting}>
          {isStarting ? "Starting..." : "Begin"}
        </Button>
      </section>
    </main>
  );
}
