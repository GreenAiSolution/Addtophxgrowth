import * as React from "react";
import { cn } from "@/lib/utils";
import type { AgentAccent } from "@/lib/agents";

/**
 * Detailed SVG robot "headshots" — one distinct portrait per agent.
 * Fully self-contained (no external images), theme-aware, and accent-tinted.
 * Each variant has its own silhouette, optics, and panel detailing so the five
 * agents read as five different characters at a glance.
 */

export type RobotVariant = "qualifier" | "copywriter" | "sequencer" | "crm" | "objection";

const ACCENT_HSL: Record<AgentAccent, string> = {
  cyan: "187 92% 55%",
  violet: "265 78% 65%",
  magenta: "315 90% 62%",
  lime: "96 68% 55%",
  amber: "38 95% 58%",
};

interface RobotAvatarProps {
  variant: RobotVariant;
  accent: AgentAccent;
  className?: string;
  /** Adds an ambient animated glow (used on marketing + workspace headers). */
  glow?: boolean;
}

export function RobotAvatar({ variant, accent, className, glow = true }: RobotAvatarProps) {
  const a = `hsl(${ACCENT_HSL[accent]})`;
  const aDim = `hsl(${ACCENT_HSL[accent]} / 0.28)`;
  const uid = React.useId().replace(/[:]/g, "");
  const gradId = `plate-${uid}`;
  const glowId = `glow-${uid}`;

  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={`${variant} agent avatar`}
      className={cn("h-full w-full", className)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(228 22% 20%)" />
          <stop offset="55%" stopColor="hsl(230 26% 12%)" />
          <stop offset="100%" stopColor="hsl(232 30% 8%)" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor={a} stopOpacity="0.55" />
          <stop offset="70%" stopColor={a} stopOpacity="0.05" />
          <stop offset="100%" stopColor={a} stopOpacity="0" />
        </radialGradient>
      </defs>

      {glow && <circle cx="60" cy="54" r="52" fill={`url(#${glowId})`} />}

      {/* Antenna — shared, tinted */}
      <line x1="60" y1="8" x2="60" y2="24" stroke={aDim} strokeWidth="2" />
      <circle cx="60" cy="8" r="3.5" fill={a}>
        {glow && (
          <animate attributeName="opacity" values="1;0.35;1" dur="2.2s" repeatCount="indefinite" />
        )}
      </circle>

      {variant === "qualifier" && <Qualifier a={a} grad={gradId} />}
      {variant === "copywriter" && <Copywriter a={a} grad={gradId} />}
      {variant === "sequencer" && <Sequencer a={a} grad={gradId} />}
      {variant === "crm" && <Crm a={a} grad={gradId} />}
      {variant === "objection" && <Objection a={a} grad={gradId} />}
    </svg>
  );
}

interface PartProps {
  a: string;
  grad: string;
}

/** QUALI-7 — single wide scanner visor. */
function Qualifier({ a, grad }: PartProps) {
  return (
    <g>
      <rect x="26" y="26" width="68" height="64" rx="18" fill={`url(#${grad})`} stroke={a} strokeOpacity="0.35" />
      <rect x="20" y="46" width="8" height="20" rx="3" fill="hsl(228 22% 18%)" />
      <rect x="92" y="46" width="8" height="20" rx="3" fill="hsl(228 22% 18%)" />
      {/* Wide scanner eye */}
      <rect x="34" y="48" width="52" height="16" rx="8" fill="hsl(230 30% 6%)" stroke={a} strokeOpacity="0.5" />
      <circle cx="52" cy="56" r="4.5" fill={a} />
      <rect x="60" y="54" width="20" height="4" rx="2" fill={a} opacity="0.7">
        <animate attributeName="x" values="60;44;60" dur="2.6s" repeatCount="indefinite" />
      </rect>
      {/* Mouth grille */}
      <g stroke={a} strokeOpacity="0.5" strokeWidth="2">
        <line x1="46" y1="76" x2="46" y2="82" />
        <line x1="54" y1="76" x2="54" y2="82" />
        <line x1="62" y1="76" x2="62" y2="82" />
        <line x1="70" y1="76" x2="70" y2="82" />
      </g>
    </g>
  );
}

