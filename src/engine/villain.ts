// Villain policy. The villain plays consistently with the range we display:
//  - preflop it continues only with its charted defend range
//  - postflop (out of position) it bets a polarized range (value + some bluffs) and
//    otherwise checks; facing a bet it defends the top MDF by strength.
// Because narrowing uses the same strength ordering, the combo counts shown never lie.
import { Card } from "./cards";
import { Range, Combo, rangeCombos, classOfCombo } from "./combos";
import { comboStrength } from "./equity";
import { mdf } from "./theory";
import { BB_DEFEND } from "./ranges";

interface StrengthInfo {
  total: number;
  // strongest-first cumulative weights and their strengths
  s: number[];
  cum: number[];
}

function buildStrengthInfo(range: Range, board: Card[], dead: Iterable<Card>): StrengthInfo {
  const combos = rangeCombos(range, dead);
  const arr = combos.map((wc) => ({ s: comboStrength(wc.cards, board), w: wc.weight }));
  arr.sort((a, b) => b.s - a.s);
  let acc = 0;
  const s: number[] = [];
  const cum: number[] = [];
  for (const x of arr) {
    acc += x.w;
    s.push(x.s);
    cum.push(acc);
  }
  return { total: acc, s, cum };
}

// Strength threshold for the top-q fraction (q in 0..1). Combos with strength >= this are
// within the strongest q of the range.
function topQThreshold(info: StrengthInfo, q: number): number {
  if (info.s.length === 0) return 0;
  const target = info.total * Math.max(0, Math.min(1, q));
  for (let i = 0; i < info.cum.length; i++) if (info.cum[i] >= target) return info.s[i];
  return info.s[info.s.length - 1];
}

// Fraction of the range strictly stronger than strength x (0 = x is the nuts of this range).
function fractionStronger(info: StrengthInfo, x: number): number {
  if (info.total === 0) return 0.5;
  let w = 0;
  for (let i = 0; i < info.s.length; i++) {
    if (info.s[i] > x) w = info.cum[i];
    else break;
  }
  return w / info.total;
}

export const VALUE_Q = 0.28; // top of range bets for value
export const BLUFF_Q = 0.16; // bottom of range that may bluff
export const BLUFF_FREQ = 0.5;
export const VILLAIN_BET_FRAC = 0.66; // 2/3 pot

export function villainPreflopContinue(combo: Combo): boolean {
  return (BB_DEFEND[classOfCombo(combo)] ?? 0) > 0;
}

export type VillainAction =
  | { kind: "check" }
  | { kind: "bet"; amount: number };

// Villain is first to act (out of position). Polarized betting.
export function villainFirstAction(
  combo: Combo,
  range: Range,
  board: Card[],
  pot: number,
  stack: number,
  rng: () => number = Math.random
): VillainAction {
  const dead: Card[] = [combo[0], combo[1], ...board];
  const info = buildStrengthInfo(range, board, dead);
  const myS = comboStrength(combo, board);
  const p = fractionStronger(info, myS); // 0 = strongest

  const betAmt = Math.min(stack, Math.round(pot * VILLAIN_BET_FRAC * 2) / 2);
  if (betAmt <= 0) return { kind: "check" };

  if (p <= VALUE_Q) return { kind: "bet", amount: betAmt }; // value
  if (p >= 1 - BLUFF_Q && rng() < BLUFF_FREQ) return { kind: "bet", amount: betAmt }; // bluff
  return { kind: "check" };
}

// Villain facing a hero bet: defend the strongest MDF by strength.
export function villainFacingBet(
  combo: Combo,
  range: Range,
  board: Card[],
  betSize: number,
  pot: number
): "call" | "fold" {
  const dead: Card[] = [combo[0], combo[1], ...board];
  const info = buildStrengthInfo(range, board, dead);
  const myS = comboStrength(combo, board);
  const p = fractionStronger(info, myS);
  const defend = mdf(betSize, pot);
  return p <= defend ? "call" : "fold";
}

// The polarized range the villain represents when it bets (for display + narrowing).
export function villainBetRange(range: Range, board: Card[]): Range {
  const info = buildStrengthInfo(range, board, []);
  const valueThr = topQThreshold(info, VALUE_Q);
  const bluffThr = topQThreshold(info, 1 - BLUFF_Q); // strength at the (1-bluffQ) cutoff
  const out: Range = {};
  const byClass: Record<string, { w: number; n: number }> = {};
  for (const wc of rangeCombos(range, [])) {
    const s = comboStrength(wc.cards, board);
    let inc = 0;
    if (s >= valueThr) inc = 1; // value
    else if (s <= bluffThr) inc = BLUFF_FREQ; // bluff portion
    const e = byClass[wc.cls] || (byClass[wc.cls] = { w: 0, n: 0 });
    e.w += inc * wc.weight;
    e.n += 1;
  }
  for (const cls in byClass) {
    const { w, n } = byClass[cls];
    if (w > 0) out[cls] = w / n;
  }
  return out;
}
