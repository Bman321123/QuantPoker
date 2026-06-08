// 1-ply heuristic EV for each legal action. Honest and transparent:
//  - call/check are scored against the hero's exact equity vs villain's current range
//  - bet/raise use a fold-equity + MDF-continue model (villain folds alpha, continues the
//    top MDF by strength), then realizes equity at showdown vs that continuing range.
// This is a directional coach, not a solver — and is labeled as such in the UI.
import { Card } from "./cards";
import { Range, Combo } from "./combos";
import { equityVsRange } from "./equity";
import { topFractionRange } from "./narrow";
import { alpha } from "./theory";

export type ActionKind = "fold" | "check" | "call" | "bet" | "raise";

export interface Candidate {
  kind: ActionKind;
  amount: number; // chips hero commits with this action (bet/raise size, or call amount)
  label: string;
}

export interface ActionEV extends Candidate {
  ev: number;
  villainFold?: number; // modeled fold frequency for aggressive actions
}

export interface EVResult {
  equity: number; // hero equity vs villain's full current range
  actions: ActionEV[];
  bestIndex: number;
}

export interface EvalParams {
  hero: Combo;
  villainRange: Range;
  board: Card[];
  pot: number; // pot before hero acts (includes villain's contributions)
  toCall: number; // chips hero must call (0 if hero may check/bet)
  candidates: Candidate[];
  iters?: number;
}

export function evaluateActions(p: EvalParams): EVResult {
  const { hero, villainRange, board, pot, toCall } = p;
  const iters = p.iters ?? 2000;
  const dead: Card[] = [hero[0], hero[1], ...board];

  const equity = equityVsRange(hero, villainRange, board, iters);

  const actions: ActionEV[] = p.candidates.map((c) => {
    switch (c.kind) {
      case "fold":
        return { ...c, ev: 0 };

      case "check":
        // 1-ply: see a free showdown vs the full range.
        return { ...c, ev: equity * pot };

      case "call": {
        const ev = equity * (pot + c.amount) - c.amount;
        return { ...c, ev };
      }

      case "bet":
      case "raise": {
        const s = c.amount;
        // villain faces a bet of size s into the current pot
        const f = alpha(s, pot); // fold frequency (= 1 - MDF)
        const continueRange = topFractionRange(villainRange, board, dead, 1 - f);
        const eC = equityVsRange(hero, continueRange, board, iters);
        // net EV: fold branch wins the pot; call branch realizes equity in pot+2s for s risked
        const ev = f * pot + (1 - f) * (eC * (pot + 2 * s) - s);
        return { ...c, ev, villainFold: f };
      }
    }
  });

  let bestIndex = 0;
  for (let i = 1; i < actions.length; i++) if (actions[i].ev > actions[bestIndex].ev) bestIndex = i;

  return { equity, actions, bestIndex };
}

export function evLoss(result: EVResult, chosenIndex: number): number {
  return Math.max(0, result.actions[result.bestIndex].ev - result.actions[chosenIndex].ev);
}

// Build the canonical discrete bet/raise candidates from pot geometry & stack.
export function betCandidates(pot: number, stack: number, facingBet: boolean): Candidate[] {
  const kind: ActionKind = facingBet ? "raise" : "bet";
  const fracs: [number, string][] = [
    [1 / 3, "⅓ pot"],
    [1 / 2, "½ pot"],
    [2 / 3, "⅔ pot"],
    [1, "Pot"],
  ];
  const out: Candidate[] = [];
  const seen = new Set<number>();
  for (const [fr, name] of fracs) {
    const amt = Math.min(stack, round1(pot * fr));
    if (amt <= 0 || amt >= stack) continue;
    if (seen.has(amt)) continue;
    seen.add(amt);
    out.push({ kind, amount: amt, label: name });
  }
  if (stack > 0) out.push({ kind, amount: round1(stack), label: "All-in" });
  return out;
}

function round1(x: number): number {
  return Math.round(x * 2) / 2; // nearest 0.5bb
}
