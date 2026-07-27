import { describe, it, expect } from "vitest";
import {
  PARENT_SERVICES,
  FLIGHT_PLANS,
  OPERATORS,
  operatorByName,
  MANIFEST,
  REVENUE_LEVERS,
  AUTOMATION_LOOPS,
  FLAGSHIP,
  CREATION_DISCLAIMER,
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

  it("gives every service at least one thing to bolt on", () => {
    // Deliberately >= 1. This floor started at 3, dropped to 2 when the
    // roster cut four upgrades, and dropped again when the Manifest cut three
    // more. Each time the honest move was to lower the floor rather than
    // invent work to meet it — Premium AI Ads holds exactly one upgrade
    // because the Manifest genuinely covers everything except the camera.
    for (const s of PARENT_SERVICES) {
      expect(upgradesFor(s.key).length, s.key).toBeGreaterThanOrEqual(1);
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

describe("rule three: nothing an operator already does", () => {
  it("lists the full roster of ten named operators", () => {
    expect(OPERATORS).toHaveLength(10);
    const names = OPERATORS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Herald");
    expect(names).toContain("Echo");
    expect(names).toContain("Closer");
    expect(operatorByName("Vector")?.role).toBe("Autonomous Media Buyer");
  });

  it("describes what each operator covers, so the check has something to read", () => {
    for (const o of OPERATORS) {
      expect(o.covers.length, o.name).toBeGreaterThan(80);
      expect(o.role.length, o.name).toBeGreaterThan(5);
      expect(o.chip.length, o.name).toBeGreaterThan(3);
    }
  });

  it("sells nothing the roster already does", () => {
    // The rule that earned its keep the day the AI Employees page arrived.
    // Four upgrades — AI search, map pack, reviews, multi-channel inbox — were
    // Herald, Echo and Closer's day jobs, and every one of them looked
    // obviously additive until the roster was written down next to them.
    //
    // The check is a distinctive-noun overlap: if an upgrade's own copy uses
    // most of the specific words an operator uses, they are describing the
    // same work.
    const STOP = new Set([
      "against", "across", "before", "between", "their", "there", "these", "those",
      "which", "while", "where", "every", "other", "about", "after", "still",
      "customer", "customers", "business", "clients", "client",
    ]);
    const words = (text: string) =>
      new Set(
        text
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((w) => w.length > 5 && !STOP.has(w)),
      );

    for (const u of UPGRADES) {
      const claim = words([u.name, u.promise, ...u.delivers].join(" "));
      for (const op of OPERATORS) {
        const covered = words(op.covers);
        const shared = [...covered].filter((w) => claim.has(w));
        // Naming an operator to contrast against is fine and encouraged; what
        // is not fine is describing the same job in the same terms.
        expect(
          shared.length,
          `${u.key} overlaps ${op.name} (${op.role}) on: ${shared.join(", ")}`,
        ).toBeLessThanOrEqual(3);
      }
    }
  });

  it("positions each upgrade against the crew rather than ignoring it", () => {
    // At least one upgrade per service should name an operator explicitly.
    // A page that never mentions the crew reads as though it does not know
    // what the client already has.
    const named = UPGRADES.filter((u) =>
      OPERATORS.some((o) => `${u.promise} ${u.demandCase}`.includes(o.name)),
    );
    expect(named.length).toBeGreaterThanOrEqual(4);
  });
});

describe("rule four: nothing the Manifest already promises", () => {
  it("carries the automation spine and the flagship engagement", () => {
    expect(AUTOMATION_LOOPS.length).toBeGreaterThanOrEqual(4);
    for (const l of AUTOMATION_LOOPS) {
      expect(l.detail.length, l.name).toBeGreaterThan(60);
      expect(l.cadence.length, l.name).toBeGreaterThan(3);
    }
    expect(FLAGSHIP.includes.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps upgrade names clear of the flagship's own vocabulary", () => {
    // The flagship promises "white-glove install and training". An upgrade
    // called The Training Lab sat directly across that phrase and would have
    // had a client asking which training they were buying — so it is now the
    // Tuning Lab. Same work, no ambiguity.
    const flagshipWords = FLAGSHIP.includes.join(" ").toLowerCase();
    for (const u of UPGRADES) {
      const head = u.name.toLowerCase().replace(/^the /, "").split(" ")[0];
      expect(flagshipWords, `${u.key} name collides with the flagship`).not.toContain(head);
    }
  });

  it("carries both revenue levers with their bullets", () => {
    expect(REVENUE_LEVERS.map((l) => l.code)).toEqual(["AOV", "LTV"]);
    for (const l of REVENUE_LEVERS) {
      expect(l.bullets.length, l.code).toBeGreaterThanOrEqual(4);
    }
  });

  it("lists all twelve numbered items", () => {
    expect(MANIFEST).toHaveLength(12);
    expect(MANIFEST.map((m) => m.n)).toEqual([
      "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
    ]);
    for (const m of MANIFEST) {
      expect(m.detail.length, m.title).toBeGreaterThan(30);
    }
  });

  it("quotes the boundary the whole site depends on", () => {
    // The Ad Management hero. If PHX/GROWTH ever starts making ads, the
    // Motion Unit is not additive any more and this catalogue loses its
    // largest item — so the sentence is pinned here where it will be noticed.
    expect(CREATION_DISCLAIMER).toContain("don't make your ads");
  });

  it("sells nothing the Manifest already promises", () => {
    // Third pass of the same check, against the strictest list yet. This one
    // cut an offer lab (07), a tracking rebuild (02) and a conversion lab
    // (06). The pattern is consistent: everything looks additive until the
    // parent's own words are sitting in the same file.
    const STOP = new Set([
      "against", "across", "before", "between", "their", "there", "these", "those",
      "which", "while", "where", "every", "other", "about", "after", "still",
      "actually", "really", "whoever", "little",
    ]);
    const words = (text: string) =>
      new Set(
        text
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((w) => w.length > 5 && !STOP.has(w)),
      );

    // Both the Manifest and the revenue levers. A Manifest-only check let an
    // offer-lab upgrade through, because item 07 is terse ("AOV is a managed
    // number") while the detail that actually kills it — "offer architecture
    // managed like media: bundles, thresholds, post-purchase upsells" — is in
    // the AOV lever. Checking half the parent's scope is worse than checking
    // none, because it reads as a check that passed.
    const scope = [
      ...MANIFEST.map((m) => ({ label: `Manifest ${m.n} "${m.title}"`, text: `${m.title} ${m.detail}` })),
      ...REVENUE_LEVERS.flatMap((l) =>
        l.bullets.map((b) => ({ label: `${l.code} lever`, text: b })),
      ),
      ...AUTOMATION_LOOPS.map((l) => ({ label: `loop "${l.name}"`, text: `${l.name} ${l.detail}` })),
      ...FLAGSHIP.includes.map((b) => ({ label: `${FLAGSHIP.name} engagement`, text: b })),
    ];

    for (const u of UPGRADES) {
      const claim = words([u.name, u.promise, ...u.delivers].join(" "));
      for (const item of scope) {
        const covered = words(item.text);
        const shared = [...covered].filter((w) => claim.has(w));
        expect(
          shared.length,
          `${u.key} overlaps ${item.label} on: ${shared.join(", ")}`,
        ).toBeLessThanOrEqual(2);
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
