import { describe, expect, it } from "vitest";
import {
  EMPLOYEES,
  DutyReport,
  authorityVerdict,
  isOnShift,
  dutyBrief,
  staffing,
  allDuties,
  employeeBySlug,
  type Authority,
} from "@/lib/employees";
import { ACTION_KINDS, kindByKey } from "@/lib/gate";
import { operationByKey, gateKindForOperation } from "@/lib/connectors";
import { UPGRADES } from "@/lib/upgrades";

/**
 * An employee is a prompt with a ceiling on it. These tests are about the
 * ceiling, because the prompt cannot be tested and the ceiling is the part a
 * client is relying on.
 *
 * The rule underneath all of them: an employee's authority is *declared*, and
 * every tool it holds is checked against that declaration rather than deriving
 * it. Deriving would mean adding a tool silently widens what the employee may
 * commit the business to — the exact change that should be impossible to make
 * quietly.
 */

const at = (iso: string) => new Date(iso);

describe("the roster staffs what the catalogue actually sells", () => {
  it("names only builds that exist on the price list", () => {
    const builds = new Set(UPGRADES.filter((u) => u.build).map((u) => u.key));
    for (const e of EMPLOYEES) {
      expect(builds.has(e.build), `${e.name} staffs unknown build "${e.build}"`).toBe(true);
    }
  });

  it("leaves no gated action with nobody responsible for it", () => {
    // A kind the gate will hold, the registry can propose, and no duty ever
    // calls is a promise on a price list with nothing behind it.
    for (const row of staffing()) {
      expect(row.duty, `${row.kind} is unstaffed`).not.toBe("unstaffed");
    }
    expect(staffing().length).toBe(ACTION_KINDS.length);
  });

  it("keeps every employee inside its own build", () => {
    for (const { employee, duty } of allDuties()) {
      for (const tool of duty.tools) {
        const kind = gateKindForOperation(tool);
        if (!kind) continue;
        expect(kind.build, `${employee.slug}/${duty.key} reaches into ${kind.build}`).toBe(
          employee.build,
        );
      }
    }
  });
});

describe("authority is declared, and every tool is checked against it", () => {
  it("gives no duty a write outside its employee's authority", () => {
    for (const { employee, duty } of allDuties()) {
      for (const tool of duty.tools) {
        const op = operationByKey(tool);
        expect(op, `${duty.key} names unknown tool ${tool}`).toBeDefined();
        if (op!.direction !== "WRITE") continue;
        expect(employee.authority.mayPropose).toContain(op!.gateKind);
      }
    }
  });

  it("gives every duty something it can actually do", () => {
    for (const { employee, duty } of allDuties()) {
      const writes = duty.tools.filter((t) => operationByKey(t)?.direction === "WRITE");
      expect(writes.length, `${employee.slug}/${duty.key} can only read`).toBeGreaterThan(0);
    }
  });

  it("gives every duty the queue, so it cannot propose a duplicate blind", () => {
    // Proposing a second invoice for a job that already has one waiting is the
    // most damaging mistake available to an employee, and reading the queue is
    // the only defence it has that does not depend on remembering.
    for (const { employee, duty } of allDuties()) {
      expect(duty.tools, `${employee.slug}/${duty.key} cannot see the queue`).toContain(
        "desk.queue_open",
      );
    }
  });

  it("lets nobody hold a money kind on a timer", () => {
    for (const e of EMPLOYEES) {
      for (const k of e.authority.mayPropose) {
        const kind = kindByKey(k)!;
        if (kind.movesMoney) expect(kind.minimumHold).toBe("MANUAL");
      }
    }
  });

  it("keeps The Diary away from anything that moves money", () => {
    const diary = employeeBySlug("diary")!;
    for (const k of diary.authority.mayPropose) {
      expect(kindByKey(k)!.movesMoney).toBe(false);
    }
    expect(diary.authority.moneyCeilingCents).toBe(0);
  });
});

