import { Card, CardContent } from "@/components/ui/card";

export type Prompt = {
  id: string;
  vietnamese: string;
  english: string;
  unit: "phrase" | "sentence";
};

type PromptCardProps = {
  prompt: Prompt;
};

export function PromptCard({ prompt }: PromptCardProps) {
  return (
    <Card className="target-card">
      <CardContent>
        <span className="unit-badge">{prompt.unit === "phrase" ? "Phrase" : "Sentence"}</span>
        <strong>{prompt.vietnamese}</strong>
        <p>{prompt.english}</p>
      </CardContent>
    </Card>
  );
}