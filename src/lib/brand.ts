/**
 * Single source of truth for brand identity.
 * Change it here and it updates the marketing site, the client console,
 * the admin console, page metadata, and transactional email defaults.
 *
 * POSITIONING
 *   This is not an agency and does not sell a growth programme — phxgrowth.com
 *   does that. This is the upgrade counter: specialised work that bolts onto
 *   services PHX/GROWTH already runs for a client.
 *
 * ALIGNMENT
 *   Everything below is taken from phxgrowth.com itself rather than invented.
 *   The mark is `PHX/GROWTH` — "PHX" in the cyan→magenta gradient, "/GROWTH"
 *   solid white, both heavily letter-spaced — and this property wears the same
 *   mark with a gold PLUS attached, because a separate logo would read as a
 *   separate company. Gold is the parent's apex accent (it marks their Fleet
 *   Command tier), which makes it the right colour for an upgrade counter.
 *
 *   The house voice is aviation throughout: flight plans, pilots, squadrons,
 *   pre-flight, zero-to-live, war room, the 30-day flight check. Copy on this
 *   site should sound like it came off the same runway.
 */
export const BRAND = {
  /** Full name, used in prose and metadata. */
  name: "PHX/GROWTH PLUS",
  /** Wordmark part one — renders in the cyan→magenta gradient. */
  wordmarkLead: "PHX",
  /** Wordmark part two — renders solid white. */
  wordmarkMid: "/GROWTH",
  /** Wordmark part three — the gold chip marking this as the upgrade tier. */
  wordmarkAccent: "PLUS",
  /** Compact mark for the sidebar / mobile top bar. */
  shortName: "PHX/GROWTH PLUS",
  /** How the agency signs comments and replies to clients. */
  teamName: "PHX/GROWTH team",
  /** Primary domain — drives default email senders. */
  domain: "phxgrowth.com",
  /** Default transactional sender (override with EMAIL_FROM). */
  fromEmail: "no-reply@phxgrowth.com",
  /**
   * Where agency-bound notifications land by default — enquiries, requests,
   * critical alerts. Overridable with AGENCY_NOTIFY_EMAIL, but baked in so a
   * fresh deploy with zero env config still reaches a human.
   */
  notifyEmail: "jadengreen808@gmail.com",
  tagline: "Specialised upgrades for PHX/GROWTH clients",

  /**
   * The house this bolts onto. Every string here is quoted from phxgrowth.com
   * so the two properties cannot describe the same company differently.
   */
  parent: {
    name: "PHX/GROWTH",
    url: "https://phxgrowth.com",
    /** Their own words, from the site footer. */
    tagline: "The autonomous media buyer that flies your ad spend to profit.",
    email: "admin@phxgrowth.com",
    relationship:
      "the upgrade counter for PHX/GROWTH — the specialised work that bolts onto the services already flying your account",
  },
} as const;
