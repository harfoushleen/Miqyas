/**
 * Pure assessment engine: no React, no database, no clock, no randomness.
 * Session state is a deterministic reduction of the ResponseEvent log, so any
 * session can be replayed and rescored (also under a different config).
 */
import { RESPONSE_TYPES } from "./types";
import type {
  Item,
  ResponseType,
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
    blockIncorrect: 0,
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

/** Only an "answered" event with the right choice is correct; non-answers never are. */
function isCorrect(item: Item, event: ResponseEvent): boolean {
  return (
    event.responseType === "answered" && event.choiceIndex === item.correctIndex
  );
}

function validateEvent(event: ResponseEvent, item: Item): void {
  if (!RESPONSE_TYPES.includes(event.responseType)) {
    throw new EngineError(`Unknown responseType ${String(event.responseType)}`);
  }
  const choice = event.choiceIndex;
  if (event.responseType === "answered") {
    if (
      choice === null ||
      !Number.isInteger(choice) ||
      choice < 0 ||
      choice >= item.choices.length
    ) {
      throw new EngineError(`Invalid choice index ${choice} for ${item.id}`);
    }
  } else if (choice !== null) {
    throw new EngineError(
      `choiceIndex must be null for responseType ${event.responseType}`,
    );
  }
  if (!Number.isFinite(event.timeMs) || event.timeMs < 0) {
    throw new EngineError(`Invalid timeMs ${event.timeMs} for ${item.id}`);
  }
  if (!Number.isFinite(event.answeredAt)) {
    throw new EngineError(`Invalid answeredAt ${event.answeredAt}`);
  }
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
  validateEvent(event, item);
  const correct = isCorrect(item, event);
  const { basal, ceiling } = config;

  let { phase, basalMet, basalRun, lowestIndex, highestIndex } = state;
  let { ceilingRun, blockIncorrect, lastSection } = state;
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
      blockIncorrect = 0;
    }
    lastSection = item.section;
    if (ceiling.countBy === "item") {
      ceilingRun = correct ? 0 : ceilingRun + 1;
    } else {
      if (!correct) blockIncorrect += 1;
      if ((index + 1) % ceiling.blockSize === 0 || index === items.length - 1) {
        ceilingRun =
          blockIncorrect >= ceiling.blockFailWhenIncorrectAtLeast
            ? ceilingRun + 1
            : 0;
        blockIncorrect = 0;
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
      blockIncorrect = 0;
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
    blockIncorrect,
    lastSection,
    stopReason: reason,
  };
}

export function score(state: SessionState): ScoreResult {
  const { items, config } = state;
  const bySection: Record<string, number> = {};
  for (const item of items) bySection[item.section] = 0;

  let correctAdministered = 0;
  let totalTimeMs = 0;
  const byResponseType: Record<ResponseType, number> = {
    answered: 0,
    no_response: 0,
    skipped_by_examiner: 0,
  };
  const perItem = state.events.map((event, i) => {
    const item = items[state.administered[i]];
    const correct = isCorrect(item, event);
    if (correct) {
      correctAdministered += 1;
      bySection[item.section] += 1;
    }
    byResponseType[event.responseType] += 1;
    totalTimeMs += event.timeMs;
    return {
      itemId: item.id,
      responseType: event.responseType,
      correct,
      timeMs: event.timeMs,
      answeredAt: event.answeredAt,
    };
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
    byResponseType,
    timing: { totalTimeMs, perItem },
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
