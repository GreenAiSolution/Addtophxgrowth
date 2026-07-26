/**
 * Single source of truth for brand identity.
 * Change it here and it updates the marketing site, the client cockpit,
 * the admin console, page metadata, and transactional email defaults.
 */
export const BRAND = {
  /** Full name, used in prose and metadata. */
  name: "Add To PHX",
  /** Wordmark: first part renders solid, second part renders in the gradient. */
  wordmarkLead: "ADD TO ",
  wordmarkAccent: "PHX",
  /** Compact mark for the sidebar / mobile top bar. */
  shortName: "ADD TO PHX",
  /** How the agency signs comments and replies to clients. */
  teamName: "Add To PHX team",
  /** Primary domain — drives default email senders. */
  domain: "phxgrowth.com",
  /** Default transactional sender (override with EMAIL_FROM). */
  fromEmail: "no-reply@phxgrowth.com",
  tagline: "AI Agents + Managed Ad Ops",
} as const;
