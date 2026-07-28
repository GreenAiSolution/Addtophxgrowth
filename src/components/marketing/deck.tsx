"use client";

import * as React from "react";
import { Playground, usePlayground } from "@/components/marketing/playground";
import { CoverageMatrix } from "@/components/marketing/coverage-matrix";
import { AnswerEngineInspector } from "@/components/marketing/answer-engine-inspector";
import { QueryFan } from "@/components/marketing/query-fan";
import { CorroborationWeb } from "@/components/marketing/corroboration-web";
import { ResponseClock } from "@/components/marketing/response-clock";
import { MarginalDollar } from "@/components/marketing/marginal-dollar";
import { StackComposer } from "@/components/marketing/stack-composer";

/**
 * The deck, in order.
 *
 * One client boundary around all seven instruments so they share a store: the
 * Inspector's answers drive the Query Fan directly, and the sample loader can
 * fill every panel at once. The page above stays a server component and knows
 * nothing about any of it.
 *
 * The order is an argument. 00 says how little we claim. 01 and 02 show what a
 * machine can and cannot do with you, 03 whether anybody backs you up, 04 what
 * the phone costs. 05 concludes we sell nothing for it. Only then, 06, does
 * anything get added up.
 */

/** Instrument 02 reads instrument 01's answers, so it needs the store. */
function FanFromInspector() {
  const { entity } = usePlayground();
  return <QueryFan answers={entity} />;
}

export function Deck() {
  return (
    <Playground>
      <Modules />
    </Playground>
  );
}

/**
 * The seven modules, in order, each told its position so a sample load can
 * boot them in sequence rather than flashing all seven at once.
 *
 * The order is an argument. 00 says how little we claim. 01 and 02 show what a
 * machine can and cannot do with you, 03 whether anybody backs you up, 04 what
 * the phone costs. 05 concludes we sell nothing for it. Only then, 06, does
 * anything get added up.
 */
function Modules() {
  const { justSeeded } = usePlayground();
  const parts = [
    <CoverageMatrix key="matrix" />,
    <AnswerEngineInspector key="inspector" />,
    <FanFromInspector key="fan" />,
    <CorroborationWeb key="web" />,
    <ResponseClock key="clock" />,
    <MarginalDollar key="marginal" />,
    <StackComposer key="compose" />,
  ];

  return (
    <>
      {parts.map((part, i) => (
        <div
          key={part.key}
          className={justSeeded ? "fx-boot" : undefined}
          style={{ "--i": i } as React.CSSProperties}
        >
          {part}
        </div>
      ))}
    </>
  );
}
