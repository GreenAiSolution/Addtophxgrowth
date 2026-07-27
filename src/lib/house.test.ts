import { describe, it, expect } from "vitest";
import { HOUSE, DIVISIONS, divisionsFor, HOUSE_THESIS } from "@/lib/house";
import { BRAND } from "@/lib/brand";
import { blueprintFor } from "@/lib/systems";

describe("the two sites", () => {
  it("names the parent from the single source of brand truth", () => {
    // If these ever diverge the site starts referring to a company that
    // doesn't exist under that name.
    expect(HOUSE.PARENT.name).toBe(BRAND.parent.name);
    expect(HOUSE.PARENT.url).toBe(BRAND.parent.url);
    expect(HOUSE.PLUS.name).toBe(BRAND.name);
  });

  it("gives this site no outbound url — it is already here", () => {
    expect(HOUSE.PLUS.url).toBeNull();
  });

  it("states a purpose for each side, not a slogan", () => {
    for (const role of Object.values(HOUSE)) {
      expect(role.purpose.length, role.name).toBeGreaterThan(100);
      expect(role.role.length, role.name).toBeGreaterThan(3);
    }
  });
});

describe("the division of labour", () => {
  it("assigns every job to exactly one side", () => {
    // The load-bearing property. Two independent lists of claims drift until
    // both sites claim the same job; one list with one owner per job cannot.
    const jobs = DIVISIONS.map((d) => d.job);
    expect(new Set(jobs).size).toBe(jobs.length);
  });

  it("keeps real work on both sides", () => {
    // A division that hands everything to one site isn't a division, it's a
    // land grab — and it would leave one of the two properties pointless.
    expect(divisionsFor("PARENT").length).toBeGreaterThanOrEqual(2);
    expect(divisionsFor("PLUS").length).toBeGreaterThanOrEqual(2);
    expect(divisionsFor("PARENT").length + divisionsFor("PLUS").length).toBe(DIVISIONS.length);
  });

  it("argues each assignment rather than asserting it", () => {
    for (const d of DIVISIONS) {
      expect(d.job.length, d.job).toBeGreaterThan(15);
      expect(d.because.length, d.job).toBeGreaterThan(90);
    }
  });

  it("counts the module claim from the real blueprint", () => {
    // The "see exactly what a tier contains" argument quotes a number. It has
    // to be the number the tier page will actually render.
    const real = blueprintFor("command")?.modules.length;
    expect(real).toBeGreaterThan(0);
    const claim = DIVISIONS.find((d) => d.job.startsWith("See exactly"));
    expect(claim).toBeDefined();
    expect(claim!.because).toContain(`all ${real} things`);
  });
});

describe("the thesis", () => {
  it("answers why there are two sites, using both names", () => {
    expect(HOUSE_THESIS.body).toContain(BRAND.parent.name);
    expect(HOUSE_THESIS.body.length).toBeGreaterThan(150);
    expect(HOUSE_THESIS.headline.length).toBeGreaterThan(10);
  });
});
