import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

/**
 * The favicon.
 *
 * There wasn't one: every page was quietly 404ing on /favicon.ico and showing
 * the browser's blank sheet in the tab. On a site whose argument is that the
 * creative never runs out, an empty tab icon is a bad first impression made
 * before the page has even painted.
 *
 * Generated rather than committed as a .ico so it can't drift from the mark in
 * the header — both are the same rotated gradient diamond, drawn, with no font
 * or asset to fetch.
 */

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const alt = BRAND.shortName;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07070b",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            width: 17,
            height: 17,
            transform: "rotate(45deg)",
            borderRadius: 3,
            background: "linear-gradient(135deg, #22d3ee 0%, #8b5cf6 55%, #ec4899 100%)",
          }}
        />
      </div>
    ),
    size,
  );
}
