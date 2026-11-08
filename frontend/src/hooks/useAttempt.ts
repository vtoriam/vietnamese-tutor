import { useCallback, useEffect, useRef, useState } from "react";
import { createAttempt, getAttempt, type Attempt } from "@/api/client";
import type { components } from "@/api/types";

type AttemptStatus = components["schemas"]["Status"];
type AttemptRequest = Parameters<typeof createAttempt>[0];

type AttemptError = {
  code: string;
  message: string;
};

type UseAttemptResult = {
  attempt: Attempt | null;
  attempts: Attempt[];
  status: AttemptStatus | null;
  error: AttemptError | null;
  submit: (request: AttemptRequest) => Promise<void>;
  reset: () => void;
};

const POLL_INTERVAL_MS = 1_000;
const TIMEOUT_MS = 30_000;

export function useAttempt(): UseAttemptResult {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [status, setStatus] = useState<AttemptStatus | null>(null);
  const [error, setError] = useState<AttemptError | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const timeoutTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (timeoutTimerRef.current !== null) {
      window.clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    clearTimers();
    setAttempt(null);
    setStatus(null);
    setError(null);
  }, [clearTimers]);

  const submit = useCallback(
    async (request: AttemptRequest) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      clearTimers();
      setAttempt(null);
      setError(null);
      setStatus("uploading");

      try {
        const created = await createAttempt(request);
        if (requestId !== requestIdRef.current) {
          return;
        }

        setStatus(created.status);
        const deadline = Date.now() + TIMEOUT_MS;

        const poll = async () => {
          if (requestId !== requestIdRef.current) {
            return;
          }

          try {
            const nextAttempt = await getAttempt(created.attempt_id);
            if (requestId !== requestIdRef.current) {
              return;
            }

            setAttempt(nextAttempt);
            setStatus(nextAttempt.status);
            if (nextAttempt.status === "done") {
              setAttempts((current) =>
                current.some((item) => item.attempt_id === nextAttempt.attempt_id)
                  ? current
                  : [...current, nextAttempt],
              );
              clearTimers();
              return;
            }
            if (nextAttempt.status === "failed") {
              clearTimers();
              setError(nextAttempt.error ?? {
                code: "INTERNAL_ERROR",
                message: "Something went wrong while checking your recording.",
              });
              return;
            }

            if (Date.now() >= deadline) {
              clearTimers();
              setError({ code: "TIMEOUT", message: "This is taking too long." });
              return;
            }

            pollTimerRef.current = window.setTimeout(() => {
              void poll();
            }, POLL_INTERVAL_MS);
          } catch (pollError) {
            clearTimers();
            setError({
              code: "NETWORK_ERROR",
              message: pollError instanceof Error ? pollError.message : "Could not reach the server.",
            });
          }
        };

        timeoutTimerRef.current = window.setTimeout(() => {
          if (requestId === requestIdRef.current) {
            clearTimers();
            setError({ code: "TIMEOUT", message: "This is taking too long." });
          }
        }, TIMEOUT_MS);
        void poll();
      } catch (submitError) {
        clearTimers();
        setError({
          code: "NETWORK_ERROR",
          message: submitError instanceof Error ? submitError.message : "Could not reach the server.",
        });
      }
    },
    [clearTimers],
  );

  useEffect(() => clearTimers, [clearTimers]);

  return { attempt, attempts, status, error, submit, reset };
}
