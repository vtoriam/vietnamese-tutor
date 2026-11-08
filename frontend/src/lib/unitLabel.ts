import type { components } from "@/api/types";

export type Unit = components["schemas"]["Unit"];

const singularLabels: Record<Unit, string> = {
  word: "word",
  phrase: "phrase",
  sentence: "sentence",
};

const pluralLabels: Record<Unit, string> = {
  word: "single Vietnamese words",
  phrase: "short Vietnamese phrases",
  sentence: "short Vietnamese sentences",
};

export function isUnit(value: string): value is Unit {
  return value in singularLabels;
}

export function unitLabel(unit: Unit): string {
  return singularLabels[unit];
}

export function unitPluralLabel(unit: Unit): string {
  return pluralLabels[unit];
}
