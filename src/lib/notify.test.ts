import { describe, it, expect } from "vitest";
import {
  renderNotification,
  agencyAddress,
  audienceOf,
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "@/lib/notify";
import { BRAND } from "@/lib/brand";
import { FOLLOW_UP_LADDER } from "@/lib/pipeline";

/**
 * Read out of the registry rather than copied.
 *
 * This list used to be maintained by hand here, and it had drifted: three
 * kinds — including `ENQUIRY_RECEIPT`, the first email a prospect ever gets
 * from us — were shipped with no coverage at all, because adding a kind and
 * adding it to this array are two separate acts of remembering.
 */
const ALL_KINDS = Object.keys(NOTIFICATION_KINDS) as NotificationKind[];

const kindsFor = (audience: "AGENCY" | "CLIENT" | "PROSPECT") =>
  ALL_KINDS.filter((k) => audienceOf(k) === audience);

const base = { businessName: "Ironclad Roofing", title: "Rotate the Meta creative" };

describe("renderNotification", () => {
  it("renders every kind without throwing and with real content", () => {
    for (const kind of ALL_KINDS) {
      const out = renderNotification(kind, base);
      expect(out.subject.length, kind).toBeGreaterThan(5);
      expect(out.text.length, kind).toBeGreaterThan(20);
    }
  });

  it("gives agency-bound mail a subject that carries specifics", () => {
    // The desk juggles many clients and reads these in a notification bar. A
    // subject that is only the template's boilerplate forces them to open it
    // to find out what it is about.
    //
    // Deliberately scoped to AGENCY. The same rule applied to client and
    // prospect mail produces mail-merge subject lines — see below.
    for (const kind of kindsFor("AGENCY")) {
      const out = renderNotification(kind, base);
      expect(
        out.subject.includes(base.title) || out.subject.includes(base.businessName),
        `${kind} subject carries no specifics`,
      ).toBe(true);
    }
  });

  it("never mail-merges a prospect's own company name into a subject line", () => {
    // The one audience that has no relationship with us yet, and the one place
    // a merge field is instantly recognisable as bulk mail. Every prospect
    // subject is written to read as though a person typed it.
    for (const kind of kindsFor("PROSPECT")) {
      expect(renderNotification(kind, base).subject, kind).not.toContain(base.businessName);
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

  it("names the client on per-client agency mail", () => {
    // Everything the desk receives about one specific client names it.
    // REVENUE_WEEKLY is excluded because it is about the whole business rather
    // than a client, which is why its own test asserts it leads with the
    // number instead.
    for (const kind of kindsFor("AGENCY").filter((k) => k !== "REVENUE_WEEKLY")) {
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

  it("puts a working opt-out on every rung of the follow-up sequence", () => {
    // The kinds are read out of the ladder itself, so a fourth rung added in
    // pipeline.ts is covered here the moment it exists rather than the day
    // somebody remembers to add it.
    const STOP = "https://example.com/api/pipeline/stop?t=abc123";
    for (const rung of FOLLOW_UP_LADDER) {
      const out = renderNotification(rung.kind, { ...base, unsubscribeUrl: STOP });
      expect(out.text, rung.kind).toContain(STOP);
    }
  });

  it("never invites a client or the desk to unsubscribe from their own service", () => {
    // The inverse, and the one that actually protects somebody: a caller
    // passing an unsubscribe URL to a service email must not produce a
    // paying client being offered a way to switch off their own alerts.
    const STOP = "https://example.com/api/pipeline/stop?t=abc123";
    for (const kind of [...kindsFor("CLIENT"), ...kindsFor("AGENCY")]) {
      expect(renderNotification(kind, { ...base, unsubscribeUrl: STOP }).text, kind).not.toContain(
        STOP,
      );
    }
  });

  it("tells the last follow-up's recipient that it is the last one", () => {
    // A sequence that claims to stop and then doesn't is the reason people
    // distrust every sequence. The claim is in the copy, so it is pinned here.
    const out = renderNotification("FOLLOW_UP_LAST", base);
    expect(out.text.toLowerCase()).toContain("last time");
  });

  it("does not alarm anybody on the first failed payment", () => {
    // Stripe retries by itself and most of these fix themselves. An emergency
    // subject line on the first notice is how people learn to ignore the
    // third, which is the one that matters.
    const first = renderNotification("PAYMENT_FAILED_FIRST", base).subject.toLowerCase();
    expect(first).toContain("no action needed");
    expect(first).not.toContain("urgent");

    // And by the final rung it says the consequence plainly, because by then
    // it is real and not saying so would be the dishonest choice.
    const last = renderNotification("PAYMENT_FAILED_FINAL", base).subject.toLowerCase();
    expect(last).toContain("action needed");
    expect(last).not.toContain("no action needed");
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
