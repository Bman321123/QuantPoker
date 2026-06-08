// Deterministic coach. Every line is generated from numbers the engine actually computed
// (equity, EV, pot odds, MDF, combo counts) — no API, always available, instant.
import { EVResult } from "./ev";
import { potOdds, mdf, alpha, pct, bb } from "./theory";
import { ComboCounts } from "./combos";

export type Level = "beginner" | "pro";
export type Street = "preflop" | "flop" | "turn" | "river";

export interface CoachContext {
  street: Street;
  equity: number;
  pot: number;
  toCall: number;
  combos: ComboCounts;
  heroInPosition: boolean;
  evResult: EVResult;
}

export type Tone = "perfect" | "great" | "good" | "ok" | "mistake" | "blunder";

export interface Verdict {
  tone: Tone;
  headline: string;
  detail: string[];
  evLoss: number;
}

export function toneFromEvLoss(loss: number): Tone {
  if (loss <= 0.001) return "perfect";
  if (loss < 0.12) return "great";
  if (loss < 0.35) return "good";
  if (loss < 0.9) return "ok";
  if (loss < 2.2) return "mistake";
  return "blunder";
}
const TONE_FROM_LOSS = toneFromEvLoss;

const TONE_WORD: Record<Tone, string> = {
  perfect: "Optimal",
  great: "Excellent",
  good: "Solid",
  ok: "Slight inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

export function verdict(ctx: CoachContext, chosenIndex: number, level: Level): Verdict {
  const { evResult } = ctx;
  const best = evResult.actions[evResult.bestIndex];
  const chosen = evResult.actions[chosenIndex];
  const loss = Math.max(0, best.ev - chosen.ev);
  const tone = TONE_FROM_LOSS(loss);

  const detail: string[] = [];
  if (tone === "perfect") {
    detail.push(`${cap(best.label)} is the highest-EV line at ${bb(best.ev)}.`);
  } else {
    detail.push(
      `Best was ${best.label} (${bb(best.ev)}); you chose ${chosen.label} (${bb(chosen.ev)}) — ${bb(
        loss
      )} left behind.`
    );
  }

  if (level === "pro") {
    detail.push(`Equity vs villain's range: ${pct(ctx.equity)}.`);
    if (ctx.toCall > 0) {
      detail.push(
        `Pot odds: calling ${bb(ctx.toCall)} into ${bb(ctx.pot)} needs ${pct(
          potOdds(ctx.toCall, ctx.pot)
        )} equity.`
      );
    }
    if (best.villainFold !== undefined) {
      detail.push(`That size folds out ~${pct(best.villainFold)} of villain's range (its alpha).`);
    }
  } else {
    // beginner: one intuitive line
    if (ctx.toCall > 0) {
      const need = potOdds(ctx.toCall, ctx.pot);
      detail.push(
        ctx.equity >= need
          ? `You had ${pct(ctx.equity)} equity and only needed ${pct(need)} — enough to continue.`
          : `You had ${pct(ctx.equity)} equity but needed ${pct(need)} to call profitably.`
      );
    } else {
      detail.push(`With ${pct(ctx.equity)} equity, the higher-EV line was ${best.label}.`);
    }
  }

  return { tone, headline: TONE_WORD[tone], detail, evLoss: loss };
}

// A short, proactive tip for the current street (shown before the hero acts).
export function streetTip(ctx: CoachContext, level: Level): string {
  const eq = pct(ctx.equity, 0);
  const posWord = ctx.heroInPosition ? "in position" : "out of position";
  switch (ctx.street) {
    case "preflop":
      return level === "pro"
        ? `On the button you realize equity well ${posWord}; open your range for value and steal.`
        : `You're on the button — you act last all hand, so you can play more hands profitably.`;
    case "flop":
      return level === "pro"
        ? `You have ~${eq} equity ${posWord}. Weigh range vs nut advantage before sizing.`
        : `You flopped ~${eq} equity. Betting can win it now or build a pot when you're ahead.`;
    case "turn":
      return level === "pro"
        ? `Turn barrels deny equity and charge draws; check back marginal showdown value.`
        : `The turn is expensive. Bet your strong hands and good draws; slow down with weak ones.`;
    case "river":
      return level === "pro"
        ? `No more equity to deny — bet only for value or as a planned bluff. MDF governs villain's calls.`
        : `Last card. Bet when you expect worse to call, or give up. No draws left to protect.`;
  }
}

// The single most relevant "read" line, used in the compact heads-up display.
export function quickRead(ctx: CoachContext): string {
  if (ctx.toCall > 0) {
    return `Need ${pct(potOdds(ctx.toCall, ctx.pot), 0)} to call · you have ${pct(ctx.equity, 0)}`;
  }
  return `Equity ${pct(ctx.equity, 0)} · villain ${ctx.combos.total} combos`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- Live mathematical explanation of the best line (the "why") ----

export interface MathStep {
  label: string;
  expr: string;
}
export interface LineMath {
  bestLabel: string;
  summary: string;
  steps: MathStep[];
  evTable: { label: string; ev: number; best: boolean }[];
  shortcuts: string[];
}

export function explainLine(ctx: CoachContext): LineMath {
  const ev = ctx.evResult;
  const best = ev.actions[ev.bestIndex];
  const P = ctx.pot;
  const E = ctx.equity;
  const steps: MathStep[] = [];

  steps.push({ label: "Equity", expr: `≈ ${pct(E)} vs ${ctx.combos.total} combos (Monte-Carlo)` });

  if (ctx.toCall > 0) {
    const need = potOdds(ctx.toCall, P);
    steps.push({
      label: "Pot odds",
      expr: `${bb(ctx.toCall, 1)} ÷ (${bb(P, 1)} + ${bb(ctx.toCall, 1)}) = ${pct(need)} needed`,
    });
    steps.push({
      label: "Compare",
      expr: E >= need ? `${pct(E)} ≥ ${pct(need)} → +EV to continue` : `${pct(E)} < ${pct(need)} → can't profitably call`,
    });
  }

  let summary: string;
  if (best.kind === "bet" || best.kind === "raise") {
    const s = best.amount;
    const a = alpha(s, P);
    const m = mdf(s, P);
    const sizePct = Math.round((s / P) * 100);
    steps.push({ label: "Size", expr: `${bb(s, 1)} into ${bb(P, 1)} ≈ ${sizePct}% pot` });
    steps.push({ label: "α (fold equity)", expr: `${bb(s, 1)} ÷ (${bb(P, 1)} + ${bb(s, 1)}) = ${pct(a)}` });
    steps.push({ label: "Villain MDF", expr: `${bb(P, 1)} ÷ (${bb(P, 1)} + ${bb(s, 1)}) = ${pct(m)} (so it folds ≈ ${pct(a)})` });
    steps.push({ label: "EV", expr: `α·pot + (1−α)·(eq·(pot+2·bet) − bet) = ${bb(best.ev)}` });
    summary = `${best.label} is the highest-EV size: big enough to fold out ≈ ${pct(a)} of villain's range, small enough to keep a price when called.`;
  } else if (best.kind === "call") {
    const need = potOdds(ctx.toCall, P);
    summary = `Call — your ${pct(E)} clears the ${pct(need)} the pot is laying you.`;
  } else if (best.kind === "check") {
    summary = `Check — no bet size has enough fold equity to beat just realizing your ${pct(E)} for free.`;
  } else {
    const need = potOdds(ctx.toCall, P);
    summary = `Fold — ${pct(E)} doesn't meet the ${pct(need)} price, so calling burns EV.`;
  }

  const evTable = ev.actions.map((a, i) => ({ label: a.label, ev: a.ev, best: i === ev.bestIndex }));

  const shortcuts = [
    "Equity (draws): Rule of 2 & 4 — outs × 4 on the flop, outs × 2 on the turn.",
    "Pot odds: call ÷ (pot + call) = the equity you need to call.",
    "Bluff break-even: α = bet ÷ (pot + bet) = how often villain must fold.",
    "MDF: pot ÷ (pot + bet) = least you defend so bluffs don't auto-profit.",
  ];

  return { bestLabel: best.label, summary, steps, evTable, shortcuts };
}

export { mdf };
