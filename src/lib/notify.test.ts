import { describe, it, expect } from "vitest";
import { renderNotification, agencyAddress, type NotificationKind } from "@/lib/notify";
import { BRAND } from "@/lib/brand";

const ALL_KINDS: NotificationKind[] = [
  "REQUEST_FILED",
  "REQUEST_REPLY_TO_CLIENT",
  "REQUEST_REPLY_TO_AGENCY",
  "BRIEF_READY",
  "ALERT_CRITICAL",
  "COCKPIT_CONFIGURED",
  "RESERVATION",
  "MARKETING_LEAD",
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
    for (const kind of [
      "REQUEST_FILED",
      "REQUEST_REPLY_TO_AGENCY",
      "COCKPIT_CONFIGURED",
      "RESERVATION",
      "MARKETING_LEAD",
    ] as const) {
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

describe("agencyAddress", () => {
  it("always resolves to a real inbox", () => {
    // "Nobody was told" is the failure mode that costs an actual sale, so this
    // must never return undefined however little is configured.
    const before = { agency: process.env.AGENCY_NOTIFY_EMAIL, seed: process.env.SEED_ADMIN_EMAIL };
    delete process.env.AGENCY_NOTIFY_EMAIL;
    delete process.env.SEED_ADMIN_EMAIL;
    expect(agencyAddress()).toBe(BRAND.notifyEmail);
    expect(agencyAddress()).toContain("@");
    if (before.agency) process.env.AGENCY_NOTIFY_EMAIL = before.agency;
    if (before.seed) process.env.SEED_ADMIN_EMAIL = before.seed;
  });

  it("lets the env override the baked-in default", () => {
    const before = process.env.AGENCY_NOTIFY_EMAIL;
    process.env.AGENCY_NOTIFY_EMAIL = "ops@example.com";
    expect(agencyAddress()).toBe("ops@example.com");
    if (before) process.env.AGENCY_NOTIFY_EMAIL = before;
    else delete process.env.AGENCY_NOTIFY_EMAIL;
  });
});

const RESERVATION = {
  businessName: "Ironclad Roofing",
  title: "The Answer Stack",
  detail: "Name: Rae\nEmail: rae@example.com",
  lines: ["$3,900/mo"],
};

describe("reservation template", () => {
  it("leads the subject with who and how much", () => {
    // Was "NEW RESERVATION — {business}: {title}". On a phone the notification
    // bar truncates, and three words of boilerplate pushed the two facts that
    // decide whether you open it — the business and the money — past the cut.
    const out = renderNotification("RESERVATION", RESERVATION);
    expect(out.subject.indexOf("Ironclad Roofing")).toBeLessThan(20);
    expect(out.subject).toContain("$3,900/mo");
    expect(out.subject).toContain("The Answer Stack");
  });

  it("keeps every fact in the plain-text alternative", () => {
    // The HTML is the nice version; the text is the one that always renders.
    const out = renderNotification("RESERVATION", RESERVATION);
    expect(out.text).toContain("rae@example.com");
    expect(out.text).toContain("• $3,900/mo");
    expect(out.text).toContain("expecting to hear from you");
  });

  it("never mentions the cockpit configurator, which no longer exists", () => {
    // This shipped in a real enquiry email weeks after the configurator was
    // deleted: "Somebody built a cockpit on the site."
    const out = renderNotification("RESERVATION", RESERVATION);
    expect(`${out.subject} ${out.text} ${out.html}`.toLowerCase()).not.toContain("cockpit");
  });

  it("carries branded html alongside the text", () => {
    const out = renderNotification("RESERVATION", RESERVATION);
    expect(out.html).toBeDefined();
    expect(out.html).toContain("Ironclad Roofing");
    expect(out.html).toContain("$3,900/mo");
  });
});

describe("the enquiry receipt", () => {
  it("goes to the person who filled the form in", () => {
    // They used to get nothing at all.
    const out = renderNotification("ENQUIRY_RECEIPT", {
      businessName: "Ironclad Roofing",
      title: "The Answer Stack",
      lines: ["$3,900/mo"],
    });
    expect(out.subject).toContain("The Answer Stack");
    expect(out.text).toContain("replies the same day");
    expect(out.text.toLowerCase()).toContain("nothing has been charged");
    expect(out.html).toBeDefined();
  });

  it("promises no outcome, in either format", () => {
    // Same rule the page lives under: no percentages, no multiples.
    const out = renderNotification("ENQUIRY_RECEIPT", {
      businessName: "Ironclad Roofing",
      title: "The Answer Stack",
    });
    // Strip the markup first. width="100%" is layout, not a claim — a check
    // that can't tell those apart would force the HTML to stop using
    // percentage widths, which is every email table ever built.
    const visible = (html: string) => html.replace(/<[^>]*>/g, " ");
    for (const body of [out.text, visible(out.html ?? "")]) {
      expect(body).not.toMatch(/\d+(\.\d+)?\s?%/);
      expect(body).not.toMatch(/\d+(\.\d+)?\s?[x×]\s/i);
    }
  });
});

describe("branded html", () => {
  it("never sends a localhost link to a real inbox", () => {
    // A real enquiry notification went out signed "http://localhost:3000/".
    const out = renderNotification("RESERVATION", RESERVATION);
    expect(`${out.text} ${out.html}`).not.toContain("localhost");
  });

  it("escapes user-supplied values into the html", () => {
    // Business names come from a public form. An unescaped one is a script tag
    // in whatever inbox opens it.
    const out = renderNotification("RESERVATION", {
      ...RESERVATION,
      businessName: '<script>alert(1)</script>',
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("uses solid colour cells rather than a css gradient", () => {
    // linear-gradient silently disappears in Outlook; a header bar that
    // vanishes takes the brand with it.
    const out = renderNotification("RESERVATION", RESERVATION);
    expect(out.html).not.toContain("linear-gradient");
    expect(out.html).toContain('bgcolor="#22d3ee"');
  });
});
