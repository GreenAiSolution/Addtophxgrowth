import { describe, it, expect } from "vitest";
import {
  priceCockpit,
  SIGNATURE_BUILDS,
  matchesSignature,
  primaryPlanKey,
  buildSheet,
  signatureByKey,
  parseCockpitLink,
} from "@/lib/cockpit";
import { planByKey } from "@/lib/catalog";
import { ADDON_BUNDLE, addonByKey, bundleListPrice } from "@/lib/addons";

describe("priceCockpit", () => {
  it("costs nothing when nothing is chosen", () => {
    const q = priceCockpit({});
    expect(q.isEmpty).toBe(true);
    expect(q.firstInvoiceTotal).toBe(0);
    expect(q.lines).toEqual([]);
  });

  it("adds a subscription and its build fee as separate lines", () => {
    const scale = planByKey("scale")!;
    const q = priceCockpit({ agentsPlan: "scale" });
    expect(q.monthlyTotal).toBe(scale.priceMonthly);
    expect(q.oneTimeTotal).toBe(scale.setupFee);
    expect(q.firstInvoiceTotal).toBe(scale.priceMonthly + scale.setupFee!);
  });

  it("sums both product lines", () => {
    const scale = planByKey("scale")!;
    const operate = planByKey("operate")!;
    const q = priceCockpit({ agentsPlan: "scale", adOpsPlan: "operate" });
    expect(q.monthlyTotal).toBe(scale.priceMonthly + operate.priceMonthly);
    expect(q.oneTimeTotal).toBe(scale.setupFee! + operate.setupFee!);
  });

  it("lets someone buy ad-ops alone", () => {
    const monitor = planByKey("monitor")!;
    const q = priceCockpit({ agentsPlan: null, adOpsPlan: "monitor" });
    expect(q.monthlyTotal).toBe(monitor.priceMonthly);
    expect(q.lines.some((l) => l.label === "Monitor")).toBe(true);
  });

  it("refuses a plan named on the wrong line", () => {
    // Guards against a hand-edited URL putting an ad-ops tier in the agents slot
    // and being charged for it twice.
    const q = priceCockpit({ agentsPlan: "dominate", adOpsPlan: "command" });
    expect(q.isEmpty).toBe(true);
  });

  it("ignores plan and add-on keys it does not sell", () => {
    const q = priceCockpit({ agentsPlan: "nonsense", addons: ["not-a-thing"] });
    expect(q.isEmpty).toBe(true);
  });

  it("separates monthly add-ons from one-time ones", () => {
    const monthly = addonByKey("creative-studio")!;
    const once = addonByKey("funnel-build")!;
    expect(monthly.billing).toBe("monthly");
    expect(once.billing).toBe("one_time");

    const q = priceCockpit({ addons: ["creative-studio", "funnel-build"] });
    expect(q.monthlyTotal).toBe(monthly.price);
    expect(q.oneTimeTotal).toBe(once.price);
  });

  it("does not double-charge a duplicated add-on", () => {
    const once = addonByKey("funnel-build")!;
    const q = priceCockpit({ addons: ["funnel-build", "funnel-build"] });
    expect(q.oneTimeTotal).toBe(once.price);
    expect(q.lines).toHaveLength(1);
  });

  it("applies the bundle price when all three foundations are picked", () => {
    // The load-bearing one: a configurator that charges more than the advertised
    // bundle for the identical basket is a dark pattern.
    const q = priceCockpit({ addons: [...ADDON_BUNDLE.includes] });
    expect(q.oneTimeTotal).toBe(ADDON_BUNDLE.price);
    expect(q.oneTimeTotal).toBeLessThan(bundleListPrice());
    expect(q.bundleSaving).toBe(bundleListPrice() - ADDON_BUNDLE.price);
  });

  it("collapses the three foundations into one bundle line", () => {
    const q = priceCockpit({ addons: [...ADDON_BUNDLE.includes] });
    expect(q.lines.filter((l) => l.key.startsWith("addon-"))).toHaveLength(1);
    expect(q.lines[0].label).toBe(ADDON_BUNDLE.name);
  });

  it("charges à la carte when only some foundations are picked", () => {
    const two = ADDON_BUNDLE.includes.slice(0, 2);
    const expected = two.reduce((sum, k) => sum + addonByKey(k)!.price, 0);
    const q = priceCockpit({ addons: [...two] });
    expect(q.oneTimeTotal).toBe(expected);
    expect(q.bundleSaving).toBe(0);
  });

  it("keeps non-bundle add-ons priced alongside the bundle", () => {
    const extra = addonByKey("voice-agent")!;
    const q = priceCockpit({ addons: [...ADDON_BUNDLE.includes, "voice-agent"] });
    const expectedMonthly = extra.billing === "monthly" ? extra.price : 0;
    const expectedOnce = ADDON_BUNDLE.price + (extra.billing === "one_time" ? extra.price : 0);
    expect(q.monthlyTotal).toBe(expectedMonthly);
    expect(q.oneTimeTotal).toBe(expectedOnce);
  });

  it("shows the industry pack as included, never as a charge", () => {
    const q = priceCockpit({ verticalKey: "roofing" });
    const line = q.lines.find((l) => l.kind === "INCLUDED");
    expect(line?.amount).toBe(0);
    expect(q.firstInvoiceTotal).toBe(0);
  });

  it("first invoice is monthly plus one-time, and nothing else", () => {
    const q = priceCockpit({
      agentsPlan: "command",
      adOpsPlan: "dominate",
      addons: [...ADDON_BUNDLE.includes, "creative-studio"],
    });
    expect(q.firstInvoiceTotal).toBe(q.monthlyTotal + q.oneTimeTotal);
  });

  it("is deterministic and order-independent", () => {
    const a = priceCockpit({ agentsPlan: "scale", addons: ["crm-build", "funnel-build"] });
    const b = priceCockpit({ agentsPlan: "scale", addons: ["funnel-build", "crm-build"] });
    expect(a.monthlyTotal).toBe(b.monthlyTotal);
    expect(a.oneTimeTotal).toBe(b.oneTimeTotal);
  });
});

