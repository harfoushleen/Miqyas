"use client";

import { useState } from "react";
import { parseConfig } from "@/lib/engine/config";
import {
  nextItem,
  recordResponse,
  replay,
  score,
  startSession,
} from "@/lib/engine/engine";
import { placeholderItems } from "@/lib/engine/placeholder-items";
import type {
  Participant,
  ResponseType,
  SessionContext,
  SessionState,
} from "@/lib/engine/types";

/** Wall clock lives here in the UI, never in the engine. */
const now = () => Date.now();

/** Dev-only, deliberately unstyled. Fake placeholder items only. */
export function EnginePlayground() {
  const [configText, setConfigText] = useState("{}");
  const [age, setAge] = useState("");
  const [grade, setGrade] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [shownAt, setShownAt] = useState(0);

  function start() {
    try {
      const participant: Participant = {
        ...(age !== "" ? { age: Number(age) } : {}),
        ...(grade !== "" ? { grade } : {}),
      };
      const next: SessionContext = {
        items: placeholderItems,
        config: parseConfig(JSON.parse(configText)),
        participant,
        startedAt: now(),
      };
      setCtx(next);
      setState(startSession(next));
      setShownAt(next.startedAt);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function choose(
    responseType: ResponseType,
    choiceIndex: number | null = null,
  ) {
    if (!state) return;
    const item = nextItem(state);
    if (!item) return;
    try {
      const answeredAt = now();
      setState(
        recordResponse(state, {
          itemId: item.id,
          responseType,
          choiceIndex,
          timeMs: answeredAt - shownAt,
          answeredAt,
        }),
      );
      setShownAt(answeredAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const item = state ? nextItem(state) : null;
  const result = state ? score(state) : null;
  const replayMatches =
    ctx && state
      ? JSON.stringify(score(replay(ctx, state.events))) ===
        JSON.stringify(result)
      : null;

  return (
    <main style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h1>Engine playground (dev only, placeholder items)</h1>

      <h2>Config (JSON, missing fields use defaults)</h2>
      <textarea
        value={configText}
        onChange={(e) => setConfigText(e.target.value)}
        rows={8}
        cols={70}
        spellCheck={false}
      />
      <div>
        <label>
          Age{" "}
          <input
            value={age}
            onChange={(e) => setAge(e.target.value)}
            size={4}
          />
        </label>{" "}
        <label>
          Grade{" "}
          <input
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            size={4}
          />
        </label>{" "}
        <button onClick={start}>
          {state ? "Restart session" : "Start session"}
        </button>
      </div>
      {error && <pre style={{ color: "red" }}>{error}</pre>}

      {state && result && (
        <>
          <h2>Current item</h2>
          {item ? (
            <div>
              <p>
                #{state.nextIndex + 1} [{item.section}] {item.prompt} (phase:{" "}
                {state.phase})
              </p>
              {item.choices.map((c, i) => (
                <button key={i} onClick={() => choose("answered", i)}>
                  {c} ({String.fromCharCode(65 + i)})
                </button>
              ))}{" "}
              <button onClick={() => choose("no_response")}>No response</button>{" "}
              <button onClick={() => choose("skipped_by_examiner")}>
                Skipped by examiner
              </button>
              <p>
                (Correct answer: {String.fromCharCode(65 + item.correctIndex)})
              </p>
            </div>
          ) : (
            <p>
              <strong>Session stopped: {state.stopReason}</strong>
            </p>
          )}

          <h2>State</h2>
          <pre>
            {JSON.stringify(
              {
                startIndex: state.startIndex,
                phase: state.phase,
                basalMet: state.basalMet,
                ceilingRun: state.ceilingRun,
                stopReason: state.stopReason,
              },
              null,
              2,
            )}
          </pre>

          <h2>Score</h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
          <p>Replay from events gives same score: {String(replayMatches)}</p>

          <h2>Event log</h2>
          <pre>{JSON.stringify(state.events, null, 2)}</pre>
        </>
      )}
    </main>
  );
}