/** MUSE-9 — twin round optics + headphone cans (creative). */
function Copywriter({ a, grad }: PartProps) {
  return (
    <g>
      <rect x="28" y="28" width="64" height="60" rx="26" fill={`url(#${grad})`} stroke={a} strokeOpacity="0.35" />
      {/* Headphone cans */}
      <rect x="18" y="44" width="12" height="26" rx="6" fill="hsl(228 22% 16%)" stroke={a} strokeOpacity="0.4" />
      <rect x="90" y="44" width="12" height="26" rx="6" fill="hsl(228 22% 16%)" stroke={a} strokeOpacity="0.4" />
      {/* Eyes */}
      <circle cx="48" cy="54" r="9" fill="hsl(230 30% 6%)" stroke={a} strokeOpacity="0.5" />
      <circle cx="72" cy="54" r="9" fill="hsl(230 30% 6%)" stroke={a} strokeOpacity="0.5" />
      <circle cx="48" cy="54" r="4" fill={a} />
      <circle cx="72" cy="54" r="4" fill={a}>
        <animate attributeName="r" values="4;2.4;4" dur="3s" repeatCount="indefinite" />
      </circle>
      {/* Smile curve */}
      <path d="M46 74 Q60 84 74 74" fill="none" stroke={a} strokeOpacity="0.6" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

/** ECHO-4 — signal antenna waves + segmented head. */
function Sequencer({ a, grad }: PartProps) {
  return (
    <g>
      <path d="M30 30 h60 a10 10 0 0 1 10 10 v34 a16 16 0 0 1 -16 16 h-48 a16 16 0 0 1 -16 -16 v-34 a10 10 0 0 1 10 -10 z" fill={`url(#${grad})`} stroke={a} strokeOpacity="0.35" />
      {/* Signal arcs by the antenna */}
      <path d="M68 12 a10 10 0 0 1 8 8" fill="none" stroke={a} strokeOpacity="0.5" strokeWidth="2" />
      <path d="M72 8 a16 16 0 0 1 12 12" fill="none" stroke={a} strokeOpacity="0.3" strokeWidth="2" />
      {/* Eyes as a progress row */}
      <g>
        {[42, 54, 66, 78].map((x, i) => (
          <rect key={x} x={x} y="50" width="7" height="12" rx="3" fill={i < 3 ? a : "hsl(230 30% 14%)"} opacity={i < 3 ? 1 : 0.6}>
            {i === 2 && <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />}
          </rect>
        ))}
      </g>
      <rect x="44" y="76" width="32" height="5" rx="2.5" fill={a} opacity="0.4" />
    </g>
  );
}

/** LEDGER-3 — grid/database visor. */
function Crm({ a, grad }: PartProps) {
  return (
    <g>
      <rect x="26" y="28" width="68" height="62" rx="10" fill={`url(#${grad})`} stroke={a} strokeOpacity="0.35" />
      {/* Database grid visor */}
      <rect x="34" y="42" width="52" height="30" rx="4" fill="hsl(230 30% 6%)" stroke={a} strokeOpacity="0.5" />
      <g stroke={a} strokeOpacity="0.35" strokeWidth="1.5">
        <line x1="34" y1="52" x2="86" y2="52" />
        <line x1="34" y1="62" x2="86" y2="62" />
        <line x1="51" y1="42" x2="51" y2="72" />
        <line x1="69" y1="42" x2="69" y2="72" />
      </g>
      {/* Active cells */}
      <rect x="35" y="43" width="15" height="8" fill={a} opacity="0.8" />
      <rect x="70" y="63" width="15" height="8" fill={a} opacity="0.5">
        <animate attributeName="opacity" values="0.5;0.9;0.5" dur="2s" repeatCount="indefinite" />
      </rect>
      <g stroke={a} strokeOpacity="0.5" strokeWidth="2">
        <line x1="48" y1="80" x2="48" y2="85" />
        <line x1="60" y1="80" x2="60" y2="85" />
        <line x1="72" y1="80" x2="72" y2="85" />
      </g>
    </g>
  );
}

/** AEGIS-5 — armored shield head (defensive). */
function Objection({ a, grad }: PartProps) {
  return (
    <g>
      <path d="M60 26 L94 36 V64 Q94 84 60 94 Q26 84 26 64 V36 Z" fill={`url(#${grad})`} stroke={a} strokeOpacity="0.4" />
      {/* Center ridge */}
      <line x1="60" y1="30" x2="60" y2="88" stroke={a} strokeOpacity="0.25" strokeWidth="2" />
      {/* Determined eyes (angled) */}
      <path d="M40 52 l14 4" stroke={a} strokeWidth="5" strokeLinecap="round" />
      <path d="M80 52 l-14 4" stroke={a} strokeWidth="5" strokeLinecap="round" />
      <circle cx="46" cy="55" r="2.5" fill={a} />
      <circle cx="74" cy="55" r="2.5" fill={a} />
      {/* Guard mouth plate */}
      <rect x="48" y="70" width="24" height="8" rx="3" fill="hsl(230 30% 6%)" stroke={a} strokeOpacity="0.5" />
      <line x1="54" y1="70" x2="54" y2="78" stroke={a} strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="60" y1="70" x2="60" y2="78" stroke={a} strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="66" y1="70" x2="66" y2="78" stroke={a} strokeOpacity="0.4" strokeWidth="1.5" />
    </g>
  );
}
