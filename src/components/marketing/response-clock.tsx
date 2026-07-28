"use client";

import * as React from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { CLOCK_DEFAULTS, readClock, type ClockInputs } from "@/lib/instruments/response";
import { computeLeak, type LeakInputs } from "@/lib/leak";
import { upgradeByKey } from "@/lib/upgrades";
import { Instrument, Readout, Figure, Dial } from "@/components/marketing/instrument";
import { usePlayground } from "@/components/marketing/playground";

/**
 * INSTRUMENT 04 — THE RESPONSE CLOCK
 *
 * Every owner knows they miss calls. Almost none can describe the shape of
 * what happens next, because it happens while they are under a sink.
 *
 * So this puts the interval on an axis and lets them drag through it. The
 * moment that lands is not the missed call — it is watching the "somebody else
 * answers" marker cross to the left of "you call back" as the callback slider
 * moves. That crossing is the whole business problem, and it is invisible in
 * every report they have ever been sent.
 *
 * HONESTY
 *   Every number here is one the visitor typed, including how fast a rival
 *   answers. Nothing is asserted about competitors, and the defaults are set
 *   so the instrument is unflattering to *us* rather than to them: at a
 *   twenty-minute callback the tool still shows the recovery slider below 1
 *   and will say plainly when the upgrade does not pay for itself.
 *
 *   The money side is `computeLeak`, unchanged and separately tested. This
 *   adds the axis it was always describing.
 */

const FIX = upgradeByKey("voice-employee")!;