describe("signature builds", () => {
  it("has unique keys and exactly one highlighted", () => {
    const keys = SIGNATURE_BUILDS.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SIGNATURE_BUILDS.filter((b) => b.highlight)).toHaveLength(1);
  });

  it("only references plans and add-ons we actually sell", () => {
    for (const b of SIGNATURE_BUILDS) {
      if (b.selection.agentsPlan) {
        expect(planByKey(b.selection.agentsPlan)?.line, b.key).toBe("AI_AGENTS");
      }
      if (b.selection.adOpsPlan) {
        expect(planByKey(b.selection.adOpsPlan)?.line, b.key).toBe("AD_OPS");
      }
      for (const a of b.selection.addons ?? []) {
        expect(addonByKey(a), `${b.key} → ${a}`).toBeDefined();
      }
    }
  });

  it("prices every signature to something real", () => {
    for (const b of SIGNATURE_BUILDS) {
      const q = priceCockpit(b.selection);
      expect(q.isEmpty, b.key).toBe(false);
      expect(q.monthlyTotal, b.key).toBeGreaterThan(0);
    }
  });

  it("climbs in price from first seat to chef's table", () => {
    const totals = SIGNATURE_BUILDS.map((b) => priceCockpit(b.selection).monthlyTotal);
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeGreaterThan(totals[i - 1]);
    }
  });

  it("recognises a preset that has not been edited", () => {
    for (const b of SIGNATURE_BUILDS) {
      expect(matchesSignature(b.selection)?.key, b.key).toBe(b.key);
    }
  });

  it("treats an edited preset as custom", () => {
    const base = SIGNATURE_BUILDS[0];
    const edited = { ...base.selection, adOpsPlan: "dominate" };
    expect(matchesSignature(edited)).toBeUndefined();
  });

  it("looks up by key and returns undefined for a stranger", () => {
    expect(signatureByKey("house-favourite")?.name).toBe("The House Favourite");
    expect(signatureByKey("nope")).toBeUndefined();
  });
});

