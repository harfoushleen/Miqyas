import type { Item } from "./types";

/**
 * FAKE items for development and tests only.
 * The real assessment items belong to the professor and must NEVER be committed.
 * Ordered by (fake) difficulty: 25 grammar items, then 25 comprehension items.
 */
function build(
  section: "grammar" | "comprehension",
  count: number,
  offset: number,
): Item[] {
  return Array.from({ length: count }, (_, i) => {
    const n = offset + i + 1;
    return {
      id: `placeholder-${String(n).padStart(2, "0")}`,
      section,
      prompt: `PLACEHOLDER ${section} item ${n}: pick the right answer`,
      choices: [
        "PLACEHOLDER A",
        "PLACEHOLDER B",
        "PLACEHOLDER C",
        "PLACEHOLDER D",
      ],
      correctIndex: n % 4,
    };
  });
}

export const placeholderItems: readonly Item[] = [
  ...build("grammar", 25, 0),
  ...build("comprehension", 25, 25),
];
