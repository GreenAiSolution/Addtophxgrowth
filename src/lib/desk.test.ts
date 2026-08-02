import { describe, expect, it } from "vitest";
import { IMPLEMENTED_READS, MAX_PROPOSALS_PER_RUN, dedupeKeyFor, runBucket } from "@/lib/desk";
import { OPERATIONS, operationByKey } from "@/lib/connectors";
import { allDuties } from "@/lib/employees";

/**
 * Only the parts of the runtime that can be reasoned about without a database
 * are tested here — the dedupe key, the run bucket, and the correspondence
 * between what the registry advertises and what is actually implemented. The
 * loop itself is thin on purpose; every judgement inside it has already been
 * made by a function tested in one of the other four files.
 */

const at = (iso: string) => new Date(iso);

describe("every advertised read exists, and every implemented read is advertised", () => {
  it("implements every LIVE read in the registry", () => {
    // A LIVE read with no implementation is a tool that fails the first time an
    // employee reaches for it, in production, unattended.
    const live = OPERATIONS.filter((o) => o.direction === "READ" && o.status === "LIVE");
    for (const op of live) {
      expect(IMPLEMENTED_READS, `${op.key} is advertised as live and has no reader`).toContain(op.key);
    }
  });

  it("advertises every implemented read", () => {
    for (const key of IMPLEMENTED_READS) {
      const op = operationByKey(key);
      expect(op, `${key} is implemented but not in the registry`).toBeDefined();
      expect(op!.direction).toBe("READ");
    }
  });

  it("gives no duty a tool that is not wired up", () => {
    for (const { employee, duty } of allDuties()) {
      for (const tool of duty.tools) {
        expect(operationByKey(tool)!.status, `${employee.slug}/${duty.key} holds ${tool}`).toBe(
          "LIVE",
        );
      }
    }
  });
});

describe("the dedupe key is what makes a re-running employee safe", () => {
  const invoice = operationByKey("ledger.raise_invoice")!;
  const status = operationByKey("messaging.job_status")!;

  it("collapses two invoices for the same customer, whatever the wording", () => {
    // The failure this exists for: a second invoice raised tomorrow for the job
    // invoiced today. The wording will differ; the money is the same money.
    const a = dedupeKeyFor("foreman", invoice, { customer: "Marsh Bros", summary: "Re-pipe" });
    const b = dedupeKeyFor("foreman", invoice, { customer: "Marsh Bros", summary: "Repipe job" });
    expect(a).toBe(b);
  });

  it("ignores case and spacing in the customer name", () => {
    expect(dedupeKeyFor("foreman", invoice, { customer: "  Marsh Bros " })).toBe(
      dedupeKeyFor("foreman", invoice, { customer: "marsh bros" }),
    );
  });

  it("separates two different customers", () => {
    expect(dedupeKeyFor("foreman", invoice, { customer: "A" })).not.toBe(
      dedupeKeyFor("foreman", invoice, { customer: "B" }),
    );
  });

  it("lets a second, different message reach the same customer", () => {
    // "Running late" and "finished" are both legitimate and both go to the same
    // person on the same day. Only an identical message is a duplicate.
    const a = dedupeKeyFor("foreman", status, { customer: "Marsh Bros", body: "Running late" });
    const b = dedupeKeyFor("foreman", status, { customer: "Marsh Bros", body: "All done" });
    expect(a).not.toBe(b);
    expect(dedupeKeyFor("foreman", status, { customer: "Marsh Bros", body: "All done" })).toBe(b);
  });

  it("namespaces by employee and operation", () => {
    const key = dedupeKeyFor("foreman", invoice, { customer: "Marsh Bros" });
    expect(key.startsWith("foreman:ledger.raise_invoice:")).toBe(true);
  });
});

describe("a run happens once per interval", () => {
  const duty = { shift: { everyHours: 4, label: "" } } as Parameters<typeof runBucket>[0];

  it("puts two moments inside the same interval in the same bucket", () => {
    expect(runBucket(duty, at("2026-08-02T13:10:00Z"))).toBe(
      runBucket(duty, at("2026-08-02T15:50:00Z")),
    );
  });

  it("moves to a new bucket once the interval passes", () => {
    expect(runBucket(duty, at("2026-08-02T13:00:00Z"))).not.toBe(
      runBucket(duty, at("2026-08-02T17:30:00Z")),
    );
  });
});

describe("a runaway loop cannot fill a queue", () => {
  it("caps proposals per run at something a person could actually read", () => {
    expect(MAX_PROPOSALS_PER_RUN).toBeGreaterThan(0);
    expect(MAX_PROPOSALS_PER_RUN).toBeLessThanOrEqual(25);
  });
});