describe("primaryPlanKey", () => {
  it("checks out against the agents line first", () => {
    expect(primaryPlanKey({ agentsPlan: "scale", adOpsPlan: "operate" })).toBe("scale");
  });

  it("falls back to ad-ops when that is all they picked", () => {
    expect(primaryPlanKey({ adOpsPlan: "monitor" })).toBe("monitor");
  });

  it("returns null for an add-ons-only cockpit", () => {
    expect(primaryPlanKey({ addons: ["funnel-build"] })).toBeNull();
  });
});

describe("buildSheet", () => {
  it("lists every line and the three totals", () => {
    const selection = { agentsPlan: "scale", adOpsPlan: "operate", verticalKey: "hvac" };
    const sheet = buildSheet(selection, priceCockpit(selection));
    expect(sheet).toContain("Scale");
    expect(sheet).toContain("Operate");
    expect(sheet).toContain("First invoice:");
    expect(sheet).toContain("Industry pack: hvac");
  });

  it("marks included lines as included rather than $0", () => {
    const selection = { verticalKey: "dental" };
    expect(buildSheet(selection, priceCockpit(selection))).toContain("— included");
  });

  it("mentions the saving only when a bundle was applied", () => {
    const withBundle = { addons: [...ADDON_BUNDLE.includes] };
    expect(buildSheet(withBundle, priceCockpit(withBundle))).toContain("Bundle saving");

    const without = { agentsPlan: "launch" };
    expect(buildSheet(without, priceCockpit(without))).not.toContain("Bundle saving");
  });
});

describe("parseCockpitLink", () => {
  it("returns null when the url asked for nothing", () => {
    // Null is the signal to fall back to the saved basket and the usual
    // default, so an empty query must not be mistaken for "select nothing".
    expect(parseCockpitLink({})).toBeNull();
    expect(parseCockpitLink({ addons: "" })).toBeNull();
    expect(parseCockpitLink({ agents: "not-a-plan", adops: "also-not" })).toBeNull();
  });

  it("loads a plan onto the right line", () => {
    expect(parseCockpitLink({ agents: "scale" })).toMatchObject({
      agentsPlan: "scale",
      adOpsPlan: null,
    });
    expect(parseCockpitLink({ adops: "operate" })).toMatchObject({
      agentsPlan: null,
      adOpsPlan: "operate",
    });
  });

  it("refuses a plan named on the wrong line", () => {
    // ?agents=operate is a mistake or a probe, never a real selection.
    expect(parseCockpitLink({ agents: "operate" })).toBeNull();
    expect(parseCockpitLink({ adops: "scale" })).toBeNull();
  });

  it("works out which line a bare ?plan= belongs to", () => {
    expect(parseCockpitLink({ plan: "command" })?.agentsPlan).toBe("command");
    expect(parseCockpitLink({ plan: "dominate" })?.adOpsPlan).toBe("dominate");
    expect(parseCockpitLink({ plan: "nonsense" })).toBeNull();
  });

  it("keeps only add-ons we sell, and only once each", () => {
    const parsed = parseCockpitLink({
      addons: "creative-studio, made-up , creative-studio,voice-agent",
    });
    expect(parsed?.addons).toEqual(["creative-studio", "voice-agent"]);
  });

  it("accepts a vertical only if the pack exists", () => {
    expect(parseCockpitLink({ vertical: "roofing" })?.verticalKey).toBe("roofing");
    expect(parseCockpitLink({ vertical: "underwater-basket-weaving" })).toBeNull();
  });

  it("lets a signature build win over everything else", () => {
    const build = SIGNATURE_BUILDS[0];
    expect(parseCockpitLink({ build: build.key, agents: "command" })).toEqual(build.selection);
  });

  it("ignores an unknown signature build rather than blanking the link", () => {
    expect(parseCockpitLink({ build: "nope", agents: "launch" })?.agentsPlan).toBe("launch");
  });

  it("prices every signature build link back to the build itself", () => {
    for (const b of SIGNATURE_BUILDS) {
      const parsed = parseCockpitLink({ build: b.key })!;
      expect(priceCockpit(parsed).firstInvoiceTotal, b.key).toBe(
        priceCockpit(b.selection).firstInvoiceTotal,
      );
    }
  });
});
