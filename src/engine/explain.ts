// Deterministic "why this size" explainer. It turns the exact numbers the EV engine already
// computed into a short, worked mathematical justification of the highest-EV action: the
// equations to solve, the numbers plugged in, the resulting EV of every option, and the
// modern-poker shortcuts (rule of 2 & 4, pot odds, MDF, alpha) so the player can reproduce
// the logic at the table — not just be told the answer.
import { Card } from "./cards";
import { EVResult, ActionEV } from "./ev";
import { potOdds, alpha, pct, bb } from "./theory";
import { Street } from "./coach";

export interface ExplainLine {
  label: string;
  formula: string; // general form, e.g. "need = call ÷ (pot + call)"
  plug?: string; // numbers substituted in
  result?: string; // the value it evaluates to
  note?: string; // one-line interpretation
}

export interface EVRow {
  label: string;
  ev: number;
  best: boolean;
}

export interface Explanation {
  headline: string;
  summary: string;
  lines: ExplainLine[]; // the worked equations for THIS spot
  evRows: EVRow[]; // every option ranked by EV
  shortcuts: ExplainLine[]; // reusable formula reference
}

export interface ExplainContext {
  street: Street;
  board: Card[];
  equity: number;
  pot: number; // pot before hero acts
  toCall: number;
  facingBet: boolean;
  heroInPosition: boolean;
  evResult: EVResult;
}

function cardsToCome(street: Street): 0 | 1 | 2 {
  if (street === "flop") return 2;
  if (street === "turn") return 1;
  return 0;
}

// Nearest named fraction for a bet relative to the pot ("½-pot", "⅔-pot", …).
function labelFrac(bet: number, pot: number): string {
  if (pot <= 0) return `${bet.toFixed(1)}bb`;
  const r = bet / pot;
  const named: [number, string][] = [
    [1 / 3, "⅓-pot"],
    [1 / 2, "½-pot"],
    [2 / 3, "⅔-pot"],
    [1, "pot-sized"],
  ];
  for (const [v, n] of named) if (Math.abs(r - v) < 0.08) return n;
  return `${r.toFixed(1)}× pot`;
}

// The best passive baseline (fold/check/call) to compare an aggressive line against.
function passiveBaseline(ev: EVResult): ActionEV | null {
  let best: ActionEV | null = null;
  for (const a of ev.actions) {
    if (a.kind === "bet" || a.kind === "raise") continue;
    if (!best || a.ev > best.ev) best = a;
  }
  return best;
}

function buildSummary(ctx: ExplainContext, best: ActionEV): string {
  const eq = pct(ctx.equity, 0);
  if (best.kind === "fold") {
    const need = pct(potOdds(ctx.toCall, ctx.pot), 0);
    return `Only ${eq} equity against the ${need} you'd need to call — folding forfeits the least, since a losing call is worse than 0 EV.`;
  }
  if (best.kind === "check") {
    return `With ${eq} equity and not enough fold equity to bet profitably, checking banks your share of the pot for free and lets villain keep bluffing.`;
  }
  if (best.kind === "call") {
    const need = pct(potOdds(ctx.toCall, ctx.pot), 0);
    return `Your ${eq} equity clears the ${need} pot-odds threshold, so calling is +EV — and raising folds out too little of villain's range to beat it.`;
  }
  // bet / raise
  const f = pct(best.villainFold ?? 0, 0);
  const base = passiveBaseline(ctx.evResult);
  const edge = base ? Math.max(0, best.ev - base.ev) : 0;
  const vs = base ? ` — about +${bb(edge)} over ${base.label}` : "";
  return `${cap(best.label)} (${labelFrac(best.amount, ctx.pot)}) is highest-EV: it folds out ~${f} of villain's range now and still realizes ${eq} equity when called${vs}.`;
}

