/** A multiple-choice item. Array position in the item list = difficulty order. */
export interface Item {
  readonly id: string;
  readonly section: string;
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly correctIndex: number;
}

export interface Participant {
  /** Age in years. Opaque data only: never store names. */
  readonly age?: number;
  readonly grade?: string;
}

export interface TestConfig {
  readonly start: {
    readonly defaultItemIndex: number;
    readonly byAge: readonly {
      minAge: number;
      maxAge: number;
      itemIndex: number;
    }[];
    readonly byGrade: Readonly<Record<string, number>>;
  };
  readonly basal: {
    readonly enabled: boolean;
    readonly consecutiveCorrect: number;
    /** go-back: administer earlier items until basal is met; continue: flag unmet and move on. */
    readonly onFail: "go-back" | "continue";
  };
  readonly ceiling: {
    readonly consecutiveIncorrect: number;
    readonly countBy: "item" | "block";
    readonly blockSize: number;
    /** 1 = any wrong answer fails a block; blockSize = all wrong. */
    readonly blockFailWhenIncorrectAtLeast: number;
    readonly resetOnSectionChange: boolean;
  };
  readonly scoring: {
    readonly method: "raw" | "proportion";
    readonly creditBelowStart: boolean;
  };
}

export const RESPONSE_TYPES = [
  "answered",
  "no_response",
  "skipped_by_examiner",
] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];

/**
 * One recorded answer. Both non-answer types are scored incorrect for now but
 * kept distinct in the data. `choiceIndex` must be null unless "answered".
 */
export interface ResponseEvent {
  readonly itemId: string;
  readonly responseType: ResponseType;
  readonly choiceIndex: number | null;
  /** Milliseconds from item shown to answer, measured by the caller. */
  readonly timeMs: number;
  /** Epoch ms when the answer was given, supplied by the caller. */
  readonly answeredAt: number;
}

export type StopReason = "ceiling" | "end-of-items";

export interface SessionState {
  readonly items: readonly Item[];
  readonly config: TestConfig;
  readonly participant: Participant;
  readonly startedAt: number;
  readonly startIndex: number;
  readonly events: readonly ResponseEvent[];
  /** Indices of administered items, in administration order. */
  readonly administered: readonly number[];
  readonly phase: "forward" | "backward";
  /** null = not applicable / undecided. */
  readonly basalMet: boolean | null;
  readonly basalRun: number;
  readonly lowestIndex: number;
  readonly highestIndex: number;
  readonly nextIndex: number;
  readonly ceilingRun: number;
  /** Incorrect answers so far in the current block. */
  readonly blockIncorrect: number;
  readonly lastSection: string | null;
  readonly stopReason: StopReason | null;
}

export interface ScoreResult {
  readonly method: TestConfig["scoring"]["method"];
  /** Raw count, or a 0..1 proportion when method is "proportion". */
  readonly total: number;
  readonly correctAdministered: number;
  readonly credited: number;
  readonly administered: number;
  readonly bySection: Readonly<Record<string, number>>;
  /** Number of events of each response type (non-answers are scored incorrect). */
  readonly byResponseType: Readonly<Record<ResponseType, number>>;
  readonly timing: {
    readonly totalTimeMs: number;
    readonly perItem: readonly {
      readonly itemId: string;
      readonly responseType: ResponseType;
      readonly correct: boolean;
      readonly timeMs: number;
      readonly answeredAt: number;
    }[];
  };
  readonly basalMet: boolean | null;
  readonly stopReason: StopReason | null;
}

export interface SessionContext {
  readonly items: readonly Item[];
  readonly config: TestConfig;
  readonly participant: Participant;
  readonly startedAt: number;
}
