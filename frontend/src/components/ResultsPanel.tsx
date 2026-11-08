import { ChevronDown, ChevronUp, Play } from "lucide-react";
import { useState } from "react";
import type { Attempt } from "@/api/client";
import type { components } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

type Feedback = components["schemas"]["Feedback"];
type FeedbackItem = components["schemas"]["FeedbackItem"];

type ResultsPanelProps = {
  attempt: Attempt;
  targetText: string;
  attemptNumber: number;
  previousAttempts: Attempt[];
  onTryAgain: () => void;
  onNextPhrase: () => void;
};

const categoryLabels: Record<FeedbackItem["category"], string> = {
  tone: "Tone",
  initial_consonant: "Initial consonant",
  final_consonant: "Final consonant",
  other: "Other",
};

function isHighlightedTarget(index: number, items: FeedbackItem[]) {
  return items.some((item) => item.word_index === index);
}

function isHighlightedHeard(word: string, items: FeedbackItem[]) {
  return items.some((item) => item.heard?.toLowerCase() === word.toLowerCase());
}

function WordChip({ highlighted, children }: { highlighted: boolean; children: string }) {
  return <span className={`word-chip ${highlighted ? "word-chip-highlighted" : ""}`}>{children}</span>;
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const { canSpeak, speak } = useSpeechSynthesis();

  return (
    <article className="feedback-card">
      <div className="feedback-title">
        <strong>{item.expected}</strong>
        <Badge variant="outline">{categoryLabels[item.category]}</Badge>
      </div>
      <p className="feedback-heard">
        Expected “{item.expected}”, heard “{item.heard ?? "nothing"}”.
      </p>
      <p>{item.explanation}</p>
      <p className="feedback-tip">
        <strong>Tip:</strong> {item.tip}
      </p>
      {canSpeak ? (
        <>
          <Button type="button" variant="outline" className="hear-button" onClick={() => speak(item.expected)}>
            <Play />
            Hear correct pronunciation
          </Button>
          <p className="synthetic-note">Synthetic voice. Tones may sound imperfect.</p>
        </>
      ) : null}
      {item.estimated_from_transcript ? <p className="estimated-label">Estimated from transcript</p> : null}
    </article>
  );
}

function AttemptHistory({ attempts }: { attempts: Attempt[] }) {
  const [expanded, setExpanded] = useState(false);

  if (attempts.length === 0) {
    return null;
  }

  return (
    <div className="attempt-history">
      <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
        <span>Earlier attempts ({attempts.length})</span>
        {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      </button>
      {expanded ? (
        <div className="attempt-history-list">
          {[...attempts].reverse().map((previous, index) => (
            <div key={previous.attempt_id}>
              Attempt {attempts.length - index} · {previous.feedback?.items.length ?? 0} issues
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ResultsPanel({
  attempt,
  targetText,
  attemptNumber,
  previousAttempts,
  onTryAgain,
  onNextPhrase,
}: ResultsPanelProps) {
  const feedback: Feedback = attempt.feedback ?? { summary: "Recording checked.", items: [] };
  const targetWords = targetText.split(/\s+/).filter(Boolean);
  const heardWords = (attempt.transcript ?? "").split(/\s+/).filter(Boolean);

  return (
    <section className="results-panel" aria-labelledby="results-heading">
      <div className="practice-header">
        <div>
          <p className="eyebrow">Attempt {attemptNumber}</p>
          <h1 id="results-heading">Results</h1>
        </div>
        <span>Practice</span>
      </div>

      <div className="results-comparison">
        <div>
          <span className="results-label">Target</span>
          <div className="word-row">
            {targetWords.map((word, index) => (
              <WordChip key={`${word}-${index}`} highlighted={isHighlightedTarget(index, feedback.items)}>
                {word}
              </WordChip>
            ))}
          </div>
        </div>
        <div>
          <span className="results-label">Heard (transcript)</span>
          <div className="word-row">
            {heardWords.map((word, index) => (
              <WordChip key={`${word}-${index}`} highlighted={isHighlightedHeard(word, feedback.items)}>
                {word}
              </WordChip>
            ))}
          </div>
        </div>
      </div>

      <div className="summary-card">{feedback.summary}</div>

      {feedback.items.length > 0 ? (
        feedback.items.map((item) => <FeedbackCard key={`${item.word_index}-${item.expected}`} item={item} />)
      ) : (
        <div className="no-issues-card">No pronunciation issues found. Great work!</div>
      )}

      <div className="results-actions">
        <Button type="button" onClick={onTryAgain}>
          Try again
        </Button>
        <Button type="button" variant="outline" onClick={onNextPhrase}>
          Next phrase
        </Button>
      </div>
      <AttemptHistory attempts={previousAttempts} />
    </section>
  );
}