import { describe, expect, it } from "vitest";
import {
  RIVALS,
  SCORECARD,
  VERSUS,
  rivalFor,
  allowedAnchors,
} from "@/lib/rivals";
import { UPGRADES, FLIGHT_CHECK } from "@/lib/upgrades";

/**
 * The comparison is the easiest section on the site to corrupt, because every
 * failure mode reads as good marketing: drop the steelman and the table gets
 * more flattering, name a competitor and the copy gets more concrete, add a
 * percentage and the edge gets punchier. Each of those would quietly turn the
 * most credible section of the page into the least — so each one fails a
 * build instead of a reader.
 */

/** Every string a visitor can read in the comparison. */
function comparisonProse(): string {
  return [
    VERSUS.eyebrow,
    VERSUS.headline,
    VERSUS.body,
    ...RIVALS.flatMap((r) => [r.route, r.credit, r.holding, r.edge]),
    ...SCORECARD.flatMap((s) => [s.q, s.us]),
  ].join("\n");
}

describe("every upgrade is compared, and compared to something real", () => {
  it("names exactly one rival per upgrade, and no orphans", () => {
    // An upgrade with no named alternative leaves the visitor to run the
    // comparison alone on the rival's landing page — the exact failure this
    // section exists to prevent.
    for (const u of UPGRADES) {
      const matches = RIVALS.filter((r) => r.upgradeKey === u.key);
      expect(matches, `${u.key} has no rival — the buyer will find one anyway`).toHaveLength(1);
    }
    for (const r of RIVALS) {
      expect(
        UPGRADES.some((u) => u.key === r.upgradeKey),
        `rival "${r.route}" compares against an upgrade that does not exist`,
      ).toBe(true);
    }
  });

  it("resolves by key", () => {
    expect(rivalFor("voice-employee")?.route).toContain("receptionist");
    expect(rivalFor("not-a-thing")).toBeUndefined();
  });
});

describe("the steelman is real, not a token", () => {
  it("credits every rival with something genuine", () => {
    // The credit is what buys the section its credibility. A one-line nod is
    // a token; the floor forces an actual concession.
    for (const r of RIVALS) {
      expect(r.credit.length, `${r.upgradeKey}: the steelman is a token`).toBeGreaterThan(120);
      expect(r.holding.length, r.upgradeKey).toBeGreaterThan(150);
      expect(r.edge.length, r.upgradeKey).toBeGreaterThan(150);
    }
  });

  it("credits and criticises in different words", () => {
    // A "steelman" that restates the criticism is the tell of a rigged
    // comparison. Cheap structural check: the credit may not simply appear
    // inside the holding, or vice versa.
    for (const r of RIVALS) {
      expect(r.credit, r.upgradeKey).not.toBe(r.holding);
      expect(r.holding.includes(r.credit), r.upgradeKey).toBe(false);
      expect(r.credit.includes(r.holding), r.upgradeKey).toBe(false);
    }
  });
});

describe("the edge is anchored, not a slogan", () => {
  it("hangs every edge on a real operator, service, upgrade or mechanism", () => {
    // "We're better because we care" survives any rewrite. "The Motion Unit
    // films the briefs Prism already wrote" is falsifiable — remove Prism from
    // the roster and this fails. That is the difference between positioning
    // and a slogan, and it is checkable.
    const allowed = allowedAnchors();
    for (const r of RIVALS) {
      expect(
        allowed.has(r.anchor),
        `${r.upgradeKey}: anchor "${r.anchor}" is not a real operator, service, upgrade or published mechanism`,
      ).toBe(true);
      expect(
        r.edge.includes(r.anchor),
        `${r.upgradeKey}: the edge never mentions its own anchor "${r.anchor}"`,
      ).toBe(true);
    }
  });
});

describe("categories, never companies", () => {
  it("names no vendor anywhere in the comparison", () => {
    // A claim about a named company starts drifting false the day they change
    // their pricing page, and nothing on this site may be a claim we cannot
    // re-verify on every build. This list is the vendors a buyer is most
    // likely to shop these upgrades against; extend it as the market moves.
    const banned =
      /\b(Jobber|Housecall|ServiceTitan|Smith\.ai|Ruby|Slang|Dialzara|Billo|Insense|Superside|Profound|Scrunch|AthenaHQ|Otterly|Peec|Madgicx|Revealbot|Smartly|AdStellar|Superscale|Podium|Birdeye|Mailchimp|Klaviyo)\b/i;
    const prose = comparisonProse();
    expect(prose.match(banned), "the comparison names a vendor").toBeNull();
  });
});

describe("the comparison obeys the site's own honesty rules", () => {
  it("claims no outcomes: no percentages, multiples or guarantees", () => {
    // The section's authority comes from the same posture as the rest of the
    // page. One "+40%" in an edge and the whole steelman structure reads as
    // theatre.
    const prose = comparisonProse();
    expect(prose).not.toMatch(/\d+(\.\d+)?\s?%/);
    expect(prose).not.toMatch(/\d+(\.\d+)?\s?[x×]\s/i);
    expect(prose).not.toMatch(/\b(guarantee[ds]?|guaranteed) (results?|roas|revenue|growth)\b/i);
  });

  it("frames attachment as the difference, and argues it", () => {
    expect(VERSUS.body.length).toBeGreaterThan(200);
    expect(VERSUS.body.toLowerCase()).toContain("attach");
  });
});

describe("the scorecard grades us in public", () => {
  it("asks real questions and answers each substantively", () => {
    expect(SCORECARD.length).toBeGreaterThanOrEqual(5);
    for (const s of SCORECARD) {
      expect(s.q.endsWith("?"), s.q).toBe(true);
      expect(s.us.length, s.q).toBeGreaterThan(120);
    }
  });

  it("answers the exit question with the parent's guarantee, not a new one", () => {
    const exit = SCORECARD.find((s) => s.q.toLowerCase().includes("doesn't work"));
    expect(exit, "the scorecard must answer what happens on failure").toBeDefined();
    expect(exit!.us).toContain(FLIGHT_CHECK.label);
    expect(exit!.us).toContain("no lock-in");
  });

  it("points the price question at the public catalogue", () => {
    // The claim "every price is public" is only honest while the page and the
    // machine-readable copy both exist; /api/catalogue is asserted elsewhere
    // to match the page exactly.
    const price = SCORECARD.find((s) => s.q.toLowerCase().includes("price"));
    expect(price).toBeDefined();
    expect(price!.us).toContain("/api/catalogue");
  });

  it("claims the additive machine check only in the words the tests earn", () => {
    // The strongest line on the scorecard is "it can't sell you something you
    // already pay for". That claim is honest only because upgrades.test.ts
    // enforces it — so the answer must describe the mechanism (checked, by
    // machine, against the parent's published scope), not assert good
    // intentions.
    const dupe = SCORECARD.find((s) => s.q.toLowerCase().includes("already pay for"));
    expect(dupe).toBeDefined();
    expect(dupe!.us.toLowerCase()).toContain("machine");
    expect(dupe!.us).toContain("Manifest");
  });
});
