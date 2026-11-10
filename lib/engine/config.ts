import { z } from "zod";
import type { TestConfig } from "./types";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const index = z.number().int().min(0);
const positive = z.number().int().min(1);

const startSchema = z.strictObject({
  defaultItemIndex: index.default(0),
  byAge: z
    .array(
      z
        .strictObject({
          minAge: z.number().min(0),
          maxAge: z.number().min(0),
          itemIndex: index,
        })
        .refine((r) => r.minAge <= r.maxAge, {
          message: "minAge must not be greater than maxAge",
          path: ["minAge"],
        }),
    )
    .default([]),
  byGrade: z.record(z.string(), index).default({}),
});

const basalSchema = z.strictObject({
  enabled: z.boolean().default(false),
  consecutiveCorrect: positive.default(3),
  onFail: z.enum(["go-back", "continue"]).default("go-back"),
});

const ceilingSchema = z
  .strictObject({
    consecutiveIncorrect: positive.default(4),
    countBy: z.enum(["item", "block"]).default("item"),
    blockSize: positive.default(5),
    /**
     * A block fails when it has at least this many incorrect answers:
     * 1 = any wrong answer fails the block, blockSize = all wrong.
     */
    blockFailWhenIncorrectAtLeast: positive.default(1),
    resetOnSectionChange: z.boolean().default(false),
  })
  .refine((c) => c.blockFailWhenIncorrectAtLeast <= c.blockSize, {
    message: "blockFailWhenIncorrectAtLeast must not be greater than blockSize",
    path: ["blockFailWhenIncorrectAtLeast"],
  });

const scoringSchema = z.strictObject({
  method: z.enum(["raw", "proportion"]).default("raw"),
  creditBelowStart: z.boolean().default(false),
});

export const testConfigSchema = z.strictObject({
  start: startSchema.default(() => startSchema.parse({})),
  basal: basalSchema.default(() => basalSchema.parse({})),
  ceiling: ceilingSchema.default(() => ceilingSchema.parse({})),
  scoring: scoringSchema.default(() => scoringSchema.parse({})),
});

/** Validate (and fill defaults for) a config. Throws ConfigError naming the bad fields. */
export function parseConfig(input: unknown = {}): TestConfig {
  const result = testConfigSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
    throw new ConfigError(`Invalid test config: ${details}`);
  }
  return result.data;
}

/** Default config: stop after 4 consecutive incorrect items; no basal; raw score. */
export const defaultConfig: TestConfig = parseConfig({});
