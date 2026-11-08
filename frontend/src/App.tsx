import "./App.css";

import { useState } from "react";
import { createSession } from "@/api/client";
import { EndScreen } from "@/components/EndScreen";
import { ErrorState } from "@/components/ErrorState";
import { PromptCard, type Prompt } from "@/components/PromptCard";
import { Recorder, type SubmissionStatus } from "@/components/Recorder";
import { ResultsPanel } from "@/components/ResultsPanel";
import { StartScreen } from "@/components/StartScreen";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { useAttempt } from "@/hooks/useAttempt";
import prompts from "@/data/prompts.json";

function App() {
  const [step, setStep] = useState<"start" | "practice" | "end">("start");
  const [promptIndex, setPromptIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const attempt = useAttempt();
  const prompt = prompts[promptIndex] as Prompt;
  const promptAttempts = attempt.attempts.filter((item) => item.prompt_id === prompt.id);
  const previousAttempts = promptAttempts.filter((item) => item.attempt_id !== attempt.attempt?.attempt_id);
  const submissionStatus: SubmissionStatus | undefined =
    attempt.status === "uploading" ||
    attempt.status === "transcribing" ||
    attempt.status === "analysing"
      ? attempt.status
      : undefined;

  const handleSend = (audio: Blob) => {
    void attempt.submit({
      session_id: sessionId ?? "",
      target_text: prompt.vietnamese,
      prompt_id: prompt.id,
      unit: prompt.unit,
      dialect: "north",
      feedback_language: "en",
      audio,
    });
  };

  const handleNextPrompt = () => {
    if (promptIndex === prompts.length - 1) {
      setStep("end");
      attempt.reset();
      return;
    }
    setPromptIndex((current) => current + 1);
    attempt.reset();
  };

  const handleBegin = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const session = await createSession();
      setSessionId(session.session_id);
      setStep("practice");
    } catch {
      setStartError("Could not start the session. Check your connection and try again.");
    } finally {
      setIsStarting(false);
    }
  };

  if (step === "start") {
    return <StartScreen onBegin={handleBegin} isStarting={isStarting} startError={startError} unit={prompt.unit} />;
  }

  if (step === "end") {
    return (
      <EndScreen
        prompts={prompts as Prompt[]}
        attempts={attempt.attempts}
        onPracticeAgain={() => {
          setPromptIndex(0);
          setStep("practice");
          attempt.reset();
        }}
      />
    );
  }

  return (
    <main className="stage-three">
      <section className="practice-preview" aria-labelledby="practice-heading">
        <div className="practice-header">
          <div>
            <p className="eyebrow">Practice</p>
            <h1 id="practice-heading">Practice</h1>
          </div>
          <span>{promptIndex + 1} of {prompts.length}</span>
        </div>
        {attempt.attempt?.status === "done" ? (
          <ResultsPanel
            attempt={attempt.attempt}
            targetText={prompt.vietnamese}
            attemptNumber={promptAttempts.length}
            previousAttempts={previousAttempts}
            onTryAgain={attempt.reset}
            onNextUnit={handleNextPrompt}
            unit={prompt.unit}
          />
        ) : (
          <>
            <Progress value={((promptIndex + 1) / prompts.length) * 100} className="practice-progress">
              <ProgressLabel>Practice</ProgressLabel>
              <ProgressValue />
            </Progress>
            <PromptCard key={prompt.id} prompt={prompt} />
            <Recorder key={`${prompt.id}-${promptAttempts.length}`} onSend={handleSend} submissionStatus={submissionStatus} unit={prompt.unit} />
            {attempt.error ? <ErrorState code={attempt.error.code} onRetry={attempt.reset} unit={prompt.unit} /> : null}
          </>
        )}
      </section>
    </main>
  );
}

export default App;
