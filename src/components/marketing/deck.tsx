"use client";

import * as React from "react";
import { Playground, usePlayground } from "@/components/marketing/playground";
import { Fold } from "@/components/marketing/instrument";
import { CoverageMatrix } from "@/components/marketing/coverage-matrix";
import { AnswerEngineInspector } from "@/components/marketing/answer-engine-inspector";
import { QueryFan } from "@/components/marketing/query-fan";
import { CorroborationWeb } from "@/components/marketing/corroboration-web";
import { ResponseClock } from "@/components/marketing/response-clock";
import { MarginalDollar } from "@/components/marketing/marginal-dollar";
import { StackComposer } from "@/components/marketing/stack-composer";
import { SystemMap } from "@/components/marketing/system-map";

/**
 * THE DECK.
 *
 * One client boundary around every instrument so they share a store: the
 * Inspector's answers drive the Query Fan directly, and the sample loader can
 * fill every panel at once. The page above stays a server component and knows
 * nothing about any of it.
 *
 * FOUR IN FRONT, THREE BEHIND
 *   Every one of these tools is good and none of them is hard to read. Eight of
 *   them stacked is still a wall, and a wall is what an owner reading on a
 *   phone between jobs bounces off — so the page shows the map, three tools
 *   that each pay the reader back in about a minute, and the thing that adds it
 *   up. The other three are one click away, named, for anybody who wants them.
 *
 *   The four in front are chosen on how fast they land:
 *
 *     Coverage    orients — here is what you already buy, here is what is left
 *     Inspector   the hook — what a machine can and cannot determine about you
 *     Clock       the money — what the phone costs, on your own numbers
 *     Composer    the close — what any of it adds up to
 *
 *   The three behind are the deeper reads: which questions leave you out, who
 *   corroborates you, and where the next ad dollar should go.
 *
 * WHY THE MARGINAL DOLLAR IS LAST
 *   It sells nothing. It concludes that PHX/GROWTH already does this on a
 *   fifteen-minute loop and offers no upgrade at all, and every owner reading
 *   this has been through a diagnostic that happened to diagnose exactly what
 *   its author was selling. One tool that can say "not ours" is what buys the
 *   other six their credibility — but it does that job perfectly well as a
 *   closing note, and it is also the hardest of the seven to read. Putting the
 *   site's most demanding tool ahead of the one that actually takes an order
 *   was costing more than it was worth.
 *
 * THE ORDER LIVES HERE AND NOWHERE ELSE
 *   Each instrument takes its number as a prop rather than printing its own.
 *   They each used to hardcode their own position, which meant re-ordering the
 *   deck required editing seven files plus the contents page — and any one of
 *   them being missed showed a visitor two modules with the same number.
 */

/** The fan reads the Inspector's answers, so it needs the store. */
function FanFromInspector({ index }: { index: number }) {
  const { entity } = usePlayground();
  return <QueryFan answers={entity} index={index} />;
}

/**
 * The order. Each `id` matches the anchor its instrument renders and the entry
 * on the contents page above — `consistency.test.ts` checks all three agree,
 * because a contents page pointing at an anchor that does not exist is a dead
 * link on the most-clicked element of the site.
 */
const UP_FRONT = [
  { id: "matrix", render: (i: number) => <CoverageMatrix index={i} /> },
  { id: "inspector", render: (i: number) => <AnswerEngineInspector index={i} /> },
  { id: "clock", render: (i: number) => <ResponseClock index={i} /> },
  { id: "compose", render: (i: number) => <StackComposer index={i} /> },
];

const DEEPER = [
  { id: "fan", render: (i: number) => <FanFromInspector index={i} /> },
  { id: "web", render: (i: number) => <CorroborationWeb index={i} /> },
  { id: "marginal", render: (i: number) => <MarginalDollar index={i} /> },
];

/** Every tool, in the order a visitor meets them. Read by the page and by tests. */
export const DECK_ORDER = [...UP_FRONT, ...DEEPER].map((m) => m.id);

export function Deck() {
  return (
    <Playground>
      <Modules />
    </Playground>
  );
}

function Modules() {
  const { justSeeded } = usePlayground();

  /**
   * A fragment link into a closed <details> does nothing in most browsers, and
   * the contents page at the top of the site links to all seven tools. Without
   * this, three of those entries were dead: the click registered, the URL
   * changed, and the page sat still.
   *
   * Generic on purpose — it opens whichever fold contains the target, so it
   * keeps working if anything else is ever folded away.
   */
  React.useEffect(() => {
    function reveal() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      const fold = target?.closest("details");
      if (!target || !fold || fold.open) return;
      fold.open = true;
      // The browser already gave up on scrolling to a target it could not
      // measure, so the jump has to be re-issued now it has a position.
      target.scrollIntoView();
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  /** Staggers the boot sweep when the sample loads, so panels arrive in order. */
  const boot = (i: number) => ({
    className: justSeeded ? "fx-boot" : undefined,
    style: { "--i": i } as React.CSSProperties,
  });

  return (
    <>
      {/* The map opens the deck: the shape of the whole thing before any of
          the parts, so every module below has somewhere to sit in the
          reader's head. */}
      <div {...boot(0)}>
        <SystemMap />
      </div>

      {UP_FRONT.map((m, i) => (
        <div key={m.id} {...boot(i + 1)}>
          {m.render(i)}
        </div>
      ))}

      {/*
        The fold sits after the Composer, so the close comes before the extras
        rather than behind them. Its own container, because the instruments
        inside bring their own.
      */}
      <div className="container my-6">
        <Fold
          summary={`${DEEPER.length} more tools`}
          hint="Which questions leave you out, who else backs you up, and where your next ad dollar should go — that last one sells you nothing."
        >
          <div className="-mx-4 -my-4">
            {DEEPER.map((m, i) => (
              <div key={m.id} {...boot(UP_FRONT.length + 1 + i)}>
                {m.render(UP_FRONT.length + i)}
              </div>
            ))}
          </div>
        </Fold>
      </div>
    </>
  );
}
