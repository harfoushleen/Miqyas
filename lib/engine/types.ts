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
    readonly resetOnSectionChange: boolean;
  };
  readonly scoring: {
    readonly method: "raw" | "proportion";
    readonly creditBelowStart: boolean;
  };
}

/** One recorded answer. `choiceIndex: null` = no answer (counts as incorrect). */
export interface ResponseEvent {
  readonly itemId: string;
  readonly choiceIndex: number | null;
  /** Epoch ms, supplied by the caller. */
  readonly timestamp: number;
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
  readonly blockAllWrong: boolean;
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
  readonly basalMet: boolean | null;
  readonly stopReason: StopReason | null;
}

export interface SessionContext {
  readonly items: readonly Item[];
  readonly config: TestConfig;
  readonly participant: Participant;
  readonly startedAt: number;
}
