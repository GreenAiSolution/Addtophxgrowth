import { describe, it, expect } from "vitest";
import {
  LEGAL_DOCUMENTS,
  legalBySlug,
  feeSchedule,
  SUB_PROCESSORS,
  LEGAL_LAST_UPDATED,
} from "@/lib/legal";
import { PLANS } from "@/lib/catalog";
import { formatCurrency } from "@/lib/utils";

describe("the legal set", () => {
  it("publishes all three documents", () => {
    expect(LEGAL_DOCUMENTS.map((d) => d.slug).sort()).toEqual(["msa", "privacy", "terms"]);
  });

  it("gives every document a title, a summary and real sections", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.title.length, doc.slug).toBeGreaterThan(3);
      expect(doc.summary.length, doc.slug).toBeGreaterThan(30);
      expect(doc.sections.length, doc.slug).toBeGreaterThanOrEqual(8);
    }
  });

  it("never ships an empty section", () => {
    // An empty heading in a legal document reads as a drafting error and
    // undermines every other clause on the page.
    for (const doc of LEGAL_DOCUMENTS) {
      for (const s of doc.sections) {
        expect(s.heading.trim().length, `${doc.slug}/${s.heading}`).toBeGreaterThan(2);
        expect(s.body.length, `${doc.slug}/${s.heading}`).toBeGreaterThan(0);
        for (const p of s.body) {
          expect(p.trim().length, `${doc.slug}/${s.heading}`).toBeGreaterThan(20);
        }
        for (const b of s.bullets ?? []) {
          expect(b.trim().length, `${doc.slug}/${s.heading}`).toBeGreaterThan(5);
        }
      }
    }
  });

  it("has no unfilled placeholders anywhere", () => {
    const text = JSON.stringify(LEGAL_DOCUMENTS);
    for (const marker of ["TODO", "XXX", "[insert", "Lorem", "{{", "COMPANY_NAME"]) {
      expect(text.includes(marker), `found "${marker}"`).toBe(false);
    }
  });

  it("looks up by slug and returns undefined for a stranger", () => {
    expect(legalBySlug("terms")?.title).toBe("Terms of Service");
    expect(legalBySlug("nope")).toBeUndefined();
  });

  it("carries a last-updated date", () => {
    expect(LEGAL_LAST_UPDATED).toMatch(/\d{4}/);
  });
});

describe("fee schedule", () => {
  it("quotes every plan we actually sell", () => {
    const schedule = feeSchedule();
    expect(schedule).toHaveLength(PLANS.length);
    for (const plan of PLANS) {
      expect(schedule.some((line) => line.startsWith(plan.name)), plan.key).toBe(true);
    }
  });

  it("quotes the same prices as the pricing page", () => {
    // The load-bearing one: a fee schedule that drifts from the catalog is the
    // worst kind of stale content on a site that takes money, and it is exactly
    // the sort of thing nobody notices until a client points at it.
    const schedule = feeSchedule().join("\n");
    for (const plan of PLANS) {
      expect(schedule, plan.key).toContain(formatCurrency(plan.priceMonthly));
      if (plan.setupFee) {
        expect(schedule, `${plan.key} build fee`).toContain(formatCurrency(plan.setupFee));
      }
    }
  });

  it("only mentions a build fee for plans that have one", () => {
    for (const line of feeSchedule()) {
      const plan = PLANS.find((p) => line.startsWith(p.name))!;
      expect(line.includes("build fee"), plan.key).toBe(Boolean(plan.setupFee));
    }
  });
});

describe("sub-processors", () => {
  it("names every third party, its purpose and what it receives", () => {
    expect(SUB_PROCESSORS.length).toBeGreaterThanOrEqual(5);
    for (const s of SUB_PROCESSORS) {
      expect(s.name.length).toBeGreaterThan(2);
      expect(s.purpose.length).toBeGreaterThan(5);
      expect(s.data.length).toBeGreaterThan(10);
    }
  });

  it("covers the services the platform actually depends on", () => {
    const names = SUB_PROCESSORS.map((s) => s.name.toLowerCase()).join(" ");
    for (const required of ["vercel", "anthropic", "stripe", "resend"]) {
      expect(names, `missing ${required}`).toContain(required);
    }
  });

  it("lists them in the privacy policy, not just in code", () => {
    const privacy = legalBySlug("privacy")!;
    const text = JSON.stringify(privacy);
    for (const s of SUB_PROCESSORS) {
      expect(text, `${s.name} not surfaced`).toContain(s.name);
    }
  });
});

describe("the clauses that protect the business", () => {
  const terms = legalBySlug("terms")!;
  const msa = legalBySlug("msa")!;
  const flat = (d: typeof terms) =>
    d.sections.flatMap((s) => [s.heading, ...s.body, ...(s.bullets ?? [])]).join(" ").toLowerCase();

  it("disclaims guaranteed results on both documents", () => {
    // An ad agency without this clause is one unhappy month from a dispute.
    expect(flat(terms)).toContain("do not guarantee");
    expect(flat(msa)).toContain("not a warranty");
  });

  it("states that ad spend is the client's, paid directly", () => {
    expect(flat(terms)).toContain("ad spend");
    expect(flat(terms)).toContain("directly");
  });

  it("says AI output is a draft a human must review", () => {
    expect(flat(terms)).toContain("review");
    expect(flat(terms)).toContain("drafts");
  });

  it("caps liability and names the governing law", () => {
    expect(flat(terms)).toContain("limitation of liability");
    expect(flat(terms)).toContain("arizona");
  });

  it("promises the client keeps their own ad accounts", () => {
    expect(flat(terms)).toContain("remain yours");
    expect(flat(msa)).toContain("do not withhold");
  });

  it("explains when the build fee is and isn't refundable", () => {
    expect(flat(terms)).toContain("non-refundable once that work has begun");
    expect(flat(terms)).toContain("refund it in full");
  });
});