export function explainDecision(ctx: ExplainContext): Explanation {
  const { evResult } = ctx;
  const best = evResult.actions[evResult.bestIndex];
  const lines: ExplainLine[] = [];

  // 1) Equity — plus the rule-of-2-and-4 shortcut while draws are still live.
  lines.push({
    label: "Your equity vs range",
    formula: "wins ÷ showdowns, simulated vs villain's combos",
    result: pct(ctx.equity, 1),
    note: "Exact on the river, Monte-Carlo before it.",
  });
  const ctc = cardsToCome(ctx.street);
  if (ctc > 0) {
    const mult = ctc === 2 ? 4 : 2;
    const impliedOuts = Math.max(0, Math.round((ctx.equity * 100) / mult));
    lines.push({
      label: "Shortcut · rule of 2 & 4",
      formula: ctc === 2 ? "equity ≈ outs × 4  (flop, 2 to come)" : "equity ≈ outs × 2  (turn, 1 to come)",
      plug: `${pct(ctx.equity, 0)} ≈ ${impliedOuts} × ${mult}`,
      note: `Count your clean outs and multiply by ${mult}. ${pct(ctx.equity, 0)} here ≈ ${impliedOuts} outs.`,
    });
  }

  // 2) Pot odds whenever there's a price to pay.
  if (ctx.toCall > 0) {
    const need = potOdds(ctx.toCall, ctx.pot);
    lines.push({
      label: "Pot odds · call threshold",
      formula: "need = call ÷ (pot + call)",
      plug: `${bb(ctx.toCall)} ÷ (${bb(ctx.pot)} + ${bb(ctx.toCall)})`,
      result: pct(need, 1),
      note:
        ctx.equity >= need
          ? `${pct(ctx.equity, 0)} ≥ ${pct(need, 0)} → continuing is justified.`
          : `${pct(ctx.equity, 0)} < ${pct(need, 0)} → a bare call is -EV.`,
    });
  }

  // 3) The math behind the recommended action itself.
  if (best.kind === "bet" || best.kind === "raise") {
    const s = best.amount;
    const pot = ctx.pot;
    const a = alpha(s, pot);
    const f = best.villainFold ?? a;
    lines.push({
      label: "Fold equity (α) of this size",
      formula: "α = bet ÷ (pot + bet)",
      plug: `${bb(s)} ÷ (${bb(pot)} + ${bb(s)})`,
      result: pct(a, 1),
      note: `A ${labelFrac(s, pot)} bet must win ~${pct(a, 0)} of the time outright; it folds out ~${pct(f, 0)} of villain's range.`,
    });
    lines.push({
      label: "EV of the bet",
      formula: "EV = f·pot + (1−f)·(eq·(pot+2·bet) − bet)",
      plug: `${pct(f, 0)}·${bb(pot)} + ${pct(1 - f, 0)}·(eq·${bb(pot + 2 * s)} − ${bb(s)})`,
      result: bb(best.ev),
      note: "Fold branch: win the pot now. Call branch: realize equity in the bigger pot.",
    });
  } else if (best.kind === "check") {
    lines.push({
      label: "EV of checking",
      formula: "EV ≈ equity × pot",
      plug: `${pct(ctx.equity, 0)} × ${bb(ctx.pot)}`,
      result: bb(best.ev),
      note: "Nothing risked; you realize your share of the current pot.",
    });
  } else if (best.kind === "call") {
    lines.push({
      label: "EV of calling",
      formula: "EV = equity × (pot + call) − call",
      plug: `${pct(ctx.equity, 0)} × ${bb(ctx.pot + best.amount)} − ${bb(best.amount)}`,
      result: bb(best.ev),
    });
  } else {
    lines.push({
      label: "EV of folding",
      formula: "EV = 0 — you give up the pot",
      result: bb(0),
    });
  }

  const evRows: EVRow[] = evResult.actions
    .map((a, i) => ({ label: a.label, ev: a.ev, best: i === evResult.bestIndex }))
    .sort((x, y) => y.ev - x.ev);

  const shortcuts: ExplainLine[] = [
    { label: "Rule of 2 & 4", formula: "flop: outs×4 · turn: outs×2", note: "Drawing-hand equity, fast." },
    { label: "Pot odds", formula: "call ÷ (pot + call)", note: "Min equity to call." },
    { label: "MDF", formula: "pot ÷ (pot + bet)", note: "Defend ≥ this or bluffs auto-profit." },
    { label: "Alpha", formula: "bet ÷ (pot + bet)", note: "Fold% a bluff needs (= 1 − MDF)." },
    { label: "Break-even value", formula: "called% needed = risk ÷ (risk + reward)", note: "When a thin value bet pays." },
  ];

  return {
    headline: best.kind === "fold" ? "Why folding is best" : `Why ${best.label} is best`,
    summary: buildSummary(ctx, best),
    lines,
    evRows,
    shortcuts,
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
