/**
 * The HTML shell every branded email wears.
 *
 * DIRECTION
 *   Operational notifications stayed plain text for good reasons — read on a
 *   phone at 6am, can't render broken. But the enquiry emails are not
 *   operational: one lands on a prospect who has just asked to spend four
 *   figures a month, and the other is the moment the agency finds out. Those
 *   two deserve to look like the site they came from.
 *
 *   Both still carry a full plain-text alternative, so nothing is lost when a
 *   client strips HTML, and the operational kinds are untouched.
 *
 * WHY IT IS BUILT THIS WAY
 *   Email clients are not browsers. Every choice here is defensive:
 *
 *   - Tables, not flex or grid. Outlook renders through Word and neither
 *     exists there.
 *   - Inline styles only. Gmail strips <style> blocks in many contexts.
 *   - The gradient bar is three solid table cells, not a CSS gradient —
 *     `linear-gradient` silently disappears in Outlook and parts of Gmail,
 *     and a header bar that vanishes takes the brand with it. Three coloured
 *     cells look identical and render everywhere.
 *   - Explicit dark background on every container. Clients that force their
 *     own dark mode will invert what they like; what they must not do is drop
 *     white text onto a white default.
 *   - No images. Nothing to block, nothing to fail to load, no tracking pixel.
 */

import { BRAND } from "@/lib/brand";

const BG = "#07070b";
const PANEL = "#101018";
const BORDER = "#23232e";
const TEXT = "#f4f4f7";
const MUTED = "#9a9aab";
const CYAN = "#22d3ee";
const VIOLET = "#8b5cf6";
const MAGENTA = "#ec4899";
const GOLD = "#f0b429";

export interface EmailBlock {
  /** Small uppercase label above the value. */
  label: string;
  /** The value itself. Rendered large when `big`. */
  value: string;
  big?: boolean;
  tone?: "cyan" | "violet" | "magenta" | "gold" | "plain";
}

export interface EmailShellOptions {
  /** Eyebrow above the headline. */
  kicker: string;
  headline: string;
  /** One or two sentences under the headline. */
  intro?: string;
  /** Highlighted figures — price, stack, saving. */
  blocks?: EmailBlock[];
  /** Pre-formatted detail, rendered monospace so columns line up. */
  detail?: string;
  /** The one thing to do. */
  cta?: { label: string; href: string };
  /** Small print under the button. */
  footnote?: string;
}

const TONE: Record<NonNullable<EmailBlock["tone"]>, string> = {
  cyan: CYAN,
  violet: VIOLET,
  magenta: MAGENTA,
  gold: GOLD,
  plain: TEXT,
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The wordmark, built from the same BRAND parts the site header uses. */
function wordmark(): string {
  return `
    <span style="font-size:19px;font-weight:700;letter-spacing:2.5px;color:${TEXT};">
      <span style="color:${CYAN};">${escapeHtml(BRAND.wordmarkLead)}</span>${escapeHtml(BRAND.wordmarkMid)}
    </span>
    <span style="font-size:10px;font-weight:700;letter-spacing:2px;color:${GOLD};border:1px solid ${GOLD}55;border-radius:999px;padding:3px 8px;margin-left:8px;">
      ${escapeHtml(BRAND.wordmarkAccent)}
    </span>`;
}

export function renderEmailHtml(o: EmailShellOptions): string {
  const blocks = (o.blocks ?? [])
    .map(
      (b) => `
      <tr>
        <td style="padding:0 0 16px 0;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">
            ${escapeHtml(b.label)}
          </div>
          <div style="margin-top:4px;font-size:${b.big ? "30px" : "16px"};font-weight:700;color:${
            TONE[b.tone ?? "plain"]
          };line-height:1.25;">
            ${escapeHtml(b.value)}
          </div>
        </td>
      </tr>`,
    )
    .join("");

  const detail = o.detail
    ? `<tr><td style="padding:4px 0 20px 0;">
         <div style="background:${BG};border:1px solid ${BORDER};border-radius:10px;padding:16px;">
           <pre style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.6;color:${TEXT};white-space:pre-wrap;">${escapeHtml(
             o.detail,
           )}</pre>
         </div>
       </td></tr>`
    : "";

  const cta = o.cta
    ? `<tr><td style="padding:6px 0 0 0;">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0">
           <tr>
             <td bgcolor="${VIOLET}" style="border-radius:999px;">
               <a href="${escapeHtml(o.cta.href)}"
                  style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">
                 ${escapeHtml(o.cta.label)}
               </a>
             </td>
           </tr>
         </table>
       </td></tr>`
    : "";

  const footnote = o.footnote
    ? `<tr><td style="padding:16px 0 0 0;font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(
        o.footnote,
      )}</td></tr>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background:${BG};">
<tr><td align="center" style="padding:28px 14px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

    <!-- Three solid cells, not a CSS gradient: this bar has to survive
         Outlook, and a header that vanishes takes the brand with it. -->
    <tr>
      <td style="border-radius:14px 14px 0 0;overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td height="4" bgcolor="${CYAN}" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td>
            <td height="4" bgcolor="${VIOLET}" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td>
            <td height="4" bgcolor="${MAGENTA}" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td bgcolor="${PANEL}" style="background:${PANEL};border:1px solid ${BORDER};border-top:0;border-radius:0 0 14px 14px;padding:30px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:0 0 22px 0;">${wordmark()}</td></tr>

          <tr>
            <td style="padding:0 0 6px 0;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:${GOLD};">
              ${escapeHtml(o.kicker)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 ${o.intro ? "10px" : "22px"} 0;font-size:25px;font-weight:700;line-height:1.2;color:${TEXT};">
              ${escapeHtml(o.headline)}
            </td>
          </tr>
          ${
            o.intro
              ? `<tr><td style="padding:0 0 24px 0;font-size:15px;line-height:1.65;color:${MUTED};">${escapeHtml(
                  o.intro,
                )}</td></tr>`
              : ""
          }
          ${blocks}
          ${detail}
          ${cta}
          ${footnote}
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:18px 4px 0 4px;font-size:11px;line-height:1.7;color:${MUTED};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;">
        ${escapeHtml(BRAND.name)} — the upgrade counter for
        <a href="${BRAND.parent.url}" style="color:${CYAN};text-decoration:none;">${escapeHtml(
          BRAND.parent.name,
        )}</a>
      </td>
    </tr>

  </table>
</td></tr></table>
</body></html>`;
}
