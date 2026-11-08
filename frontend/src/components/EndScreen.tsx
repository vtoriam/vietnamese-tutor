import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Attempt } from "@/api/client";
import type { Prompt } from "@/components/PromptCard";
import { unitLabel } from "@/lib/unitLabel";

type EndScreenProps = {
  prompts: Prompt[];
  attempts: Attempt[];
  onPracticeAgain: () => void;
};

export function EndScreen({ prompts, attempts, onPracticeAgain }: EndScreenProps) {
  const [finished, setFinished] = useState(false);
  const surveyUrl = import.meta.env.VITE_SURVEY_URL as string | undefined;

  return (
    <main className="stage-one">
      <section className="setup-card end-card" aria-labelledby="end-heading">
        <p className="eyebrow">Complete</p>
        <h1 id="end-heading">{unitLabel(prompts[0].unit).replace(/^./, (letter) => letter.toUpperCase())} practice complete</h1>
        <p className="intro">Here is a summary of your {unitLabel(prompts[0].unit)} practice attempts.</p>
        <div className="end-summary-list">
          {prompts.map((prompt) => {
            const promptAttempts = attempts.filter((attempt) => attempt.prompt_id === prompt.id);
            const latest = promptAttempts.at(-1);
            return (
              <div className="end-summary-row" key={prompt.id}>
                <div>
                  <strong>{unitLabel(prompt.unit).replace(/^./, (letter) => letter.toUpperCase())}: {prompt.vietnamese}</strong>
                  <span>{latest?.feedback?.summary ?? "No attempt yet."}</span>
                </div>
                <span>{promptAttempts.length} {promptAttempts.length === 1 ? "try" : "tries"}</span>
              </div>
            );
          })}
        </div>
        <div className="end-actions">
          <Button type="button" onClick={onPracticeAgain}>Practice again</Button>
          <Button type="button" variant="outline" onClick={() => setFinished(true)} disabled={finished}>
            {finished ? "Finished" : "Finish"}
          </Button>
          {surveyUrl ? <a href={surveyUrl} target="_blank" rel="noreferrer">Open survey</a> : null}
        </div>
      </section>
    </main>
  );
}
