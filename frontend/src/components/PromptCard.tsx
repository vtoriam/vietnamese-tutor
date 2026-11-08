import { Card, CardContent } from "@/components/ui/card";
import { unitLabel, type Unit } from "@/lib/unitLabel";

export type Prompt = {
  id: string;
  vietnamese: string;
  english: string;
  unit: Unit;
};

type PromptCardProps = {
  prompt: Prompt;
};

export function PromptCard({ prompt }: PromptCardProps) {
  return (
    <Card className="target-card">
      <CardContent>
        <span className="unit-badge">{unitLabel(prompt.unit).replace(/^./, (letter) => letter.toUpperCase())}</span>
        <strong>{prompt.vietnamese}</strong>
        <p>{prompt.english}</p>
      </CardContent>
    </Card>
  );
}