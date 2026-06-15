// Villain policy. The villain approximates sound, "play-by-the-numbers" heads-up poker
// with a few human leanings, and can play EITHER seat (button or big blind):
//
//  Preflop
//   - As the button it opens a wide range, limps some, folds only the worst.
//   - As the big blind it defends by PRICE: the smaller the raise, the wider it continues,
//     and it mixes in a value+bluff 3-bet range. It 4-bets/stacks off a tight range.
//
//  Postflop
//   - First to act (out of position) or checked to (in position) it bets a polarized
//     range (value + some bluffs) and otherwise checks.
//   - Facing a bet it BLUFF-CATCHES correctly: it estimates its hand's equity against the
//     hero's *polarized betting range* (value + the right number of bluffs for the size) and
//     calls when that beats the price it's getting — so it will NOT fold a strong made hand
//     to a big bet that is mostly bluffs. It mixes in value-raises and the odd bluff-raise.
//
// The "human" lean: it calls down a touch lighter than indifference (slightly exploitable by
// a value-heavy strategy) and sizes in standard fractions. All knobs below are tunable.
import { Card } from "./cards";
import {
  Range,
  Combo,
  rangeCombos,
  classOfCombo,
  ALL_CLASSES,
  maxCombos,
  comboType,
  parseClass,
  HandClass,
  WeightedCombo,
} from "./combos";
import { comboStrength, classStrengthHeuristic, equityVsCombos } from "./equity";
import { mdf } from "./theory";
import { HU_SB_OPEN, HU_BB_3BET, HU_VS_3BET_CALL, HU_4BET } from "./ranges";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
function round1(x: number): number {
  return Math.round(x * 2) / 2; // nearest 0.5bb
}

// ---- Tunable knobs -------------------------------------------------------------------
export const VALUE_Q = 0.30; // top of a range that bets for value
export const BLUFF_Q = 0.18; // bottom of a range that may bluff
export const BLUFF_FREQ = 0.5; // how often eligible bluffs actually fire
export const VILLAIN_BET_FRAC = 0.66; // 2/3 pot default bet/lead size

const OPEN_TO = 2.5; // villain's button open size (to-amount, bb)
const LIMP_FREQ = 0.12; // chance the button limps instead of raising
const THREEBET_FREQ = 0.6; // how often a 3-bet-class hand actually 3-bets (else flats)
const ISO_FREQ = 0.5; // chance the BB raises a button limp
const FOURBET_FREQ = 0.45; // how often a 4-bet-class hand 4-bets (else flats the 3-bet)

const VALUE_RAISE_EQ = 0.8; // equity vs the betting range above which villain may raise for value
const VALUE_RAISE_FREQ = 0.4;
const BLUFF_RAISE_FREQ = 0.08; // occasional bluff-raise with a busted hand
const CALL_SLACK = 0.04; // calls slightly lighter than indifference (human lean)
const HERO_VALUE_Q = 0.32; // fraction of the hero's range modeled as value when it bets

// ---- Preflop hand-strength percentile (for price-based BB defense) -------------------
const PREFLOP = (() => {
  const arr = ALL_CLASSES.map((cls) => ({ cls, s: classStrengthHeuristic(cls), n: maxCombos(comboType(cls)) }));
  arr.sort((a, b) => b.s - a.s);
  let total = 0;
  for (const x of arr) total += x.n;
  const pctile: Record<string, number> = {};
  let acc = 0;
  for (const x of arr) {
    pctile[x.cls] = (acc + x.n / 2) / total; // 0 = strongest, 1 = weakest
    acc += x.n;
  }
  return { arr, total, pctile };
})();

// 0 (strongest) .. 1 (weakest) percentile of a concrete hand among all 1326 combos.
function preflopPercentile(combo: Combo): number {
  return PREFLOP.pctile[classOfCombo(combo)] ?? 1;
}

// The top `frac` of all starting hands by preflop strength, as a Range (weight 1).
export function topPreflopRange(frac: number): Range {
  const out: Range = {};
  const target = PREFLOP.total * clamp(frac, 0, 1);
  let acc = 0;
  for (const x of PREFLOP.arr) {
    if (acc >= target) break;
    out[x.cls] = 1;
    acc += x.n;
  }
  return out;
}

// BB price-based defend fraction vs an open to `openTo` (heads-up, BB has 1bb posted).
// Heads-up the BB closes the action and gets a great price, so real defends are very wide:
// ~88% vs a min-raise, ~78% vs 3x.
export function bbDefendFrac(openTo: number): number {
  const toCall = Math.max(0, openTo - 1);
  const price = toCall / (2 * openTo); // toCall / (pot + toCall), pot = openTo + 1
  return clamp(1.15 - 1.1 * price, 0.5, 0.95);
}

