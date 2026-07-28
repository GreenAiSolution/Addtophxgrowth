/**
 * THE RESPONSE CLOCK — engine.
 *
 * WHAT IT READS
 *   The five minutes after somebody calls you, second by second.
 *
 *   Every owner knows they miss calls. Almost none can describe the shape of
 *   what happens next, because it happens while they are under a sink. This
 *   lays the interval out on one axis: the rings, the moment it goes to
 *   voicemail, the gap before anybody calls back, and — the part nobody
 *   models — the competitor who answered somewhere inside that gap.
 *
 * WHY THIS IS HONEST
 *   Every number on this timeline is one the visitor typed. Nothing is
 *   asserted about how quickly a competitor answers; the visitor sets that
 *   too, and the default is deliberately unflattering to us rather than to
 *   them. The only computation is ordering events on a line and subtracting.
 *
 *   `computeLeak` in `../leak.ts` remains the money side of the same picture
 *   and is unchanged. This adds the axis it was always describing.
 */

export interface ClockInputs {
  /** Rings before the call gives up or diverts. */
  rings: number;
  /** Seconds per ring. Six is the North American standard cadence. */
  secondsPerRing: number;
  /** Minutes before somebody on your side calls back. */
  callbackMinutes: number;
  /** Minutes before the caller reaches whoever they try next. */
  competitorMinutes: number;
  /** Of ten callers who reach voicemail, how many leave one. */
  voicemailRate: number;
}

export const CLOCK_DEFAULTS: ClockInputs = {
  rings: 5,
  secondsPerRing: 6,
  callbackMinutes: 20,
  competitorMinutes: 4,
  voicemailRate: 2,
};

export interface ClockEvent {
  key: string;
  label: string;
  /** Seconds from the first ring. */
  at: number;
  tone: "you" | "lost" | "rival";
  detail: string;
}

export interface ClockReading {
  /** How long the phone is actually answerable. */
  answerWindow: number;
  events: ClockEvent[];
  /** Seconds between the call being dropped and you calling back. */
  gap: number;
  /** True when the caller has already been served before you ring back. */
  overtaken: boolean;
  /** Seconds by which you are beaten. Zero when you are not. */
  beatenBy: number;
  /** Of ten callers, how many leave no trace at all. */
  silentOfTen: number;
  /** The full span the chart has to draw. */
  span: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function readClock(raw: ClockInputs): ClockReading {
  const rings = clamp(Math.round(raw.rings), 1, 12);
  const perRing = clamp(Math.round(raw.secondsPerRing), 2, 12);
  const callback = clamp(raw.callbackMinutes, 0, 240) * 60;
  const rival = clamp(raw.competitorMinutes, 0, 240) * 60;
  const vmRate = clamp(Math.round(raw.voicemailRate), 0, 10);

  const answerWindow = rings * perRing;
  const overtaken = rival < callback;

  const events: ClockEvent[] = ([
    {
      key: "ring",
      label: "They call",
      at: 0,
      tone: "you",
      detail: "Somebody who needs the thing you sell, deciding right now.",
    },
    {
      key: "window",
      label: `${rings} rings — ${answerWindow}s`,
      at: answerWindow,
      tone: "you",
      detail: "The entire window in which answering costs you nothing.",
    },
    {
      key: "voicemail",
      label: "Voicemail",
      at: answerWindow + 1,
      tone: "lost",
      detail: `${10 - vmRate} of every 10 callers leave nothing, so you never learn they called.`,
    },
    {
      key: "rival",
      label: "Somebody else answers",
      at: answerWindow + rival,
      tone: "rival",
      detail: "The next number on the list. Not a better business — a reachable one.",
    },
    {
      key: "callback",
      label: "You call back",
      at: answerWindow + callback,
      tone: overtaken ? "lost" : "you",
      detail: overtaken
        ? "The job is already booked. You are ringing a customer who has one."
        : "Still in time — provided they left a number at all.",
    },
  ] as ClockEvent[]).sort((a, b) => a.at - b.at);

  return {
    answerWindow,
    events,
    gap: callback,
    overtaken,
    beatenBy: overtaken ? callback - rival : 0,
    silentOfTen: 10 - vmRate,
    // The last thing that happens, plus a tenth for breathing room. An earlier
    // version padded by a whole answer window, which on a twenty-minute
    // callback squashed every early event into the leftmost 2% of the track —
    // the rings and the voicemail became one indistinguishable smudge, which is
    // the part of the story the instrument exists to show.
    span: Math.max(answerWindow + callback, answerWindow + rival) * 1.1,
  };
}
