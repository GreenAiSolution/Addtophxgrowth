import { describe, it, expect } from "vitest";
import { renderNotification, type NotificationKind } from "@/lib/notify";
import { BRAND } from "@/lib/brand";

const ALL_KINDS: NotificationKind[] = [
  "REQUEST_FILED",
  "REQUEST_REPLY_TO_CLIENT",
  "REQUEST_REPLY_TO_AGENCY",
  "BRIEF_READY",
  "ALERT_CRITICAL",
  "COCKPIT_CONFIGURED",
];

const base = { businessName: "Ironclad Roofing", title: "Rotate the Meta creative" };

describe("renderNotification", () => {
  it("renders every kind without throwing and with real content", () => {
    for (const kind of ALL_KINDS) {
      const out = renderNotification(kind, base);
      expect(out.subject.length, kind).toBeGreaterThan(5);
      expect(out.text.length, kind).toBeGreaterThan(20);
      // A subject line that is only the template's boilerplate is useless in an
      // inbox — every kind must carry the specific thing that happened.
      expect(
        out.subject.includes(base.title) || out.subject.includes(base.businessName),
        `${kind} subject carries no specifics`,
      ).toBe(true);
    }
  });

  it("always signs off and always links back", () => {
    for (const kind of ALL_KINDS) {
      const out = renderNotification(kind, { ...base, path: "/app/requests" });
      expect(out.text, kind).toContain(BRAND.teamName);
      expect(out.text, kind).toContain("/app/requests");
    }
  });

  it("falls back to the app root when no path is given", () => {
    const out = renderNotification("REQUEST_FILED", base);
    expect(out.text).toMatch(/https?:\/\//);
  });

  it("names the client on agency-bound mail", () => {
    // The agency handles many clients; a subject without the business name
    // forces them to open it to find out who it's about.
    for (const kind of ["REQUEST_FILED", "REQUEST_REPLY_TO_AGENCY", "COCKPIT_CONFIGURED"] as const) {
      expect(renderNotification(kind, base).subject, kind).toContain("Ironclad Roofing");
    }
  });

  it("does not shout the client's own name back at them", () => {
    const out = renderNotification("REQUEST_REPLY_TO_CLIENT", base);
    expect(out.subject).toBe(`Re: ${base.title}`);
  });

  it("uses the brief's own headline as the subject", () => {
    // The headline is already written to be read at a glance; wrapping it in
    // "Your morning brief is ready" buries the useful part.
    const out = renderNotification("BRIEF_READY", {
      businessName: "Ironclad Roofing",
      title: "3 leads scored overnight. 2 need attention before 10am.",
      detail: "Marcy Bell and Tomas Vega both described visible storm damage.",
    });
    expect(out.subject).toBe("3 leads scored overnight. 2 need attention before 10am.");
    expect(out.text).toContain("Marcy Bell");
  });

  it("marks a critical alert as needing action", () => {
    const out = renderNotification("ALERT_CRITICAL", {
      businessName: "Ironclad Roofing",
      title: "Account has stopped delivering",
      detail: "No spend recorded for 2 days.",
    });
    expect(out.subject).toContain("Action needed");
    expect(out.text).toContain("No spend recorded");
  });

  it("renders extra lines as bullets", () => {
    const out = renderNotification("COCKPIT_CONFIGURED", {
      ...base,
      lines: ["Scale — $2,997/mo", "Operate — $3,497/mo"],
    });
    expect(out.text).toContain("• Scale — $2,997/mo");
    expect(out.text).toContain("• Operate — $3,497/mo");
  });

  it("handles a payload with no optional fields at all", () => {
    const out = renderNotification("REQUEST_FILED", { businessName: "X", title: "Y" });
    expect(out.text).not.toContain("undefined");
    expect(out.text).not.toContain("null");
  });

  it("never leaves blank-line gaps from missing optional fields", () => {
    for (const kind of ALL_KINDS) {
      const out = renderNotification(kind, base);
      expect(out.text, kind).not.toMatch(/\n\n\n/);
    }
  });

  it("is deterministic", () => {
    const a = renderNotification("ALERT_CRITICAL", base);
    const b = renderNotification("ALERT_CRITICAL", base);
    expect(a).toEqual(b);
  });
});
