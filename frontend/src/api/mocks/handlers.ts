import { http, HttpResponse } from "msw";
import type { components } from "../types";

type Attempt = components["schemas"]["Attempt"];
type Scenario =
  | "success"
  | "success_no_issues"
  | "slow"
  | "no_speech"
  | "too_short"
  | "too_long"
  | "transcription_failed"
  | "analysis_failed"
  | "upload_error";
type FailureScenario = Exclude<Scenario, "success" | "success_no_issues" | "slow" | "upload_error">;

type MockAttempt = {
  attempt: Attempt;
  scenario: Scenario;
};

const attempts = new Map<string, MockAttempt>();
let sessionNumber = 0;
let attemptNumber = 0;

const scenarioErrors: Record<FailureScenario, components["schemas"]["AttemptError"]> = {
  no_speech: {
    code: "NO_SPEECH_DETECTED",
    message: "No speech detected.",
  },
  too_short: {
    code: "AUDIO_TOO_SHORT",
    message: "Audio was too short.",
  },
  too_long: {
    code: "AUDIO_TOO_LONG",
    message: "Audio was too long.",
  },
  transcription_failed: {
    code: "TRANSCRIPTION_FAILED",
    message: "Transcription failed.",
  },
  analysis_failed: {
    code: "ANALYSIS_FAILED",
    message: "Analysis failed.",
  },
};

function getScenario(request: Request): Scenario {
  const requestUrl = new URL(request.url);
  const value = requestUrl.searchParams.get("mock") ?? new URLSearchParams(window.location.search).get("mock");
  const scenarios: Scenario[] = [
    "success",
    "success_no_issues",
    "slow",
    "no_speech",
    "too_short",
    "too_long",
    "transcription_failed",
    "analysis_failed",
    "upload_error",
  ];
  return scenarios.includes(value as Scenario) ? (value as Scenario) : "success";
}

function getFeedback(scenario: Scenario): components["schemas"]["Feedback"] {
  if (scenario === "success_no_issues") {
    return {
      summary: "Great work. We did not find any pronunciation issues.",
      items: [],
    };
  }

  return {
    summary: "Good effort. Watch the tone on “phở”.",
    items: [
      {
        word_index: 1,
        expected: "phở",
        heard: "pho",
        category: "tone",
        explanation: "“phở” has a dipping tone: the pitch falls, then rises.",
        tip: "Start mid, dip down, then lift at the end, like a short question.",
        estimated_from_transcript: true,
      },
    ],
  };
}

function getAttemptState(mockAttempt: MockAttempt): Attempt {
  const elapsed = Date.now() - Date.parse(mockAttempt.attempt.created_at);
  const { scenario } = mockAttempt;

  if (scenario in scenarioErrors) {
    if (elapsed < 1000) {
      return { ...mockAttempt.attempt, status: "transcribing" };
    }

    return {
      ...mockAttempt.attempt,
      status: "failed",
      error: scenarioErrors[scenario as FailureScenario],
    };
  }

  if (elapsed < 1000) {
    return { ...mockAttempt.attempt, status: "transcribing" };
  }
  if (elapsed < 2000) {
    return { ...mockAttempt.attempt, status: "analysing" };
  }
  if (scenario === "slow" && elapsed < 35000) {
    return { ...mockAttempt.attempt, status: "analysing" };
  }

  return {
    ...mockAttempt.attempt,
    status: "done",
    transcript: "ăn pho",
    feedback: getFeedback(scenario),
  };
}

export const handlers = [
  http.post("*/sessions", () => {
    sessionNumber += 1;
    return HttpResponse.json<components["schemas"]["Session"]>(
      {
        session_id: `sess_mock_${sessionNumber}`,
        created_at: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  http.post("*/attempts", async ({ request }) => {
    const scenario = getScenario(request);
    if (scenario === "upload_error") {
      return HttpResponse.json<components["schemas"]["AttemptCreated"] | components["schemas"]["Error"]>(
        { code: "UPLOAD_ERROR", message: "Could not upload audio." },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const sessionId = formData.get("session_id");
    const promptId = formData.get("prompt_id");
    const targetText = formData.get("target_text");

    if (typeof sessionId !== "string" || typeof promptId !== "string" || typeof targetText !== "string") {
      return HttpResponse.json<components["schemas"]["AttemptCreated"] | components["schemas"]["Error"]>(
        { code: "INVALID_REQUEST", message: "Missing required attempt fields." },
        { status: 400 },
      );
    }

    attemptNumber += 1;
    const attemptId = `att_mock_${attemptNumber}`;
    attempts.set(attemptId, {
      scenario,
      attempt: {
        attempt_id: attemptId,
        session_id: sessionId,
        prompt_id: promptId,
        status: "uploading",
        created_at: new Date().toISOString(),
        transcript: null,
        feedback: null,
        error: null,
      },
    });

    return HttpResponse.json<components["schemas"]["AttemptCreated"] | components["schemas"]["Error"]>(
      { attempt_id: attemptId, status: "uploading" },
      { status: 202 },
    );
  }),

  http.get("*/attempts/:attemptId", ({ params }) => {
    const attemptId = params.attemptId;
    if (typeof attemptId !== "string") {
      return HttpResponse.json<components["schemas"]["Error"]>(
        { code: "INVALID_ATTEMPT_ID", message: "Invalid attempt id." },
        { status: 400 },
      );
    }

    const mockAttempt = attempts.get(attemptId);
    if (!mockAttempt) {
      return HttpResponse.json<components["schemas"]["Error"]>(
        { code: "NOT_FOUND", message: "Attempt not found." },
        { status: 404 },
      );
    }

    return HttpResponse.json(getAttemptState(mockAttempt));
  }),
];
