import { cn } from "@/lib/utils";
import type { Accent, Card, Row, Slide } from "@/lib/presentation";

/**
 * The six layouts, and nothing else.
 *
 * WHY SIX
 *   A deck with a bespoke layout per slide is a deck nobody can add a slide to
 *   six months later without it looking wrong. Six shapes cover the whole
 *   routine: a statement, a list, a row of cards, a chain of workflow nodes, a
 *   claim with points under it, and a column of money.
 *
 * SIZING
 *   Everything is `clamp()`-ish through Tailwind's arbitrary values rather than
 *   a scale transform on a fixed 16:9 canvas. A transform looks correct until
 *   somebody presents on a 4:3 projector or shares a half-width window on a
 *   call, at which point the text is either microscopic or cropped. Type that
 *   simply reflows survives both, and screen-share compression is kinder to it.
 *
 *   The dense lists can outgrow a short viewport — a ten-operator roster on a
 *   laptop in a hotel is a real case — so the slide body scrolls rather than
 *   clipping. A cropped slide on a shared screen is invisible to the presenter,
 *   who is looking at their own notes.
 */

const ACCENT_TEXT: Record<Accent, string> = {
  cyan: "text-cyan",
  violet: "text-violet",
  magenta: "text-magenta",
  gold: "text-gold",
  signal: "text-signal",
};

const ACCENT_BORDER: Record<Accent, string> = {
  cyan: "border-cyan/30",
  violet: "border-violet/30",
  magenta: "border-magenta/30",
  gold: "border-gold/35",
  signal: "border-signal/30",
};