// Hands no human folds heads-up to a normal-sized raise: any pair, any ace, any king,
// and big suited queens. A guard on top of the price-based defense so the bot never
// makes an "obviously not a real game" fold like K5o preflop.
const MANDATORY_DEFEND_MAX_RAISE = 4; // bb
function mandatoryDefend(cls: HandClass): boolean {
  const { hi, type } = parseClass(cls);
  if (type === "pair") return true;
  if (hi >= 13) return true; // Ax, Kx
  return type === "suited" && hi >= 12; // Qxs
}

// The range the villain (or its displayed model) continues with when calling a raise of
// `openTo` from the blinds/a limp: the price-based top fraction, plus the mandatory defends.
export function bbCallRange(openTo: number): Range {
  const r = topPreflopRange(bbDefendFrac(openTo));
  if (openTo <= MANDATORY_DEFEND_MAX_RAISE) {
    for (const cls of ALL_CLASSES) if (mandatoryDefend(cls)) r[cls] = Math.max(r[cls] ?? 0, 1);
  }
  return r;
}

// ---- Villain action type -------------------------------------------------------------
export type VillainAction =
  | { kind: "fold" }
  | { kind: "check" }
  | { kind: "call" }
  | { kind: "bet"; to: number } // 'to' = total street commitment after betting
  | { kind: "raise"; to: number };

// ====================================================================================
// PREFLOP
// ====================================================================================

// Villain is the button, first in. Open wide, limp some, fold only the worst.
export function villainOpen(combo: Combo, rng: () => number = Math.random): VillainAction {
  const cls = classOfCombo(combo);
  if ((HU_SB_OPEN[cls] ?? 0) > 0) {
    if (rng() < LIMP_FREQ) return { kind: "call" }; // limp
    return { kind: "raise", to: OPEN_TO };
  }
  // bottom of the deck: mostly fold, sometimes limp to keep the BB honest
  return rng() < 0.4 ? { kind: "call" } : { kind: "fold" };
}

// Villain is the BB and the button limped: check the option or iso-raise a strong hand.
export function villainVsLimp(combo: Combo, rng: () => number = Math.random): VillainAction {
  const cls = classOfCombo(combo);
  if ((HU_BB_3BET[cls] ?? 0) > 0 && rng() < ISO_FREQ) return { kind: "raise", to: 4 };
  return { kind: "check" };
}

// Villain is the BB facing an open to `openTo`. Price-based defend + value/bluff 3-bet,
// with the mandatory-defend guard so it never folds Kx/Ax/pairs to a normal raise.
export function villainVsOpen(combo: Combo, openTo: number, rng: () => number = Math.random): VillainAction {
  const cls = classOfCombo(combo);
  if ((HU_BB_3BET[cls] ?? 0) > 0 && rng() < THREEBET_FREQ) {
    return { kind: "raise", to: round1(openTo * 3 + 1) }; // OOP 3-bet ~3.4x
  }
  if (openTo <= MANDATORY_DEFEND_MAX_RAISE && mandatoryDefend(cls)) return { kind: "call" };
  if (preflopPercentile(combo) <= bbDefendFrac(openTo)) return { kind: "call" };
  return { kind: "fold" };
}

// Villain (the original raiser) faces a 3-bet to `threebetTo`.
export function villainVs3bet(combo: Combo, threebetTo: number, rng: () => number = Math.random): VillainAction {
  const cls = classOfCombo(combo);
  if ((HU_4BET[cls] ?? 0) > 0 && rng() < FOURBET_FREQ) return { kind: "raise", to: round1(threebetTo * 2.3) };
  if ((HU_VS_3BET_CALL[cls] ?? 0) > 0) return { kind: "call" };
  return { kind: "fold" };
}

// Villain faces a 4-bet: stack off a tight range, else fold (bounds the preflop tree).
export function villainVs4bet(combo: Combo): VillainAction {
  const cls = classOfCombo(combo);
  return (HU_4BET[cls] ?? 0) > 0 ? { kind: "call" } : { kind: "fold" };
}

// ====================================================================================
// POSTFLOP
// ====================================================================================

