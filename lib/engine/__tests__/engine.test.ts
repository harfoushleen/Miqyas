import { describe, expect, it } from "vitest";
import { ConfigError, defaultConfig, parseConfig } from "../config";
import {
  nextItem,
  recordResponse,
  replay,
  score,
  startSession,
  stopReason,
} from "../engine";
import { placeholderItems } from "../placeholder-items";
import { answer, begin, cfg, currentId, makeItems, run } from "./helpers";

const T = true;
const F = false;

describe("placeholder items", () => {
  it("has 50 fake items, 25 per section, with valid answer keys", () => {
    expect(placeholderItems).toHaveLength(50);
    expect(
      placeholderItems.filter((i) => i.section === "grammar"),
    ).toHaveLength(25);
    expect(
      placeholderItems.filter((i) => i.section === "comprehension"),
    ).toHaveLength(25);
    for (const item of placeholderItems) {
      expect(item.prompt).toMatch(/PLACEHOLDER/);
      expect(item.correctIndex).toBeLessThan(item.choices.length);
    }
  });
});

describe("ceiling: consecutive incorrect", () => {
  it("all correct reaches the end of the items", () => {
    let s = begin(placeholderItems, defaultConfig);
    while (nextItem(s)) s = answer(s, T);
    expect(stopReason(s)).toBe("end-of-items");
    expect(s.events).toHaveLength(50);
    expect(score(s).total).toBe(50);
  });

  it("stops exactly on the 4th consecutive incorrect answer", () => {
    let s = begin(makeItems(20), defaultConfig);
    s = run(s, [T, T, F, F, F]);
    expect(stopReason(s)).toBeNull();
    expect(nextItem(s)).not.toBeNull();
    s = answer(s, F);
    expect(stopReason(s)).toBe("ceiling");
    expect(nextItem(s)).toBeNull();
    expect(s.events).toHaveLength(6);
  });

  it("resets the counter when a correct answer interrupts the run", () => {
    let s = begin(makeItems(20), defaultConfig);
    s = run(s, [F, F, F, T, F, F, F]);
    expect(stopReason(s)).toBeNull();
    s = answer(s, F);
    expect(stopReason(s)).toBe("ceiling");
  });

  it("rejects answers after the session has stopped", () => {
    const s = run(begin(makeItems(20), defaultConfig), [F, F, F, F]);
    expect(() =>
      recordResponse(s, { itemId: "t4", choiceIndex: 0, timestamp: 9 }),
    ).toThrow(/stopped/);
  });

  it("honours a custom threshold", () => {
    const s = run(
      begin(makeItems(20), cfg({ ceiling: { consecutiveIncorrect: 2 } })),
      [F, F],
    );
    expect(stopReason(s)).toBe("ceiling");
  });
});

describe("ceiling: section boundary", () => {
  // 10 items: A = 0..4, B = 5..9; start at item 3
  const items = makeItems(10, 5);
  const startAt3 = { start: { defaultItemIndex: 3 } };

  it("carries the run across sections when resetOnSectionChange is false", () => {
    const s = run(begin(items, cfg(startAt3)), [F, F, F, F]);
    expect(stopReason(s)).toBe("ceiling");
  });

  it("resets the run on entering a new section when resetOnSectionChange is true", () => {
    const config = cfg({
      ...startAt3,
      ceiling: { resetOnSectionChange: true },
    });
    let s = run(begin(items, config), [F, F, F, F, F]);
    expect(stopReason(s)).toBeNull();
    s = answer(s, F); // items 5..8 are four wrong in section B
    expect(stopReason(s)).toBe("ceiling");
    expect(s.events).toHaveLength(6);
  });
});

describe("ceiling: counted per block", () => {
  const blockCfg = cfg({
    ceiling: { countBy: "block", blockSize: 3, consecutiveIncorrect: 2 },
  });

  it("stops after N consecutive fully-incorrect blocks", () => {
    let s = run(begin(makeItems(20), blockCfg), [F, F, F, F, F]);
    expect(stopReason(s)).toBeNull();
    s = answer(s, F);
    expect(stopReason(s)).toBe("ceiling");
  });

  it("a block with any correct answer resets the block run", () => {
    let s = run(begin(makeItems(20), blockCfg), [F, F, F, F, T, F, F, F, F]);
    expect(stopReason(s)).toBeNull();
    s = run(s, [F, F, F]);
    expect(stopReason(s)).toBe("ceiling");
  });

  it("treats the final item as the end of the last block", () => {
    const s = begin(
      makeItems(4),
      cfg({
        start: { defaultItemIndex: 3 },
        ceiling: { countBy: "block", blockSize: 3, consecutiveIncorrect: 1 },
      }),
    );
    expect(stopReason(answer(s, F))).toBe("ceiling");
  });
});

