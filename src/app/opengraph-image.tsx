import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

/**
 * The card that renders when somebody pastes a link into Slack, iMessage, or a
 * Facebook group. Generated at the edge rather than a static PNG, so it can't
 * drift from the brand and there is no asset to forget to update.
 *
 * Deliberately typographic: no photography, no logo file to fetch, nothing that
 * can fail to load. It reads at thumbnail size, which is the only size that
 * matters here.
 */

export const runtime = "edge";
export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#07070b",
          padding: 72,
          // Faint cockpit grid, drawn rather than fetched.
          backgroundImage:
            "linear-gradient(to right, rgba(34,211,238,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(34,211,238,0.07) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "rgba(34,211,238,0.15)",
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                background: "#22d3ee",
                transform: "rotate(45deg)",
                borderRadius: 3,
              }}
            />
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            <span style={{ color: "#fafafa", marginRight: 12 }}>{BRAND.wordmarkLead.trim()}</span>
            <span style={{ color: "#22d3ee" }}>{BRAND.wordmarkAccent}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 700,
              color: "#fafafa",
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            The parts of 2027
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 700,
              color: "#a78bfa",
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            nobody has staffed.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 40,
            fontSize: 22,
            color: "#8b8b9e",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          <span>Upgrades for PHX Growth clients</span>
          <div style={{ display: "flex", width: 8, height: 8, background: "#22d3ee", transform: "rotate(45deg)", marginTop: 8 }} />
          <span>Upgrades, not another agency</span>
          <div style={{ display: "flex", width: 8, height: 8, background: "#e879f9", transform: "rotate(45deg)", marginTop: 8 }} />
          {/* The differentiator, on the card itself. Somebody scrolling a
              Slack channel gets one line to understand why this link is worth
              a click, and "you can see the prices" is the strongest one. */}
          <span>Priced on the page</span>
        </div>
      </div>
    ),
    size,
  );
}