describe("the ceiling", () => {
  const authority: Authority = {
    mayPropose: ["invoice.raise", "job.status"],
    moneyCeilingCents: 200_000,
    neverWithoutAPerson: [],
  };

  it("proposes inside the ceiling", () => {
    expect(authorityVerdict(authority, "invoice.raise", 199_999).do).toBe("propose");
  });

  it("escalates above it rather than drafting a number to argue with", () => {
    const v = authorityVerdict(authority, "invoice.raise", 200_001);
    expect(v.do).toBe("escalate");
    expect(v.why).toContain("$2,000");
  });

  it("treats a money action with no amount as unknown, not as zero", () => {
    // The failure this exists for: an amount that never arrived is a proposal
    // whose size nobody knows, and defaulting it to zero makes the ceiling
    // meaningless exactly when it matters.
    expect(authorityVerdict(authority, "invoice.raise", undefined).do).toBe("escalate");
    expect(authorityVerdict(authority, "invoice.raise", NaN).do).toBe("escalate");
  });

  it("refuses a kind outside the list, whatever the amount", () => {
    expect(authorityVerdict(authority, "quote.send", 1).do).toBe("refuse");
    expect(authorityVerdict(authority, "not.a.kind", 1).do).toBe("refuse");
  });

  it("refuses a negative amount rather than treating it as small", () => {
    expect(authorityVerdict(authority, "invoice.raise", -500).do).toBe("refuse");
  });

  it("ignores the ceiling for actions that do not move money", () => {
    expect(authorityVerdict(authority, "job.status").do).toBe("propose");
  });
});

describe("shifts", () => {
  const shift = { everyHours: 4, notBeforeHourUtc: 13, label: "every four hours" };

  it("runs a duty that has never run, once the hour arrives", () => {
    expect(isOnShift(shift, at("2026-08-02T13:00:00Z"), null)).toBe(true);
  });

  it("holds a duty before its earliest hour", () => {
    // Otherwise a chase goes out at 4am local, which reads as automated in the
    // way that costs a business its account.
    expect(isOnShift(shift, at("2026-08-02T09:00:00Z"), null)).toBe(false);
  });

  it("does not run again inside the interval", () => {
    expect(isOnShift(shift, at("2026-08-02T15:00:00Z"), at("2026-08-02T13:00:00Z"))).toBe(false);
  });

  it("runs again once the interval has elapsed", () => {
    expect(isOnShift(shift, at("2026-08-02T17:00:00Z"), at("2026-08-02T13:00:00Z"))).toBe(true);
  });

  it("is not pushed a whole day out by a cron firing seconds early", () => {
    const daily = { everyHours: 24, notBeforeHourUtc: 15, label: "daily" };
    expect(isOnShift(daily, at("2026-08-03T15:00:00Z"), at("2026-08-02T15:00:10Z"))).toBe(true);
  });
});

describe("the brief tells the employee the truth about itself", () => {
  const employee = employeeBySlug("foreman")!;
  const brief = dutyBrief(employee, employee.duties[0]!, {
    name: "Cactus Plumbing",
    approver: "Dana",
  });

  it("names the business and the approver", () => {
    expect(brief).toContain("Cactus Plumbing");
    expect(brief).toContain("Dana");
  });

  it("states the ceiling in money, not in policy", () => {
    expect(brief).toContain("$2,000");
  });

  it("says plainly that nothing it does reaches a customer directly", () => {
    expect(brief).toContain("Nothing you do reaches a customer directly");
  });

  it("shows the report shape as a filled-in example", () => {
    expect(brief).toContain('"confidence"');
    expect(brief).toContain('"escalate"');
  });
});

describe("the duty report contract", () => {
  it("accepts a report with no escalation, however it is expressed", () => {
    expect(DutyReport.safeParse({ reviewed: 3, summary: "ok", confidence: 0.9 }).success).toBe(true);
    expect(
      DutyReport.safeParse({ reviewed: 3, summary: "ok", confidence: 0.9, escalate: null }).success,
    ).toBe(true);
  });

  it("rejects a confidence outside 0-1", () => {
    expect(DutyReport.safeParse({ reviewed: 1, summary: "x", confidence: 4 }).success).toBe(false);
  });

  it("rejects an escalation with no question", () => {
    expect(
      DutyReport.safeParse({
        reviewed: 1,
        summary: "x",
        confidence: 0.5,
        escalate: { why: "unsure" },
      }).success,
    ).toBe(false);
  });
});