describe("basal rule", () => {
  const items = makeItems(12);
  const basal = (extra: object = {}, startIndex = 5) =>
    cfg({
      start: { defaultItemIndex: startIndex },
      basal: { enabled: true, consecutiveCorrect: 2, ...extra },
    });

  it("is satisfied by N correct in a row from the start item", () => {
    const s = run(begin(items, basal()), [T, T]);
    expect(s.basalMet).toBe(true);
    expect(currentId(s)).toBe("t7");
  });

  it("goes backward when not met, then resumes forward once met", () => {
    let s = answer(begin(items, basal()), F); // item 5 wrong
    expect(currentId(s)).toBe("t4");
    s = run(s, [T, T]); // items 4, 3 correct => basal met
    expect(s.basalMet).toBe(true);
    expect(currentId(s)).toBe("t6");
  });

  it("restarts the correct-run if a backward item is wrong", () => {
    let s = run(begin(items, basal()), [F, T, F]);
    expect(currentId(s)).toBe("t2");
    s = run(s, [T, T]);
    expect(s.basalMet).toBe(true);
    expect(currentId(s)).toBe("t6");
  });

  it("does not count backward answers toward the ceiling", () => {
    const s = run(begin(items, basal()), [F, F, F, F, F]); // 5,4,3,2,1 all wrong
    expect(stopReason(s)).toBeNull();
    expect(currentId(s)).toBe("t0");
  });

  it("gives up at the first item, marks basal unmet and resumes forward", () => {
    const s = run(begin(items, basal({}, 1)), [F, F]); // item 1 then item 0
    expect(s.basalMet).toBe(false);
    expect(currentId(s)).toBe("t2");
  });

  it("with onFail=continue it keeps going forward and flags basal unmet", () => {
    const s = answer(begin(items, basal({ onFail: "continue" })), F);
    expect(s.basalMet).toBe(false);
    expect(currentId(s)).toBe("t6");
    const later = run(s, [T, T, T]);
    expect(later.basalMet).toBe(false);
  });

  it("cannot go backward from the very first item", () => {
    const s = answer(begin(items, basal({}, 0)), F);
    expect(s.basalMet).toBe(false);
    expect(currentId(s)).toBe("t1");
  });

  it("is ignored entirely when disabled", () => {
    const s = answer(begin(items, cfg({ start: { defaultItemIndex: 5 } })), F);
    expect(s.basalMet).toBeNull();
    expect(currentId(s)).toBe("t6");
  });
});

describe("start item", () => {
  const items = makeItems(20);
  const config = cfg({
    start: {
      defaultItemIndex: 2,
      byGrade: { "3": 8 },
      byAge: [{ minAge: 4, maxAge: 6, itemIndex: 5 }],
    },
  });

  it.each([
    [{ grade: "3", age: 5 }, "t8"], // grade wins over age
    [{ age: 5 }, "t5"],
    [{ age: 9 }, "t2"],
    [{ grade: "9" }, "t2"],
    [{}, "t2"],
  ])("resolves %o to %s", (participant, id) => {
    expect(currentId(begin(items, config, participant))).toBe(id);
  });

  it("rejects a start index beyond the item list", () => {
    expect(() =>
      begin(makeItems(3), cfg({ start: { defaultItemIndex: 3 } })),
    ).toThrow(/start item index 3/);
  });

  it("rejects an empty item list", () => {
    expect(() => begin([], defaultConfig)).toThrow(/no items/);
  });
});