export function ResponseClock() {
  const { clock, setClock, money, setMoney, add, justSeeded } = usePlayground();

  const reading = React.useMemo(() => readClock(clock), [clock]);
  const leak = React.useMemo(() => computeLeak(money, FIX.price), [money]);

  /** Scrub position in seconds. Starts at the end so the full story is visible. */
  const [t, setT] = React.useState<number | null>(null);
  const cursor = t ?? reading.span;

  const pct = (seconds: number) => Math.min(100, (seconds / reading.span) * 100);
  const fmt = (s: number) =>
    s < 90 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;

  const TONE = {
    you: { bar: "bg-cyan", text: "text-cyan", ring: "border-cyan/40" },
    lost: { bar: "bg-gold", text: "text-gold", ring: "border-gold/40" },
    rival: { bar: "bg-magenta", text: "text-magenta", ring: "border-magenta/40" },
  } as const;

  const reached = reading.events.filter((e) => e.at <= cursor);
  const latest = reached[reached.length - 1] ?? reading.events[0]!;

  return (
    <Instrument
      index={4}
      id="clock"
      name="What a Missed Call Costs"
      reads="What actually happens in the twenty minutes after you miss a call — including the bit where somebody else picks up."
    >
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className={cn("phx-card fx-panel self-start p-5 md:p-6", justSeeded && "fx-sheen")}>
          {/* ---- the timeline ---- */}
          <div className="relative pt-8">
            {/* markers */}
            {reading.events.map((e) => {
              const tone = TONE[e.tone];
              const left = pct(e.at);
              return (
                <div
                  key={e.key}
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: `${left}%` }}
                  aria-hidden
                >
                  <div
                    className={cn(
                      "mx-auto h-3 w-px",
                      e.at <= cursor ? tone.bar : "bg-white/12",
                    )}
                  />
                </div>
              );
            })}

            {/* the track */}
            <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="absolute inset-y-0 left-0 bg-cyan/30"
                style={{ width: `${pct(Math.min(cursor, reading.answerWindow))}%` }}
              />
              {cursor > reading.answerWindow && (
                <div
                  className="absolute inset-y-0 bg-gold/25"
                  style={{
                    left: `${pct(reading.answerWindow)}%`,
                    width: `${pct(cursor) - pct(reading.answerWindow)}%`,
                  }}
                />
              )}
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground"
                style={{ left: `${pct(cursor)}%` }}
                aria-hidden
              />
            </div>

            <label className="sr-only" htmlFor="scrub">
              Scrub through the call timeline
            </label>
            <input
              id="scrub"
              type="range"
              min={0}
              max={Math.round(reading.span)}
              value={Math.round(cursor)}
              onChange={(e) => setT(Number(e.target.value))}
              className="mt-3 w-full accent-cyan"
            />
            <div className="mt-1 flex justify-between font-mono text-[0.65rem] tabular-nums text-muted-foreground">
              <span>0s</span>
              <span className="text-foreground">{fmt(cursor)}</span>
              <span>{fmt(reading.span)}</span>
            </div>
          </div>

          {/* ---- what has happened by now ---- */}
          <ol className="mt-6 space-y-2">
            {reading.events.map((e) => {
              const tone = TONE[e.tone];
              const done = e.at <= cursor;
              return (
                <li
                  key={e.key}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    done ? tone.ring : "border-white/[0.06]",
                    done ? "bg-white/[0.025]" : "opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      done ? tone.bar : "bg-white/20",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-[0.88rem] font-medium">{e.label}</span>
                      <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                        {fmt(e.at)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-muted-foreground">
                      {e.detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="sr-only" aria-live="polite">
            At {fmt(cursor)}: {latest.label}. {latest.detail}
          </p>
        </div>

        {/* ---- the dials ---- */}
        <div className="flex flex-col gap-5">
          <div className="phx-card space-y-4 p-5">
            <div className="eyebrow text-[0.58rem] text-muted-foreground">The call</div>
            <Dial
              label="Rings before it goes to voicemail"
              value={clock.rings}
              display={`${clock.rings}`}
              min={1}
              max={12}
              onChange={(n) => setClock((c) => ({ ...c, rings: n }))}
            />
            <Dial
              label="How long before you ring them back"
              value={clock.callbackMinutes}
              display={`${clock.callbackMinutes} min`}
              min={0}
              max={120}
              onChange={(n) => setClock((c) => ({ ...c, callbackMinutes: n }))}
            />
            <Dial
              label="How long before they try the next guy"
              hint="Your guess, not ours. Be as generous to yourself as you like."
              value={clock.competitorMinutes}
              display={`${clock.competitorMinutes} min`}
              min={0}
              max={120}
              onChange={(n) => setClock((c) => ({ ...c, competitorMinutes: n }))}
            />
            <Dial
              label="Out of 10 missed calls, how many leave a message"
              value={clock.voicemailRate}
              display={`${clock.voicemailRate}`}
              min={0}
              max={10}
              onChange={(n) => setClock((c) => ({ ...c, voicemailRate: n }))}
            />
          </div>

          <div className="phx-card space-y-4 p-5">
            <div className="eyebrow text-[0.58rem] text-muted-foreground">What it costs you</div>
            <Dial
              label="Calls you get a month"
              value={money.callsPerMonth}
              display={String(money.callsPerMonth)}
              min={10}
              max={1500}
              step={10}
              onChange={(n) => setMoney((m) => ({ ...m, callsPerMonth: n }))}
            />
            <Dial
              label="How many you miss"
              value={money.missedPct}
              display={`${money.missedPct}%`}
              min={0}
              max={80}
              onChange={(n) => setMoney((m) => ({ ...m, missedPct: n }))}
            />
            <Dial
              label="How many you win when you do answer"
              value={money.closeRate}
              display={`${money.closeRate}%`}
              min={5}
              max={90}
              onChange={(n) => setMoney((m) => ({ ...m, closeRate: n }))}
            />
            <Dial
              label="What an average job is worth"
              value={money.jobValue}
              display={formatCurrency(money.jobValue)}
              min={10000}
              max={2000000}
              step={5000}
              onChange={(n) => setMoney((m) => ({ ...m, jobValue: n }))}
            />
            <Dial
              label="How many of the missed ones you could realistically save"
              hint="Set below 100% on purpose. Nobody saves every one."
              value={money.recovery}
              display={`${Math.round(money.recovery * 100)}%`}
              min={0}
              max={1}
              step={0.05}
              onChange={(n) => setMoney((m) => ({ ...m, recovery: n }))}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <Figure
              value={String(reading.silentOfTen)}
              unit="/10"
              caption="Of every 10, leave no message at all"
              tone="gold"
            />
            <Figure
              value={formatCurrency(leak.monthlyLeak)}
              caption="Walking out the door monthly"
              tone="magenta"
            />
            <Figure
              value={formatCurrency(leak.recoverable)}
              caption="You could save, by your own numbers"
              tone="signal"
            />
          </div>
        </div>
      </div>

      <Readout
        verdict={reading.overtaken ? "gap" : leak.underwater ? "clear" : "gap"}
        headline={
          reading.overtaken
            ? `Somebody else picks up ${fmt(reading.beatenBy)} before you ring back.`
            : "You ring back before anyone else picks up. Good."
        }
        body={
          leak.underwater
            ? `On your own numbers this saves ${formatCurrency(leak.recoverable)} a month and costs ${formatCurrency(FIX.price)}. It doesn't pay for itself, so don't buy it. Come back when you're taking more calls.`
            : reading.overtaken
              ? `${reading.silentOfTen} in 10 of them never leave a message, so most of this never shows up anywhere you'd think to look. You get ${reading.answerWindow} seconds to answer, and answering costs you nothing.`
              : `You beat them back to the phone — but ${reading.silentOfTen} in 10 never leave a message, so you're only ringing back the few who did.`
        }
        upgradeKey={leak.underwater ? undefined : FIX.key}
        onAdd={add}
      />
    </Instrument>
  );
}
