/**
 * Single source of truth for brand identity.
 * Change it here and it updates the marketing site, the client cockpit,
 * the admin console, page metadata, and transactional email defaults.
 *
 * POSITIONING
 *   This is not a standalone agency — it is the deluxe tier of phxgrowth.com.
 *   The "Plus" in the name is doing real work: everything here is the layer a
 *   PHX Growth client steps up into. Anywhere the site would otherwise read as
 *   a separate company, it should instead read as the upgrade.
 */
export const BRAND = {
  /** Full name, used in prose and metadata. */
  name: "PHX Growth Plus",
  /** Wordmark: first part renders solid, second part renders in the gradient. */
  wordmarkLead: "PHX GROWTH ",
  wordmarkAccent: "PLUS",
  /** Compact mark for the sidebar / mobile top bar. */
  shortName: "PHX GROWTH PLUS",
  /** How the agency signs comments and replies to clients. */
  teamName: "PHX Growth Plus team",
  /** Primary domain — drives default email senders. */
  domain: "phxgrowth.com",
  /** Default transactional sender (override with EMAIL_FROM). */
  fromEmail: "no-reply@phxgrowth.com",
  /**
   * Where agency-bound notifications land by default — new reservations,
   * requests, critical alerts. Overridable with AGENCY_NOTIFY_EMAIL, but baked
   * in so a fresh deploy with zero env config still reaches a human.
   */
  notifyEmail: "jadengreen808@gmail.com",
  tagline: "The creative studio and automation desk of PHX Growth",

  /**
   * The house this is an upgrade to. Surfaced on the marketing site so a
   * visitor understands the relationship immediately, rather than wondering
   * whether they have found a second, unrelated agency.
   */
  parent: {
    name: "PHX Growth",
    url: "https://phxgrowth.com",
    relationship:
      "the deluxe tier of PHX Growth — the creative studio and automation desk our clients step up into",
  },
} as const;
