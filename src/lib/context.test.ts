import { describe, expect, it } from "vitest";
import {
  assemble,
  estimateTokens,
  renderRecall,
  renderHistory,
  type ContextPart,
} from "@/lib/context";

/**
 * The budget exists because a model reading forty thousand tokens to find the
 * three that matter does the job worse than one handed the three — and does it
 * worse invisibly. So the tests are about the two things that must never be
 * invisible: what got cut, and what can never be cut.
 */

const part = (over: Partial<ContextPart> = {}): ContextPart => ({
  key: "k",
  kind: "RECORDS",
  priority: 50,
  text: "x".repeat(400), // 100 tokens
  ...over,
});

describe("the pinned block is not evictable", () => {
  it("keeps the brief when there is no room for anything else", () => {
    const out = assemble(
      [
        part({ key: "brief", kind: "PINNED", text: "y".repeat(400) }),
        part({ key: "records" }),
        part({ key: "recall", kind: "RECALLED", priority: 10 }),
      ],
      110,
    );

    expect(out.included).toEqual(["brief"]);
    expect(out.dropped.map((d) => d.key).sort()).toEqual(["recall", "records"]);
  });

  it("says so rather than trimming when the brief alone will not fit", () => {
    // An employee that forgot its ceiling because it was a busy Tuesday is the
    // worst failure available here, and it must never be silent.
    const out = assemble([part({ key: "brief", kind: "PINNED", text: "y".repeat(4000) })], 100);
    expect(out.overBudget).toBe(true);
    expect(out.text).toContain("y");
  });

  it("is not over budget when everything fits", () => {
    const out = assemble([part({ key: "brief", kind: "PINNED" })], 10_000);
    expect(out.overBudget).toBe(false);
  });
});

describe("eviction order", () => {
  it("drops the weakest priority first", () => {
    const out = assemble(
      [
        part({ key: "brief", kind: "PINNED", text: "b".repeat(40) }),
        part({ key: "learned", kind: "LEARNED", priority: 80 }),
        part({ key: "recall", kind: "RECALLED", priority: 60 }),
        part({ key: "history", kind: "HISTORY", priority: 40 }),
      ],
      230,
    );

    expect(out.included).toContain("learned");
    expect(out.dropped.map((d) => d.key)).toContain("history");
  });

  it("puts the pinned block first and then the strongest priority", () => {
    // The start of a long prompt is the strongest position in it, so the order
    // here is a decision about attention rather than about formatting.
    const out = assemble(
      [
        part({ key: "history", kind: "HISTORY", priority: 40, text: "history" }),
        part({ key: "brief", kind: "PINNED", text: "brief" }),
        part({ key: "learned", kind: "LEARNED", priority: 80, text: "learned" }),
      ],
      10_000,
    );
    expect(out.text).toBe("brief\n\nlearned\n\nhistory");
  });

  it("records why something was left out", () => {
    const out = assemble([part({ key: "brief", kind: "PINNED", text: "b" }), part({ key: "big" })], 50);
    expect(out.dropped[0]!.key).toBe("big");
    expect(out.dropped[0]!.reason).toMatch(/no room/);
  });

  it("is stable when priorities tie", () => {
    const a = assemble([part({ key: "b", priority: 5 }), part({ key: "a", priority: 5 })], 10_000);
    const b = assemble([part({ key: "a", priority: 5 }), part({ key: "b", priority: 5 })], 10_000);
    expect(a.included).toEqual(b.included);
  });
});

describe("the estimate", () => {
  it("counts four characters to the token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("rendering", () => {
  it("renders nothing at all when there is nothing to say", () => {
    // An empty heading with no bullets under it reads to a model as an absence
    // it has to explain, and it will occasionally explain it.
    expect(renderRecall([])).toBe("");
    expect(renderHistory([])).toBe("");
  });

  it("labels each passage with where it came from", () => {
    const out = renderRecall([{ content: "Trane XR16 serviced in May", sourceType: "LEAD" }]);
    expect(out).toContain("[lead]");
    expect(out).toContain("Trane XR16");
  });

  it("dates previous runs so the employee does not redo them", () => {
    const out = renderHistory([
      { dutyKey: "get-paid", summary: "Invoiced two jobs", at: new Date("2026-08-01T15:04:00Z") },
    ]);
    expect(out).toContain("2026-08-01 15:04");
    expect(out).toContain("Invoiced two jobs");
  });
});
