import { describe, it, expect } from "vitest";
import {
  PARENT_SERVICES,
  UPGRADES,
  serviceByKey,
  upgradesFor,
  upgradeByKey,
  entryPrice,
  THESIS,
  TERMS,
} from "@/lib/upgrades";

describe("the services these attach to", () => {
  it("names all three PHX Growth services once each", () => {
    const keys = PARENT_SERVICES.map((s) => s.key);
    expect(keys).toEqual(["ai-employees", "ad-growth", "web-seo-ads"]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("states a role and a ceiling for each", () => {
    // The ceiling is what the upgrades answer. Without it the page is just a
    // second menu of services competing with the agency's own.
    for (const s of PARENT_SERVICES) {
      expect(s.role.length, s.key).toBeGreaterThan(60);
      expect(s.ceiling.length, s.key).toBeGreaterThan(100);
    }
  });

  it("resolves by key", () => {
    expect(serviceByKey("ai-employees")?.name).toBe("AI Employees");
    expect(serviceByKey("nope" as never)).toBeUndefined();
  });
});

describe("the upgrades", () => {
  it("has no duplicate keys or names", () => {
    const keys = UPGRADES.map((u) => u.key);
    const names = UPGRADES.map((u) => u.name);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("attaches every upgrade to a real service", () => {
    // The load-bearing rule of the whole site. An upgrade that attaches to
    // nothing is a second agency in disguise, which is what this rebuild
    // exists to remove.
    const known = new Set(PARENT_SERVICES.map((s) => s.key));
    for (const u of UPGRADES) {
      expect(known.has(u.attachesTo), `${u.key} → ${u.attachesTo}`).toBe(true);
    }
  });

  it("gives every service something to bolt on", () => {
    for (const s of PARENT_SERVICES) {
      expect(upgradesFor(s.key).length, s.key).toBeGreaterThanOrEqual(3);
    }
    const grouped = PARENT_SERVICES.flatMap((s) => upgradesFor(s.key));
    expect(grouped.length).toBe(UPGRADES.length);
  });

  it("marks exactly one leading upgrade per service", () => {
    for (const s of PARENT_SERVICES) {
      const leading = upgradesFor(s.key).filter((u) => u.leading);
      expect(leading.length, `${s.key}: ${leading.map((u) => u.key).join(", ")}`).toBe(1);
    }
  });

  it("lists each service most expensive first", () => {
    for (const s of PARENT_SERVICES) {
      const prices = upgradesFor(s.key).map((u) => u.price);
      expect(prices, s.key).toEqual([...prices].sort((a, b) => b - a));
    }
  });

  it("prices everything above zero", () => {
    for (const u of UPGRADES) {
      expect(u.price, u.key).toBeGreaterThan(0);
    }
  });

  it("argues the demand rather than asserting it", () => {
    // `demandCase` is the reason this page exists. A one-liner there would
    // turn the whole thing back into a list of services.
    for (const u of UPGRADES) {
      expect(u.demandCase.length, u.key).toBeGreaterThan(200);
      expect(u.promise.length, u.key).toBeGreaterThan(30);
      expect(u.fixes.length, u.key).toBeGreaterThan(10);
    }
  });

  it("says concretely what is delivered", () => {
    for (const u of UPGRADES) {
      expect(u.delivers.length, u.key).toBeGreaterThanOrEqual(3);
      for (const line of u.delivers) {
        expect(line.length, `${u.key}: "${line}"`).toBeGreaterThan(20);
      }
    }
  });

  it("quotes no invented statistics", () => {
    // The pitch of this page is that it tells the truth about what it sells.
    // A fabricated "+312%" anywhere in the copy destroys that, and it is the
    // easiest thing in the world to add later without thinking.
    const copy = UPGRADES.flatMap((u) => [u.promise, u.demandCase, u.fixes, ...u.delivers]).join(" ");
    expect(copy).not.toMatch(/\d+(\.\d+)?\s?%/);
    expect(copy).not.toMatch(/\d+(\.\d+)?\s?[x×]\s+(more|better|faster|higher|return)/i);
  });

  it("resolves by key", () => {
    expect(upgradeByKey("voice-employee")?.name).toBe("The Voice Employee");
    expect(upgradeByKey("not-a-thing")).toBeUndefined();
  });

  it("reports an entry price that is a real monthly upgrade", () => {
    const low = entryPrice();
    expect(UPGRADES.some((u) => u.billing === "monthly" && u.price === low)).toBe(true);
  });
});

describe("the page's promise", () => {
  it("makes an argument and names the parent agency's work", () => {
    expect(THESIS.headline.length).toBeGreaterThan(15);
    expect(THESIS.body.length).toBeGreaterThan(150);
    expect(THESIS.body).toContain("PHX Growth");
  });

  it("states the terms plainly, and enough of them to be useful", () => {
    expect(TERMS.length).toBeGreaterThanOrEqual(4);
    for (const t of TERMS) {
      expect(t.term.length, t.term).toBeGreaterThan(3);
      expect(t.detail.length, t.term).toBeGreaterThan(80);
    }
  });
});