function ListRows({ rows, dense }: { rows: Row[]; dense?: boolean }) {
  return (
    <ol className="grid overflow-hidden rounded-xl border border-white/[0.08]">
      {rows.map((r, i) => (
        <li
          key={`${r.lead}-${i}`}
          className={cn(
            "flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-white/[0.07] last:border-b-0",
            dense ? "px-4 py-2.5" : "px-5 py-4",
          )}
        >
          <span
            className={cn(
              "shrink-0 font-mono tabular-nums tracking-[0.16em] text-cyan",
              dense ? "w-[5.5rem] text-[0.72rem]" : "w-[6rem] text-[0.8rem]",
            )}
          >
            {r.lead}
          </span>
          <span className="min-w-[12rem] flex-1">
            <span
              className={cn(
                "block font-semibold leading-snug",
                dense ? "text-[clamp(0.9rem,1.25vw,1.05rem)]" : "text-[clamp(1rem,1.5vw,1.3rem)]",
              )}
            >
              {r.title}
            </span>
            {r.body && (
              <span
                className={cn(
                  "mt-0.5 block leading-snug text-muted-foreground",
                  dense
                    ? "text-[clamp(0.74rem,1vw,0.88rem)]"
                    : "text-[clamp(0.82rem,1.1vw,1rem)]",
                )}
              >
                {r.body}
              </span>
            )}
          </span>
          {r.tag && (
            <span className="eyebrow shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[0.55rem] text-muted-foreground/80">
              {r.tag}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function CardGrid({ cards, columns }: { cards: Card[]; columns: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 xl:grid-cols-4",
      )}
    >
      {cards.map((c) => {
        const accent = c.accent ?? "cyan";
        return (
          <article
            key={c.title}
            className={cn(
              "flex flex-col rounded-xl border bg-black/25 p-5",
              ACCENT_BORDER[accent],
            )}
          >
            {c.eyebrow && (
              <p className={cn("eyebrow text-[0.56rem]", ACCENT_TEXT[accent])}>{c.eyebrow}</p>
            )}
            <h3 className="mt-2 text-[clamp(1.05rem,1.5vw,1.35rem)] font-bold leading-tight tracking-tight">
              {c.title}
            </h3>
            {c.price && (
              <p className="mt-2">
                <span
                  className={cn(
                    "font-mono text-[clamp(1.1rem,1.7vw,1.5rem)] tabular-nums font-semibold",
                    ACCENT_TEXT[accent],
                  )}
                >
                  {c.price}
                </span>
                {c.priceNote && (
                  <span className="ml-2 text-[0.78rem] text-muted-foreground">{c.priceNote}</span>
                )}
              </p>
            )}
            <ul className="mt-3 space-y-1.5">
              {c.lines.map((line) => (
                <li
                  key={line}
                  className="flex gap-2 text-[clamp(0.78rem,1.05vw,0.95rem)] leading-snug text-muted-foreground"
                >
                  <span aria-hidden className={cn("mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-current", ACCENT_TEXT[accent])} />
                  {line}
                </li>
              ))}
            </ul>
            {c.note && (
              <p className="mt-4 border-t border-white/[0.07] pt-3 text-[clamp(0.76rem,1vw,0.9rem)] leading-snug text-foreground/85">
                {c.note}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function SlideView({ slide }: { slide: Slide }) {
  const body = slide.body;

  /**
   * The two statement slides are laid out on their own.
   *
   * Sharing the working-slide skeleton put the headline hard against the top
   * of a 1080p screen with the strip at the bottom and roughly half the slide
   * empty in between — which reads on a call as "the deck has not finished
   * loading". A statement slide is one thought and it belongs in the middle of
   * the frame.
   */
  if (body.kind === "title") {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <p className="eyebrow text-[0.6rem] text-cyan">{slide.eyebrow}</p>
          <h2 className="mt-4 max-w-[22ch] font-bold leading-[1.03] tracking-tight text-[clamp(2.4rem,5.6vw,5rem)]">
            {slide.title}
          </h2>
          <p className="mt-7 max-w-3xl text-[clamp(1.05rem,1.9vw,1.55rem)] leading-relaxed text-foreground/85">
            {body.statement}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] pt-5">
          {body.strip.map((item, i, all) => (
            <span key={item} className="flex items-center gap-5">
              <span className="eyebrow text-[0.62rem] text-muted-foreground/80">{item}</span>
              {i < all.length - 1 && (
                <span aria-hidden className="text-muted-foreground/30">
                  ·
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* ── Slide head ─────────────────────────────────────────────────── */}
      <header className="shrink-0">
        <p className="eyebrow text-[0.6rem] text-cyan">{slide.eyebrow}</p>
        <h2 className="mt-3 text-[clamp(1.5rem,3vw,2.6rem)] font-bold leading-[1.05] tracking-tight">
          {slide.title}
        </h2>
        {slide.lede && (
          <p className="mt-3 max-w-4xl text-[clamp(0.9rem,1.25vw,1.1rem)] leading-relaxed text-muted-foreground">
            {slide.lede}
          </p>
        )}
      </header>

      {/* ── Slide body ─────────────────────────────────────────────────── */}
      <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
        {body.kind === "list" && <ListRows rows={body.rows} dense={body.dense} />}

        {body.kind === "cards" && <CardGrid cards={body.cards} columns={body.columns} />}

        {body.kind === "chain" && (
          <div className="grid gap-4 lg:grid-cols-2">
            {body.chains.map((c) => (
              <article key={c.name} className="rounded-xl border border-white/[0.08] bg-black/25 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[clamp(1rem,1.4vw,1.2rem)] font-bold tracking-tight">
                    {c.name}
                  </h3>
                  <span className="eyebrow text-[0.55rem] text-signal">{c.cadence}</span>
                </div>
                <p className="mt-2 text-[clamp(0.76rem,1vw,0.9rem)] leading-snug text-muted-foreground">
                  {c.detail}
                </p>
                {/* The node chain is the point — the parent publishes these,
                    and reading one aloud does more than any paragraph about
                    "transparency" ever has. */}
                <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                  {c.nodes.map((n, i) => (
                    <li key={n} className="flex items-center gap-1.5">
                      <span className="rounded-md border border-cyan/25 bg-cyan/[0.07] px-2 py-1 font-mono text-[0.62rem] tracking-wide text-cyan/90">
                        {n}
                      </span>
                      {i < c.nodes.length - 1 && (
                        <span aria-hidden className="text-[0.6rem] text-muted-foreground/40">
                          →
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        )}

        {body.kind === "split" && (
          <div className="grid gap-7 lg:grid-cols-[1.05fr_1.35fr]">
            <p
              className={cn(
                "border-l-2 pl-5 text-[clamp(1rem,1.55vw,1.35rem)] font-semibold leading-snug",
                ACCENT_BORDER[body.accent ?? "cyan"],
              )}
            >
              {body.claim}
            </p>
            <ul className="grid gap-3 self-start">
              {body.points.map((p) => (
                <li key={p.title} className="rounded-xl border border-white/[0.08] bg-black/25 px-5 py-3.5">
                  <p
                    className={cn(
                      "text-[clamp(0.92rem,1.25vw,1.08rem)] font-semibold leading-snug",
                      p.body ? "" : ACCENT_TEXT[body.accent ?? "cyan"],
                    )}
                  >
                    {p.title}
                  </p>
                  {p.body && (
                    <p className="mt-1 text-[clamp(0.78rem,1.05vw,0.94rem)] leading-snug text-muted-foreground">
                      {p.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {body.footnote && (
              <p className="text-[clamp(0.78rem,1vw,0.92rem)] leading-relaxed text-muted-foreground lg:col-span-2">
                {body.footnote}
              </p>
            )}
          </div>
        )}

        {body.kind === "math" && (
          <div className="max-w-4xl">
            <p className="eyebrow text-[0.58rem] text-muted-foreground/80">{body.caption}</p>
            <dl className="mt-4 overflow-hidden rounded-xl border border-white/[0.08]">
              {body.rows.map((r) => (
                <div
                  key={r.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-white/[0.07] px-5 py-3"
                >
                  <dt className="text-[clamp(0.85rem,1.15vw,1rem)] font-medium">{r.label}</dt>
                  <dd className="flex items-baseline gap-3">
                    {r.note && (
                      <span className="text-[0.75rem] text-muted-foreground">{r.note}</span>
                    )}
                    <span className="font-mono text-[clamp(0.95rem,1.4vw,1.25rem)] tabular-nums font-semibold text-cyan">
                      {r.value}
                    </span>
                  </dd>
                </div>
              ))}
              {body.total && (
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 bg-gold/[0.06] px-5 py-4">
                  <dt className="text-[clamp(0.9rem,1.2vw,1.05rem)] font-bold">
                    {body.total.label}
                  </dt>
                  <dd className="flex items-baseline gap-3">
                    {body.total.note && (
                      <span className="text-[0.75rem] text-muted-foreground">
                        {body.total.note}
                      </span>
                    )}
                    <span className="font-mono text-[clamp(1.1rem,1.7vw,1.55rem)] tabular-nums font-bold text-gold">
                      {body.total.value}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-4 text-[clamp(0.78rem,1vw,0.92rem)] leading-relaxed text-muted-foreground">
              {body.footnote}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
