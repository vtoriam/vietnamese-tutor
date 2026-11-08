import type { components } from "./types";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

type Session = components["schemas"]["Session"];
type Attempt = components["schemas"]["Attempt"];
type AttemptCreated = components["schemas"]["AttemptCreated"];
type AttemptRequest = Omit<components["schemas"]["AttemptRequest"], "audio"> & {
  audio: Blob;
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    message: string,
    code: string,
    status: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as components["schemas"]["Error"] | null;
    throw new ApiError(
      body?.message ?? `Request failed with status ${response.status}`,
      body?.code ?? "NETWORK_ERROR",
      response.status,
    );
  }

  return (await response.json()) as T;
}

export async function createSession(): Promise<Session> {
  const response = await fetch(`${apiBaseUrl}/sessions`, { method: "POST" });
  return parseResponse<Session>(response);
}

export async function createAttempt(request: AttemptRequest): Promise<AttemptCreated> {
  const formData = new FormData();
  formData.append("session_id", request.session_id);
  formData.append("prompt_id", request.prompt_id);
  formData.append("target_text", request.target_text);
  formData.append("unit", request.unit);
  formData.append("dialect", request.dialect);
  formData.append("feedback_language", request.feedback_language);
  formData.append("audio", request.audio, "recording.webm");

  const response = await fetch(`${apiBaseUrl}/attempts`, {
    method: "POST",
    body: formData,
  });
  return parseResponse<AttemptCreated>(response);
}

export async function getAttempt(attemptId: string): Promise<Attempt> {
  const response = await fetch(`${apiBaseUrl}/attempts/${encodeURIComponent(attemptId)}`);
  return parseResponse<Attempt>(response);
}

export type { Attempt, AttemptRequest, Session };
