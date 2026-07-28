/**
 * THE MARGINAL DOLLAR — engine.
 *
 * WHAT IT READS
 *   Where the next dollar of ad spend should go, from the numbers already on
 *   the visitor's own dashboards.
 *
 *   Owners compare channels on average cost per lead, which is the wrong
 *   number and the only one anybody publishes. Average CPL says what the whole
 *   budget did. The decision in front of you is about the *next* dollar, and
 *   the next dollar in a channel already at saturation buys much less than the
 *   average suggests. Two channels can show an identical average CPL while one
 *   has room and the other is finished.
 *
 * WHY THIS IS HONEST — AND WHY IT ENDS BY SELLING NOTHING
 *   The curve is not fitted from any dataset of ours. It is the standard
 *   diminishing-returns form, leads = k · spend^a, with the exponent set by
 *   the visitor on a slider, defaulting to 1.0 — perfectly linear, which is to
 *   say no diminishing returns at all. At the default this instrument tells
 *   you nothing, on purpose. You have to assert the curvature yourself before
 *   it will draw one.
 *
 *   `k` is then solved from the visitor's actual spend and leads, so every
 *   curve passes exactly through the point they reported. Nothing is invented;
 *   the shape between points is explicitly the visitor's assumption, and the
 *   UI says so.
 *
 *   This instrument's verdict is that PHX/GROWTH already does this — the
 *   Autonomous Budget Allocation loop runs it every fifteen minutes on live
 *   data. It sells nothing. It is here because an upgrade counter that will
 *   tell you when you do not need an upgrade is the only kind worth reading.
 */

export interface ChannelInput {
  key: string;
  name: string;
  /** Monthly spend, dollars. */
  spend: number;
  /** Leads that spend produced last month. */
  leads: number;
}

export const CHANNEL_DEFAULTS: ChannelInput[] = [
  { key: "meta", name: "Meta", spend: 6000, leads: 120 },
  { key: "google", name: "Google", spend: 9000, leads: 150 },
  { key: "tiktok", name: "TikTok", spend: 2000, leads: 25 },
];

export interface ChannelReading extends ChannelInput {
  /** What the whole budget averaged. The number everyone quotes. */
  averageCpl: number;
  /** What the next dollar costs. The number that decides anything. */
  marginalCpl: number;
  /** Spend after rebalancing to equalise marginal cost. */
  suggested: number;
  /** Positive means give it more. */
  delta: number;
  /** True when this channel has no reported spend and is excluded. */
  idle: boolean;
}

export interface MarginalReading {
  channels: ChannelReading[];
  totalSpend: number;
  totalLeads: number;
  blendedCpl: number;
  /** Leads the same budget would buy under the visitor's own curve. */
  rebalancedLeads: number;
  /** Extra leads, same money. Zero when the exponent is 1. */
  headroom: number;
  /** The visitor's assumed curvature. 1 = linear = no claim made. */
  exponent: number;
  /** True when the exponent is 1 and the instrument is deliberately mute. */
  neutral: boolean;
}

/**
 * leads(spend) = k · spend^a, with k solved so the curve hits the real point.
 * At a = 1 this is a straight line through the origin and the instrument makes
 * no claim at all.
 */
function solveK(spend: number, leads: number, a: number): number {
  if (spend <= 0 || leads <= 0) return 0;
  return leads / Math.pow(spend, a);
}

export function leadsAt(spend: number, k: number, a: number): number {
  if (spend <= 0 || k <= 0) return 0;
  return k * Math.pow(spend, a);
}

/** d(leads)/d(spend) inverted — the cost of one more lead at this spend. */
function marginalCost(spend: number, k: number, a: number): number {
  if (spend <= 0 || k <= 0 || a <= 0) return Infinity;
  const slope = k * a * Math.pow(spend, a - 1);
  return slope > 0 ? 1 / slope : Infinity;
}

export function readMarginal(inputs: ChannelInput[], exponent: number): MarginalReading {
  const a = Math.min(1, Math.max(0.3, exponent));
  const live = inputs.filter((c) => c.spend > 0 && c.leads > 0);
  const totalSpend = live.reduce((n, c) => n + c.spend, 0);
  const totalLeads = live.reduce((n, c) => n + c.leads, 0);

  const ks = new Map(live.map((c) => [c.key, solveK(c.spend, c.leads, a)]));
  const neutral = a >= 0.999;

  /**
   * At a = 1 the instrument refuses to answer, and that is the correct answer.
   *
   * A linear model has no interior optimum: marginal cost is constant per
   * channel, so equalising it means pouring the entire budget into whichever
   * channel has the best average and claiming the difference as free leads.
   * The first version of this did exactly that and reported 45 leads of
   * headroom on the default inputs — a number manufactured entirely by the
   * assumption, presented as a finding.
   *
   * It is a comfortable lie, too, because "move everything to Google" is the
   * kind of advice that sounds decisive. But the visitor has not yet told us
   * returns diminish, and without that there is no evidence any channel has a
   * ceiling. So: no reallocation, no headroom, and the UI says why.
   */
  if (neutral) {
    return {
      channels: inputs.map((c) => {
        const idle = !(c.spend > 0 && c.leads > 0);
        return {
          ...c,
          idle,
          averageCpl: c.leads > 0 ? c.spend / c.leads : 0,
          marginalCpl: idle ? 0 : c.spend / c.leads,
          suggested: idle ? 0 : c.spend,
          delta: 0,
        };
      }),
      totalSpend,
      totalLeads,
      blendedCpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      rebalancedLeads: totalLeads,
      headroom: 0,
      exponent: a,
      neutral: true,
    };
  }

  /**
   * Reallocate by equalising marginal cost across channels — the textbook
   * optimum, solved numerically because the closed form stops being readable
   * the moment channels have different exponents.
   *
   * Water-filling: hand out the budget in slices, each slice going wherever
   * the next lead is currently cheapest.
   */
  const suggested = new Map(live.map((c) => [c.key, 0]));
  const SLICES = 400;
  const slice = totalSpend / SLICES;
  for (let i = 0; i < SLICES && totalSpend > 0; i++) {
    let best: string | undefined;
    let bestCost = Infinity;
    for (const c of live) {
      const cost = marginalCost((suggested.get(c.key) ?? 0) + slice, ks.get(c.key) ?? 0, a);
      if (cost < bestCost) {
        bestCost = cost;
        best = c.key;
      }
    }
    if (!best) break;
    suggested.set(best, (suggested.get(best) ?? 0) + slice);
  }

  const channels: ChannelReading[] = inputs.map((c) => {
    const idle = !(c.spend > 0 && c.leads > 0);
    const k = ks.get(c.key) ?? 0;
    const sug = Math.round(suggested.get(c.key) ?? 0);
    return {
      ...c,
      idle,
      averageCpl: c.leads > 0 ? c.spend / c.leads : 0,
      marginalCpl: idle ? 0 : marginalCost(c.spend, k, a),
      suggested: idle ? 0 : sug,
      delta: idle ? 0 : sug - c.spend,
    };
  });

  const rebalancedLeads = live.reduce(
    (n, c) => n + leadsAt(suggested.get(c.key) ?? 0, ks.get(c.key) ?? 0, a),
    0,
  );

  return {
    channels,
    totalSpend,
    totalLeads,
    blendedCpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
    rebalancedLeads,
    headroom: Math.max(0, rebalancedLeads - totalLeads),
    exponent: a,
    neutral: a >= 0.999,
  };
}