interface StrengthInfo {
  total: number;
  s: number[]; // strongest-first strengths
  cum: number[]; // cumulative weights aligned with s
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

function topQThreshold(info: StrengthInfo, q: number): number {
  if (info.s.length === 0) return 0;
  const target = info.total * clamp(q, 0, 1);
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

// Villain has the option to bet (first to act OOP, or checked to IP): polarized bet or check.
export function villainBetOrCheck(
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

  const betTo = Math.min(stack, round1(pot * VILLAIN_BET_FRAC));
  if (betTo <= 0) return { kind: "check" };

  if (p <= VALUE_Q) return { kind: "bet", to: betTo }; // value
  if (p >= 1 - BLUFF_Q && rng() < BLUFF_FREQ) return { kind: "bet", to: betTo }; // bluff
  return { kind: "check" };
}

// Build the hero's modeled polarized betting range for a bet of `betFaced` into `pot`:
// the top HERO_VALUE_Q for value, plus enough bottom-of-range air that bluffs make up the
// game-theoretic fraction (= the price the villain is getting). This is what a thinking
// player bluff-catches against.
function heroBettingCombos(
  heroRange: Range,
  board: Card[],
  dead: Iterable<Card>,
  bluffFrac: number
): WeightedCombo[] {
  const combos = rangeCombos(heroRange, dead);
  if (combos.length === 0) return [];
  const scored = combos
    .map((wc) => ({ wc, s: comboStrength(wc.cards, board) }))
    .sort((a, b) => b.s - a.s);
  const totalW = scored.reduce((a, c) => a + c.wc.weight, 0);
  const valueW = totalW * HERO_VALUE_Q;
  const b = clamp(bluffFrac, 0, 0.6);
  const bluffW = valueW * (b / (1 - b));

  const out: WeightedCombo[] = [];
  let acc = 0;
  for (const x of scored) {
    if (acc >= valueW) break;
    out.push(x.wc);
    acc += x.wc.weight;
  }
  let bacc = 0;
  for (let i = scored.length - 1; i >= 0 && bacc < bluffW; i--) {
    out.push(scored[i].wc);
    bacc += scored[i].wc.weight;
  }
  return out;
}

export interface FacingBetResult {
  action: VillainAction;
  equity: number; // villain's equity vs the modeled betting range (for narrowing the call range)
  price: number; // the pot-odds price the villain is getting
}

// Villain faces a bet (to `betTo`, having already put `invested` in this street) into a pot of
// `potBefore` (the pot before this bet). Decides fold / call / raise by bluff-catching equity.
export function villainFacingBet(
  combo: Combo,
  heroRange: Range,
  board: Card[],
  betTo: number,
  invested: number,
  potBefore: number,
  stack: number,
  rng: () => number = Math.random
): FacingBetResult {
  const dead: Card[] = [combo[0], combo[1], ...board];
  const betFaced = Math.max(0, betTo - invested); // chips villain must call
  // price = call / (pot after villain calls); the pot already includes the hero's bet
  const price = betFaced / (potBefore + 2 * betFaced);
  const bettingCombos = heroBettingCombos(heroRange, board, dead, price);
  const equity = bettingCombos.length ? equityVsCombos(combo, bettingCombos, board, 1200) : 0.5;

  // Value-raise the top of the bluff-catch range.
  const canRaise = stack > betFaced + 0.5;
  if (canRaise && equity >= VALUE_RAISE_EQ && rng() < VALUE_RAISE_FREQ) {
    const raiseTo = Math.min(invested + stack, round1(betTo + (potBefore + 2 * betFaced) * 0.7));
    if (raiseTo > betTo) return { action: { kind: "raise", to: raiseTo }, equity, price };
  }
  // Call when equity clears the price (a touch light — the human lean).
  if (equity >= price - CALL_SLACK) return { action: { kind: "call" }, equity, price };
  // Occasional bluff-raise with hopeless hands.
  if (canRaise && equity < price - 0.18 && rng() < BLUFF_RAISE_FREQ) {
    const raiseTo = Math.min(invested + stack, round1(betTo + (potBefore + 2 * betFaced) * 0.8));
    if (raiseTo > betTo) return { action: { kind: "raise", to: raiseTo }, equity, price };
  }
  return { action: { kind: "fold" }, equity, price };
}

// The polarized range the villain represents when IT bets (for display + narrowing).
export function villainBetRange(range: Range, board: Card[]): Range {
  const info = buildStrengthInfo(range, board, []);
  const valueThr = topQThreshold(info, VALUE_Q);
  const bluffThr = topQThreshold(info, 1 - BLUFF_Q);
  const out: Range = {};
  const byClass: Record<string, { w: number; n: number }> = {};
  for (const wc of rangeCombos(range, [])) {
    const s = comboStrength(wc.cards, board);
    let inc = 0;
    if (s >= valueThr) inc = 1;
    else if (s <= bluffThr) inc = BLUFF_FREQ;
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

// Defend fraction used to narrow the villain's DISPLAYED range when it calls a bet of `bet`
// into `pot` — slightly wider than MDF to reflect its call-down tendency.
export function callDefendFrac(bet: number, pot: number): number {
  return clamp(mdf(bet, pot) + 0.06, 0, 1);
}
