import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SLIDES, RUNNING_TIME, actLabel } from "@/lib/presentation";
import { TRACKS, OBJECTIONS, INTERNAL_ECONOMICS } from "@/lib/run-sheet";
import { BRAND } from "@/lib/brand";

/**
 * The presenter's copy. Print it, or open it on a phone beside the laptop.
 *
 * INTERNAL — this page renders our own economics and must never be the window
 * being shared. It says so at the top in a colour nobody misses, because the
 * failure mode is not somebody deciding to share it, it is somebody sharing
 * their whole screen with it open in the next tab.
 *
 * One long scrolling document rather than a second deck: on a call the rep is
 * looking for one slide's lines, and a document you can thumb through beats a
 * second thing to drive with arrow keys while driving the first one.
 */
export const metadata: Metadata = {
  title: `Run sheet — ${BRAND.name}`,
  robots: { index: false, follow: false, nocache: true },
};

export default function RunSheetPage() {
  return (
    <div className="min-h-screen bg-background print:bg-white print:text-black">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <Link
            href="/present"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> The deck
          </Link>
          <span className="font-mono text-[0.62rem] tracking-[0.2em] text-muted-foreground/60">
            {SLIDES.length} slides · ~{RUNNING_TIME}m
          </span>
        </div>

        <p className="mt-8 rounded-lg border border-magenta/40 bg-magenta/10 px-4 py-3 text-sm font-semibold text-magenta print:border-black print:bg-transparent print:text-black">
          INTERNAL — do not screen-share this page. It carries our own numbers.
          Share the deck at /present instead.
        </p>

        <h1 className="mt-8 text-3xl font-bold tracking-tight">The follow-up routine</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground print:text-black">
          The second call, written down. {SLIDES.length} slides across{" "}
          {new Set(SLIDES.map((s) => s.act)).size} acts, roughly {RUNNING_TIME} minutes of talking
          plus live tool time. Nothing is sold before act four; the first three acts are what makes
          act four believable.
        </p>

        {/* ── The talk track ───────────────────────────────────────────── */}
        <section className="mt-12">
          <h2 className="eyebrow text-[0.62rem] text-cyan print:text-black">Slide by slide</h2>
          <ol className="mt-5 space-y-7">
            {SLIDES.map((s, i) => {
              const track = TRACKS[s.id];
              return (
                <li
                  key={s.id}
                  className="break-inside-avoid rounded-xl border border-white/[0.08] p-5 print:border-black/20"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-lg font-bold leading-snug tracking-tight">
                      <span className="mr-3 font-mono text-[0.72rem] tabular-nums tracking-[0.2em] text-cyan print:text-black">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {s.title}
                    </h3>
                    <span className="eyebrow text-[0.55rem] text-muted-foreground/70 print:text-black">
                      {actLabel(s.act)} · {s.minutes}m · #{s.id}
                    </span>
                  </div>

                  {track && (
                    <>
                      <ul className="mt-3 space-y-2">
                        {track.say.map((line) => (
                          <li
                            key={line}
                            className="flex gap-2.5 text-[0.92rem] leading-relaxed text-foreground/90 print:text-black"
                          >
                            <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-cyan" />
                            {line}
                          </li>
                        ))}
                      </ul>
                      {track.action && (
                        <p className="mt-3 rounded-lg border border-violet/25 bg-violet/[0.07] px-3 py-2 text-[0.82rem] leading-snug text-violet print:border-black/20 print:bg-transparent print:text-black">
                          Do: {track.action}
                        </p>
                      )}
                      <p className="mt-3 border-t border-white/[0.07] pt-3 text-[0.82rem] leading-snug text-muted-foreground print:border-black/20 print:text-black">
                        <span className="font-semibold text-signal print:text-black">Lands:</span>{" "}
                        {track.lands}
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── Objections ───────────────────────────────────────────────── */}
        <section className="mt-14">
          <h2 className="eyebrow text-[0.62rem] text-cyan print:text-black">
            When they push back
          </h2>
          <dl className="mt-5 space-y-5">
            {OBJECTIONS.map((o) => (
              <div key={o.objection} className="break-inside-avoid">
                <dt className="text-[0.98rem] font-semibold leading-snug">
                  &ldquo;{o.objection}&rdquo;
                </dt>
                <dd className="mt-1.5 text-[0.9rem] leading-relaxed text-muted-foreground print:text-black">
                  {o.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Our side ─────────────────────────────────────────────────── */}
        <section className="mt-14 rounded-xl border border-gold/30 bg-gold/[0.05] p-6 print:border-black/30 print:bg-transparent">
          <h2 className="eyebrow text-[0.62rem] text-gold print:text-black">
            Internal · our side of the table
          </h2>
          <p className="mt-3 text-[0.95rem] font-semibold leading-snug">
            {INTERNAL_ECONOMICS.headline}
          </p>

          <table className="mt-5 w-full text-left text-[0.84rem]">
            <thead>
              <tr className="border-b border-white/[0.1] print:border-black/20">
                <th className="pb-2 font-semibold">Rung</th>
                <th className="pb-2 font-semibold">Monthly</th>
                <th className="pb-2 font-semibold">Annual</th>
              </tr>
            </thead>
            <tbody>
              {INTERNAL_ECONOMICS.rungs.map((r) => (
                <tr key={r.what} className="border-b border-white/[0.06] print:border-black/10">
                  <td className="py-2.5 pr-4 align-top">
                    <span className="block font-semibold">{r.rung}</span>
                    <span className="block text-[0.78rem] text-muted-foreground print:text-black">
                      {r.what}
                    </span>
                    <span className="mt-1 block text-[0.75rem] leading-snug text-muted-foreground/80 print:text-black">
                      {r.note}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 align-top font-mono tabular-nums text-gold print:text-black">
                    {r.monthly}
                  </td>
                  <td className="py-2.5 align-top font-mono tabular-nums text-muted-foreground print:text-black">
                    {r.annual}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-7 text-[0.9rem] font-semibold">Lead with</h3>
          <ul className="mt-2 space-y-1.5 text-[0.85rem] text-muted-foreground print:text-black">
            {INTERNAL_ECONOMICS.leadWith.map((l) => (
              <li key={l.upgrade}>
                <span className="font-semibold text-foreground print:text-black">{l.upgrade}</span>{" "}
                — {l.price} · on {l.service} · fixes: {l.why}
              </li>
            ))}
          </ul>

          <h3 className="mt-7 text-[0.9rem] font-semibold">Fee ladder — quote these exactly</h3>
          <ul className="mt-2 space-y-1.5 text-[0.85rem] text-muted-foreground print:text-black">
            {INTERNAL_ECONOMICS.feeLadder.map((f) => (
              <li key={f.plan}>
                <span className="font-semibold text-foreground print:text-black">{f.plan}</span> —{" "}
                {f.retainer} {f.fee} · {f.ceiling}
              </li>
            ))}
          </ul>

          <h3 className="mt-7 text-[0.9rem] font-semibold">Never, on any call</h3>
          <ol className="mt-2 space-y-1.5 text-[0.85rem] text-muted-foreground print:text-black">
            {INTERNAL_ECONOMICS.rules.map((r) => (
              <li key={r} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-gold" />
                {r}
              </li>
            ))}
          </ol>

          <p className="mt-7 border-t border-white/[0.1] pt-4 text-[0.82rem] leading-snug text-muted-foreground print:border-black/20 print:text-black">
            {INTERNAL_ECONOMICS.timing.slides} slides · {INTERNAL_ECONOMICS.timing.minutes} minutes
            of deck. {INTERNAL_ECONOMICS.timing.note}
          </p>
        </section>
      </div>
    </div>
  );
}
