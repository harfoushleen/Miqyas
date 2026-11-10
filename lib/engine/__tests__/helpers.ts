import { nextItem, recordResponse, startSession } from "../engine";
import { parseConfig } from "../config";
import type { Item, Participant, SessionState, TestConfig } from "../types";

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
  items: Item[],
  config: TestConfig,
  participant: Participant = {},
): SessionState {
  return startSession({ items, config, participant, startedAt: 1_000 });
}

/** Answer the current item correctly (true) or incorrectly (false). */
export function answer(state: SessionState, correct: boolean): SessionState {
  const item = nextItem(state);
  if (!item) throw new Error("no current item");
  return recordResponse(state, {
    itemId: item.id,
    choiceIndex: correct ? item.correctIndex : item.correctIndex + 1,
    timestamp: 2_000 + state.events.length,
  });
}

/** Apply a pattern of correct/incorrect answers. */
export function run(state: SessionState, pattern: boolean[]): SessionState {
  return pattern.reduce(answer, state);
}

export function currentId(state: SessionState): string | undefined {
  return nextItem(state)?.id;
}
