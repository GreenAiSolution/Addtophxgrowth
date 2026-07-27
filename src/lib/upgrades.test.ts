import { describe, it, expect } from "vitest";
import {
  PARENT_SERVICES,
  FLIGHT_PLANS,
  UPGRADES,
  serviceByKey,
  upgradesFor,
  upgradeByKey,
  entryPrice,
  THESIS,
  FLIGHT_CHECK,
  FAIR_QUESTIONS,
} from "@/lib/upgrades";

describe("the services these attach to", () => {
  it("names all three PHX/GROWTH à la carte services once each", () => {
    const keys = PARENT_SERVICES.map((s) => s.key);
    expect(keys).toEqual(["premium-ai-ads", "ai-employees", "website-creation"]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries the parent's own price, bullets and a stated ceiling", () => {
    // The ceiling is what the upgrades answer. Without it the page is just a
    // second menu competing with the agency's own.
    for (const s of PARENT_SERVICES) {
      expect(s.priceLabel, s.key).toMatch(/\$[\d,]+/);
      expect(s.includes.length, s.key).toBeGreaterThanOrEqual(4);
      expect(s.role.length, s.key).toBeGreaterThan(40);
      expect(s.ceiling.length, s.key).toBeGreaterThan(100);
    }
  });

  it("resolves by key", () => {
    expect(serviceByKey("ai-employees")?.name).toBe("AI Employees");
    expect(serviceByKey("nope" as never)).toBeUndefined();
  });
});

describe("the flight plans", () => {
  it("lists the parent's three managed tiers with fees that fall as spend rises", () => {
    expect(FLIGHT_PLANS.map((p) => p.name)).toEqual(["Pilot", "Squadron", "Fleet Command"]);
    const fees = FLIGHT_PLANS.map((p) => Number(p.fee.match(/(\d+)%/)![1]));
    expect(fees).toEqual([...fees].sort((a, b) => b - a));
  });

  it("marks at most one tier per badge", () => {
    const badges = FLIGHT_PLANS.map((p) => p.badge).filter(Boolean);
    expect(new Set(badges).size).toBe(badges.length);
  });
});

describe("rule one: every upgrade is attached", () => {
  it("attaches every upgrade to a real service", () => {
    // The load-bearing rule of the whole site. An upgrade that attaches to
    // nothing is a second agency in disguise.
    const known = new Set(PARENT_SERVICES.map((s) => s.key));
    for (const u of UPGRADES) {
      expect(known.has(u.attachesTo), `${u.key} → ${u.attachesTo}`).toBe(true);
    }
  });

  it("gives every service something to bolt on", () => {
    for (const s of PARENT_SERVICES) {
      expect(upgradesFor(s.key).length, s.key).toBeGreaterThanOrEqual(3);
    }
    expect(PARENT_SERVICES.flatMap((s) => upgradesFor(s.key)).length).toBe(UPGRADES.length);
  });
});

describe("rule two: every upgrade is additive", () => {
  it("never sells what the parent service already includes", () => {
    // The rule that keeps this honest. `includes` is a verbatim copy of
    // PHX/GROWTH's own bullet list, so if they ever start shipping one of
    // these as standard, this fails and the upgrade has to change or go.
    // Selling a client something they already pay for loses the sale AND the
    // relationship.
    for (const u of UPGRADES) {
      const service = serviceByKey(u.attachesTo)!;
      for (const included of service.includes) {
        const claim = [u.name, u.promise, ...u.delivers].join(" ").toLowerCase();
        // Compare on the distinctive words of the parent's bullet, ignoring
        // filler, so "Fresh creative on demand" is caught but "on" is not.
        const distinctive = included
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((w) => w.length > 4);
        const overlap = distinctive.filter((w) => claim.includes(w));
        expect(
          overlap.length,
          `${u.key} restates "${included}" from ${service.name} (${overlap.join(", ")})`,
        ).toBeLessThan(distinctive.length);
      }
    }
  });
});

describe("the upgrades", () => {
  it("has no duplicate keys or names", () => {
    const keys = UPGRADES.map((u) => u.key);
    const names = UPGRADES.map((u) => u.name);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks exactly one leading upgrade per service", () => {
    for (const s of PARENT_SERVICES) {
      const leading = upgradesFor(s.key).filter((u) => u.leading);
      expect(leading.length, `${s.key}: ${leading.map((u) => u.key).join(", ")}`).toBe(1);
    }
  });

  it("marks exactly one apex upgrade on the whole page", () => {
    // Gold is the parent's apex accent and they spend it once, on Fleet
    // Command. Spending it twice here would flatten the same signal.
    expect(UPGRADES.filter((u) => u.apex).length).toBe(1);
  });

  it("lists each service most expensive first", () => {
    for (const s of PARENT_SERVICES) {
      const prices = upgradesFor(s.key).map((u) => u.price);
      expect(prices, s.key).toEqual([...prices].sort((a, b) => b - a));
    }
  });

  it("prices every upgrade below the service it attaches to", () => {
    // An upgrade that costs more than the thing it upgrades is not an upgrade.
    for (const u of UPGRADES) {
      const service = serviceByKey(u.attachesTo)!;
      const parent = Number(service.priceLabel.replace(/[^\d]/g, "")) * 100;
      expect(u.price, `${u.key} vs ${service.name}`).toBeLessThan(parent);
    }
  });

  it("argues the demand rather than asserting it", () => {
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
    // A fabricated "+312%" anywhere destroys that, and it is the easiest thing
    // in the world to add later without thinking.
    const copy = UPGRADES.flatMap((u) => [u.promise, u.demandCase, u.fixes, ...u.delivers]).join(" ");
    expect(copy).not.toMatch(/\d+(\.\d+)?\s?%/);
    expect(copy).not.toMatch(/\d+(\.\d+)?\s?[x×]\s+(more|better|faster|higher|return)/i);
  });

  it("resolves by key and reports a real entry price", () => {
    expect(upgradeByKey("voice-employee")?.name).toBe("The Voice Employee");
    expect(upgradeByKey("not-a-thing")).toBeUndefined();
    const low = entryPrice();
    expect(UPGRADES.some((u) => u.billing === "monthly" && u.price === low)).toBe(true);
  });
});

describe("the page's promise", () => {
  it("makes an argument and names the parent agency", () => {
    expect(THESIS.headline.length).toBeGreaterThan(15);
    expect(THESIS.body.length).toBeGreaterThan(150);
    expect(THESIS.body).toContain("PHX/GROWTH");
  });

  it("offers the parent's guarantee rather than a different one", () => {
    // A second, different guarantee on the upgrade counter would leave a
    // client unsure which one applies to what.
    expect(FLIGHT_CHECK.label).toContain("30-Day Flight Check");
    expect(FLIGHT_CHECK.body).toContain("30 days");
    expect(FLIGHT_CHECK.body).toContain("no lock-in");
  });

  it("answers the objections in plain English", () => {
    expect(FAIR_QUESTIONS.length).toBeGreaterThanOrEqual(4);
    for (const f of FAIR_QUESTIONS) {
      expect(f.q.endsWith("?"), f.q).toBe(true);
      expect(f.a.length, f.q).toBeGreaterThan(100);
    }
  });

  it("states the parent's real performance fees, in the parent's order", () => {
    const fee = FAIR_QUESTIONS.find((f) => f.q.includes("performance fee"));
    expect(fee).toBeDefined();
    for (const plan of FLIGHT_PLANS) {
      expect(fee!.a, plan.name).toContain(plan.fee.match(/\d+%/)![0]);
      expect(fee!.a).toContain(plan.name);
    }
  });
});
