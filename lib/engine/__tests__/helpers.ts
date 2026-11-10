import { nextItem, recordResponse, startSession } from "../engine";
import { parseConfig } from "../config";
import type {
  Item,
  Participant,
  ResponseEvent,
  ResponseType,
  SessionState,
  TestConfig,
} from "../types";

/** Fake items; the first `sectionSize` are section "A", the rest "B". */
export function makeItems(count: number, sectionSize = count): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    section: i < sectionSize ? "A" : "B",
    prompt: `Test item ${i}`,
    choices: ["right", "wrong"],
    correctIndex: 0,
  }));
}

/** Build a validated config from a partial override. */
export function cfg(overrides: unknown = {}): TestConfig {
  return parseConfig(overrides);
}

export function begin(
  items: readonly Item[],
  config: TestConfig,
  participant: Participant = {},
): SessionState {
  return startSession({ items, config, participant, startedAt: 1_000 });
}

/** Build a ResponseEvent with fixed, fake timing. */
export function ev(
  itemId: string,
  choiceIndex: number | null,
  responseType: ResponseType = "answered",
): ResponseEvent {
  return {
    itemId,
    responseType,
    choiceIndex,
    timeMs: 1_000,
    answeredAt: 2_000,
  };
}

/** Answer the current item correctly (true) or incorrectly (false). */
export function answer(state: SessionState, correct: boolean): SessionState {
  const item = nextItem(state);
  if (!item) throw new Error("no current item");
  const choice = correct
    ? item.correctIndex
    : (item.correctIndex + 1) % item.choices.length;
  return recordResponse(state, {
    ...ev(item.id, choice),
    answeredAt: 2_000 + state.events.length,
  });
}

/** Apply a pattern of correct/incorrect answers. */
export function run(state: SessionState, pattern: boolean[]): SessionState {
  return pattern.reduce(answer, state);
}

export function currentId(state: SessionState): string | undefined {
  return nextItem(state)?.id;
}