describe("recordResponse validation", () => {
  const s = begin(makeItems(5), defaultConfig);

  it("rejects a response for an item that is not current", () => {
    expect(() =>
      recordResponse(s, { itemId: "t3", choiceIndex: 0, timestamp: 1 }),
    ).toThrow(/expected t0/);
  });

  it.each([-1, 2, 0.5])("rejects invalid choice index %s", (choiceIndex) => {
    expect(() =>
      recordResponse(s, { itemId: "t0", choiceIndex, timestamp: 1 }),
    ).toThrow(/choice/);
  });

  it("treats a null choice (no answer) as incorrect", () => {
    const next = recordResponse(s, {
      itemId: "t0",
      choiceIndex: null,
      timestamp: 1,
    });
    expect(score(next).total).toBe(0);
    expect(next.events).toHaveLength(1);
  });

  it("does not mutate the previous state", () => {
    const before = JSON.stringify(s);
    answer(s, T);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("scoring", () => {
  const items = makeItems(10, 5);

  it("raw score counts only administered correct answers by default", () => {
    const s = run(begin(items, cfg({ start: { defaultItemIndex: 5 } })), [
      T,
      T,
      F,
      T,
      T,
    ]);
    const r = score(s);
    expect(r.total).toBe(4);
    expect(r.administered).toBe(5);
    expect(r.credited).toBe(0);
    expect(r.bySection).toEqual({ A: 0, B: 4 });
  });

  it("credits unadministered items below the start when configured", () => {
    const config = cfg({
      start: { defaultItemIndex: 5 },
      scoring: { creditBelowStart: true },
    });
    const r = score(run(begin(items, config), [T, T, T, T, T]));
    expect(r.credited).toBe(5);
    expect(r.total).toBe(10);
    expect(r.bySection).toEqual({ A: 5, B: 5 });
  });

  it("does not credit when basal was required and not met", () => {
    const config = cfg({
      start: { defaultItemIndex: 5 },
      basal: { enabled: true, onFail: "continue" },
      scoring: { creditBelowStart: true },
    });
    const r = score(run(begin(items, config), [F, T, T]));
    expect(r.basalMet).toBe(false);
    expect(r.credited).toBe(0);
  });

  it("does not double-credit items administered during a backward pass", () => {
    const config = cfg({
      start: { defaultItemIndex: 5 },
      basal: { enabled: true, consecutiveCorrect: 2 },
      scoring: { creditBelowStart: true },
    });
    const r = score(run(begin(items, config), [F, T, T]));
    expect(r.basalMet).toBe(true);
    expect(r.administered).toBe(3);
    expect(r.credited).toBe(3); // items 0, 1, 2
    expect(r.total).toBe(2 + 3);
  });

  it("proportion method divides by administered + credited items", () => {
    const config = cfg({ scoring: { method: "proportion" } });
    const r = score(run(begin(items, config), [T, F, T, T]));
    expect(r.total).toBeCloseTo(0.75);
  });

  it("proportion of an empty session is 0", () => {
    const r = score(begin(items, cfg({ scoring: { method: "proportion" } })));
    expect(r.total).toBe(0);
  });
});

describe("replay", () => {
  it("reproduces the same state and score from the event log", () => {
    const config = cfg({
      start: { defaultItemIndex: 5 },
      basal: { enabled: true, consecutiveCorrect: 2 },
      scoring: { creditBelowStart: true },
    });
    const ctx = {
      items: placeholderItems,
      config,
      participant: {},
      startedAt: 1_000,
    };
    const live = run(startSession(ctx), [F, T, T, T, F, T, F, F, F, F]);
    const replayed = replay(ctx, live.events);
    expect(replayed).toEqual(live);
    expect(score(replayed)).toEqual(score(live));
    expect(stopReason(replayed)).toBe("ceiling");
  });

  it("rescores the same events under a different config", () => {
    const ctx = {
      items: makeItems(10),
      config: defaultConfig,
      participant: {},
      startedAt: 0,
    };
    const live = run(startSession(ctx), [T, T, F, T]);
    const other = replay(
      { ...ctx, config: cfg({ scoring: { method: "proportion" } }) },
      live.events,
    );
    expect(score(other).total).toBeCloseTo(0.75);
    expect(score(live).total).toBe(3);
  });

  it("an empty event log yields a fresh session", () => {
    const ctx = {
      items: makeItems(3),
      config: defaultConfig,
      participant: {},
      startedAt: 0,
    };
    expect(replay(ctx, [])).toEqual(startSession(ctx));
  });
});

describe("config validation", () => {
  it("default config stops after 4 consecutive incorrect items", () => {
    expect(parseConfig().ceiling).toMatchObject({
      consecutiveIncorrect: 4,
      countBy: "item",
      resetOnSectionChange: false,
    });
    expect(parseConfig({})).toEqual(defaultConfig);
    expect(parseConfig(defaultConfig)).toEqual(defaultConfig);
  });

  it("names the offending field when a value is out of range", () => {
    expect(() => parseConfig({ ceiling: { consecutiveIncorrect: 0 } })).toThrow(
      ConfigError,
    );
    expect(() => parseConfig({ ceiling: { consecutiveIncorrect: 0 } })).toThrow(
      /ceiling\.consecutiveIncorrect/,
    );
  });

  it("rejects wrong types, unknown keys and bad enums", () => {
    expect(() => parseConfig({ basal: { enabled: "yes" } })).toThrow(
      /basal\.enabled/,
    );
    expect(() => parseConfig({ ceilling: {} })).toThrow(/ceilling/);
    expect(() => parseConfig({ scoring: { method: "magic" } })).toThrow(
      /scoring\.method/,
    );
    expect(() => parseConfig("nope")).toThrow(ConfigError);
  });

  it("rejects an age range where min is greater than max", () => {
    expect(() =>
      parseConfig({
        start: { byAge: [{ minAge: 9, maxAge: 5, itemIndex: 0 }] },
      }),
    ).toThrow(/minAge/);
  });

  it("reports a root-level problem without a path", () => {
    expect(() => parseConfig(null)).toThrow(/Invalid test config/);
  });
});
