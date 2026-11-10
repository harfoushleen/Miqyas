/**
 * Pure assessment engine: no React, no database, no clock, no randomness.
 * Session state is a deterministic reduction of the ResponseEvent log, so any
 * session can be replayed and rescored (also under a different config).
 */
import type {
  Item,
  Participant,
  ResponseEvent,
  ScoreResult,
  SessionContext,
  SessionState,
  StopReason,
} from "./types";

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

/** Grade rule wins over age rule, which wins over the default start item. */
function resolveStartIndex(ctx: SessionContext): number {
  const { defaultItemIndex, byAge, byGrade } = ctx.config.start;
  const { age, grade } = ctx.participant;
  let index = defaultItemIndex;
  const ageRule =
    age === undefined
      ? undefined
      : byAge.find((r) => age >= r.minAge && age <= r.maxAge);
  if (ageRule) index = ageRule.itemIndex;
  if (grade !== undefined && Object.hasOwn(byGrade, grade))
    index = byGrade[grade];
  return index;
}

export function startSession(ctx: SessionContext): SessionState {
  if (ctx.items.length === 0)
    throw new EngineError("Cannot start a session with no items");
  const startIndex = resolveStartIndex(ctx);
  if (startIndex >= ctx.items.length) {
    throw new EngineError(
      `start item index ${startIndex} is outside the ${ctx.items.length} available items`,
    );
  }
  return {
    items: ctx.items,
    config: ctx.config,
    participant: ctx.participant,
    startedAt: ctx.startedAt,
    startIndex,
    events: [],
    administered: [],
    phase: "forward",
    basalMet: null,
    basalRun: 0,
    lowestIndex: startIndex,
    highestIndex: startIndex - 1,
    nextIndex: startIndex,
    ceilingRun: 0,
    blockAllWrong: true,
    lastSection: null,
    stopReason: null,
  };
}

/** The item to present next, or null when the session has stopped. */
export function nextItem(state: SessionState): Item | null {
  return state.stopReason === null ? state.items[state.nextIndex] : null;
}

export function stopReason(state: SessionState): StopReason | null {
  return state.stopReason;
}

function isCorrect(item: Item, choiceIndex: number | null): boolean {
  return choiceIndex === item.correctIndex;
}

export function recordResponse(
  state: SessionState,
  event: ResponseEvent,
): SessionState {
  if (state.stopReason !== null) {
    throw new EngineError(`Session already stopped (${state.stopReason})`);
  }
  const { items, config } = state;
  const index = state.nextIndex;
  const item = items[index];
  if (event.itemId !== item.id) {
    throw new EngineError(
      `Response for ${event.itemId} but expected ${item.id}`,
    );
  }
  const choice = event.choiceIndex;
  if (
    choice !== null &&
    (!Number.isInteger(choice) || choice < 0 || choice >= item.choices.length)
  ) {
    throw new EngineError(`Invalid choice index ${choice} for ${item.id}`);
  }
  const correct = isCorrect(item, choice);
  const { basal, ceiling } = config;

  let { phase, basalMet, basalRun, lowestIndex, highestIndex } = state;
  let { ceilingRun, blockAllWrong, lastSection } = state;
  let nextIndex: number;

  if (phase === "forward") {
    highestIndex = index;

    // Ceiling bookkeeping (forward items only).
    if (
      ceiling.resetOnSectionChange &&
      lastSection !== null &&
      lastSection !== item.section
    ) {
      ceilingRun = 0;
      blockAllWrong = true;
    }
    lastSection = item.section;
    if (ceiling.countBy === "item") {
      ceilingRun = correct ? 0 : ceilingRun + 1;
    } else {
      blockAllWrong = blockAllWrong && !correct;
      if ((index + 1) % ceiling.blockSize === 0 || index === items.length - 1) {
        ceilingRun = blockAllWrong ? ceilingRun + 1 : 0;
        blockAllWrong = true;
      }
    }

    // Basal bookkeeping (until decided).
    if (basal.enabled && basalMet === null) {
      if (correct) {
        basalRun += 1;
        if (basalRun >= basal.consecutiveCorrect) basalMet = true;
      } else if (basal.onFail === "go-back" && lowestIndex > 0) {
        phase = "backward";
        basalRun = 0;
      } else {
        basalMet = false;
      }
    }
    nextIndex = phase === "backward" ? lowestIndex - 1 : highestIndex + 1;
  } else {
    lowestIndex = index;
    basalRun = correct ? basalRun + 1 : 0;
    if (basalRun >= basal.consecutiveCorrect || index === 0) {
      basalMet = basalRun >= basal.consecutiveCorrect;
      phase = "forward";
      ceilingRun = 0;
      blockAllWrong = true;
      nextIndex = highestIndex + 1;
    } else {
      nextIndex = index - 1;
    }
  }

  let reason: StopReason | null = null;
  if (phase === "forward" && ceilingRun >= ceiling.consecutiveIncorrect) {
    reason = "ceiling";
  } else if (nextIndex >= items.length) {
    reason = "end-of-items";
  }

  return {
    ...state,
    events: [...state.events, event],
    administered: [...state.administered, index],
    phase,
    basalMet,
    basalRun,
    lowestIndex,
    highestIndex,
    nextIndex,
    ceilingRun,
    blockAllWrong,
    lastSection,
    stopReason: reason,
  };
}

export function score(state: SessionState): ScoreResult {
  const { items, config } = state;
  const bySection: Record<string, number> = {};
  for (const item of items) bySection[item.section] = 0;

  let correctAdministered = 0;
  state.events.forEach((event, i) => {
    const item = items[state.administered[i]];
    if (isCorrect(item, event.choiceIndex)) {
      correctAdministered += 1;
      bySection[item.section] += 1;
    }
  });

  let credited = 0;
  if (config.scoring.creditBelowStart && state.basalMet !== false) {
    for (let i = 0; i < state.startIndex; i++) {
      if (!state.administered.includes(i)) {
        credited += 1;
        bySection[items[i].section] += 1;
      }
    }
  }

  const administered = state.events.length;
  const raw = correctAdministered + credited;
  const denominator = administered + credited;
  let total = raw;
  if (config.scoring.method === "proportion")
    total = denominator === 0 ? 0 : raw / denominator;

  return {
    method: config.scoring.method,
    total,
    correctAdministered,
    credited,
    administered,
    bySection,
    basalMet: state.basalMet,
    stopReason: state.stopReason,
  };
}

/** Rebuild a session (and so its score) purely from its event log. */
export function replay(
  ctx: SessionContext,
  events: readonly ResponseEvent[],
): SessionState {
  return events.reduce(recordResponse, startSession(ctx));
}

export type { Participant };
