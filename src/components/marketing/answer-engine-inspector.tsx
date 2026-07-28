"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ENTITY_ATTRIBUTES,
  readEntity,
  entityJsonLd,
  entitySentence,
  type EntityAnswers,
  type Confidence,
} from "@/lib/instruments/entity";
import { Instrument, Readout, Figure } from "@/components/marketing/instrument";
import { usePlayground } from "@/components/marketing/playground";
import { pulse } from "@/components/marketing/pulse";

/**
 * INSTRUMENT 01 — THE ANSWER ENGINE INSPECTOR
 *
 * The flagship, and the one that has to justify the whole page.
 *
 * An owner cannot see what a model sees. They can see their website, their
 * reviews and their ranking, none of which is what a resolver reads. So this
 * shows the resolution happening: ten attributes, each graded on the only
 * distinction that matters — do you state it in a machine-readable form, and
 * does anybody other than you confirm it — with the schema.org document
 * assembling itself line by line as the answers change.
 *
 * The document is the trick. Watching `"@type": "Thing"` become
 * `"LocalBusiness"` the moment a category is declared teaches more about
 * entity resolution in one click than a page of copy, because the visitor
 * caused it.
 *
 * ACCESSIBILITY
 *   The grid is a real table of buttons, not a canvas. Every state is
 *   reachable and announced; the JSON panel is a live region so a screen
 *   reader user is told the document changed rather than being left to guess.
 */

const CONFIDENCE: Record<
  Confidence,
  { label: string; dot: string; text: string; cell: string }
> = {
  resolved: {
    label: "Resolved",
    dot: "bg-signal",
    text: "text-signal",
    cell: "border-signal/40 bg-signal/[0.08]",
  },
  inferred: {
    label: "Claimed, uncorroborated",
    dot: "bg-gold",
    text: "text-gold",
    cell: "border-gold/35 bg-gold/[0.06]",
  },
  absent: {
    label: "Absent",
    dot: "bg-white/20",
    text: "text-muted-foreground",
    cell: "border-white/[0.07] bg-white/[0.015]",
  },
};

