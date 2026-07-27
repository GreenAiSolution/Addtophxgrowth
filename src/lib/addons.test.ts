import { describe, it, expect } from "vitest";
import {
  ADDONS,
  ADDON_BUNDLE,
  ADDON_GROUPS,
  ADDON_GROUP_ORDER,
  addonByKey,
  addonsByGroup,
  bundleListPrice,
} from "@/lib/addons";

describe("the add-on menu", () => {
  it("has no duplicate keys", () => {
    // Keys are what the configurator, the checkout and the entitlement grants
    // all agree on. A duplicate would silently double-charge or double-grant.
    const keys = ADDONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has no duplicate names", () => {
    const names = ADDONS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("prices everything above zero", () => {
    for (const a of ADDONS) {
      expect(a.price, a.key).toBeGreaterThan(0);
    }
  });

  it("says concretely what is delivered", () => {
    // The prices here run to five figures. A one-line blurb with no manifest
    // reads as a placeholder, and this menu is the reason to visit the site.
    for (const a of ADDONS) {
      expect(a.includes.length, a.key).toBeGreaterThanOrEqual(2);
      expect(a.blurb.length, a.key).toBeGreaterThan(25);
      expect(a.pairsWith.length, a.key).toBeGreaterThan(3);
      for (const line of a.includes) {
        expect(line.length, `${a.key}: "${line}"`).toBeGreaterThan(10);
      }
    }
  });
});

describe("groups", () => {
  it("orders every group exactly once", () => {
    expect(new Set(ADDON_GROUP_ORDER).size).toBe(ADDON_GROUP_ORDER.length);
    expect(ADDON_GROUP_ORDER.slice().sort()).toEqual(
      (Object.keys(ADDON_GROUPS) as typeof ADDON_GROUP_ORDER).slice().sort(),
    );
  });

  it("leaves no group empty", () => {
    // An empty group renders as a heading with nothing under it.
    for (const group of ADDON_GROUP_ORDER) {
      expect(addonsByGroup(group).length, group).toBeGreaterThan(0);
    }
  });

  it("places every add-on in a group that exists", () => {
    for (const a of ADDONS) {
      expect(ADDON_GROUP_ORDER, a.key).toContain(a.group);
    }
  });

  it("marks exactly one most-paired item per group", () => {
    // The centre-stage pull only works if there is one of them. Two is noise,
    // none wastes the position entirely.
    for (const group of ADDON_GROUP_ORDER) {
      const flagged = addonsByGroup(group).filter((a) => a.mostPaired);
      expect(flagged.length, `${group}: ${flagged.map((a) => a.key).join(", ")}`).toBe(1);
    }
  });

  it("lists each group most expensive first", () => {
    // Deliberate anchoring, documented at the top of addons.ts — worth a test
    // because it is exactly the kind of thing an innocent-looking append
    // breaks, and it broke silently in `capacity` before this existed.
    for (const group of ADDON_GROUP_ORDER) {
      const prices = addonsByGroup(group).map((a) => a.price);
      expect(prices, group).toEqual([...prices].sort((a, b) => b - a));
    }
  });
});

describe("the foundations bundle", () => {
  it("bundles add-ons that actually exist", () => {
    for (const key of ADDON_BUNDLE.includes) {
      expect(addonByKey(key), key).toBeDefined();
    }
  });

  it("costs less than its parts", () => {
    // If this ever inverts, the configurator would be applying a "bundle
    // price" that charges more than buying the same three separately.
    expect(ADDON_BUNDLE.price).toBeLessThan(bundleListPrice());
  });
});