export function AnswerEngineInspector() {
  // State lives in the playground so instrument 02 can read the same answers.
  const { entity: answers, setEntity: setAnswers, business: name, setBusiness: setName, add, justSeeded } =
    usePlayground();

  const reading = React.useMemo(() => readEntity(answers), [answers]);
  const json = React.useMemo(() => entityJsonLd(answers, name), [answers, name]);
  const sentence = React.useMemo(() => entitySentence(reading, name), [reading, name]);

  /**
   * Three states, cycled by one control rather than two checkboxes.
   *
   * absent → claimed → resolved → absent. Two checkboxes would let a visitor
   * set "corroborated but not stated", which is not a state that exists — a
   * fact nobody can read on your site cannot be the fact another source is
   * agreeing with.
   */
  function cycle(key: string) {
    setAnswers((prev) => {
      const cur = prev[key];
      const next = !cur?.stated
        ? { stated: true, corroborated: false }
        : !cur.corroborated
          ? { stated: true, corroborated: true }
          : { stated: false, corroborated: false };
      return { ...prev, [key]: next };
    });
    pulse("instrument", key);
  }

  const nameId = React.useId();

  return (
    <Instrument
      index={1}
      id="inspector"
      name="The Answer Engine Inspector"
      reads="What a language model can actually determine about your business — and what it can only guess."
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* ---- the attribute grid ---- */}
        <div className={cn("phx-card fx-panel p-5 md:p-6", justSeeded && "fx-sheen")}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor={nameId} className="eyebrow text-[0.6rem] text-muted-foreground">
                Business name
              </label>
              <input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Business, LLC"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-cyan/50"
              />
            </div>
          </div>

          <p className="mt-4 text-[0.78rem] leading-relaxed text-muted-foreground">
            Click each attribute to cycle it:{" "}
            <span className="text-muted-foreground/70">absent</span> →{" "}
            <span className="text-gold">you say it</span> →{" "}
            <span className="text-signal">somebody else confirms it</span>.
          </p>

          <ul className="mt-4 grid gap-1.5">
            {reading.readings.map(({ attribute, confidence }) => {
              const c = CONFIDENCE[confidence];
              return (
                <li key={attribute.key}>
                  <button
                    type="button"
                    onClick={() => cycle(attribute.key)}
                    aria-label={`${attribute.label}: ${c.label}. Click to change.`}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
                      c.cell,
                      justSeeded && confidence !== "absent" && "fx-flash",
                    )}
                  >
                    <span className={cn("mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full", c.dot)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[0.85rem] font-medium">{attribute.label}</span>
                        {attribute.required && confidence === "absent" && (
                          <span className="chip border-gold/40 bg-gold/10 py-0 text-[0.55rem] text-gold">
                            blocking
                          </span>
                        )}
                      </span>
                      {attribute.property && (
                        <span className="mt-0.5 block truncate font-mono text-[0.68rem] text-muted-foreground/60">
                          {attribute.property}
                        </span>
                      )}
                      <span className="mt-1 block text-[0.72rem] leading-relaxed text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:h-0 md:overflow-hidden md:group-hover:h-auto md:group-focus-visible:h-auto">
                        {attribute.why}
                      </span>
                    </span>
                    <span className={cn("shrink-0 text-[0.62rem] uppercase tracking-wider", c.text)}>
                      {confidence === "resolved" ? "✓" : confidence === "inferred" ? "~" : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ---- the document it produces ---- */}
        <div className="flex flex-col gap-4">
          <div className="phx-card overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5">
              <span className="eyebrow text-[0.58rem] text-muted-foreground">
                What a crawler reads
              </span>
              <span className="font-mono text-[0.62rem] text-muted-foreground/60">
                application/ld+json
              </span>
            </div>
            {/* tabIndex on a scrolling region, because a keyboard user has no
                other way to reach the bottom of the document. axe flags this
                as serious and it is right to — the panel is the payload of the
                whole instrument. */}
            <pre
              tabIndex={0}
              role="region"
              aria-live="polite"
              aria-label="The structured data your answers produce"
              className="max-h-[19rem] overflow-auto p-4 font-mono text-[0.72rem] leading-[1.7] text-cyan/90 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan"
            >
              {json}
            </pre>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <Figure value={String(reading.resolved)} caption="Resolved" tone="signal" />
            <Figure value={String(reading.inferred)} caption="Your word only" tone="gold" />
            <Figure value={String(reading.absent)} caption="Nothing to read" />
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <div className="eyebrow text-[0.58rem] text-muted-foreground">
              The sentence it could say
            </div>
            <p className="mt-2 text-[0.9rem] leading-relaxed text-foreground/90">{sentence.can}</p>
            {sentence.cannot && (
              <p className="mt-2 text-[0.9rem] leading-relaxed text-gold/90">{sentence.cannot}</p>
            )}
          </div>
        </div>
      </div>

      <Readout
        verdict={reading.resolvable ? (reading.inferred > 0 ? "gap" : "clear") : "gap"}
        headline={
          !reading.resolvable
            ? "An assistant cannot name you at all."
            : reading.inferred > 0
              ? `${reading.inferred} of your facts rest on your word alone.`
              : "Every attribute is stated and corroborated."
        }
        body={
          !reading.resolvable
            ? `${reading.blocking.length} required attribute${reading.blocking.length === 1 ? " is" : "s are"} missing, so you are not a weak candidate — you are not a candidate. A resolver skips to somebody it can describe.`
            : reading.inferred > 0
              ? "A model can read them and has no reason to believe them. Corroboration is what turns a claim into a fact, and it happens on domains you do not own."
              : "Nothing on this instrument is missing. Run the Corroboration Web below to check the sources actually agree with each other."
        }
        upgradeKey={reading.resolvable && reading.inferred === 0 ? undefined : "answer-engine"}
        onAdd={add}
      />
    </Instrument>
  );
}
