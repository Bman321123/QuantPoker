// Equity of the hero hand vs a villain range/combo-set on a given board.
// Exact enumeration on the river; Monte Carlo otherwise.
import { Card, deckWithout } from "./cards";
import { evalCards } from "./evaluator";
import { Range, WeightedCombo, rangeCombos, Combo, comboType, HandClass, parseClass } from "./combos";

function lowerBound(cum: number[], x: number): number {
  let lo = 0,
    hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Draw `n` distinct cards from a pool via partial Fisher-Yates (does not mutate pool order
// permanently — works on a shared scratch array reset each call).
function drawInto(pool: Card[], n: number, rng: () => number, out: Card[]): void {
  const len = pool.length;
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (len - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
    out[i] = pool[i];
  }
}

export function equityVsCombos(
  hero: Combo,
  combos: WeightedCombo[],
  board: Card[],
  iters = 2500,
  rng: () => number = Math.random
): number {
  if (combos.length === 0) return 0.5;

  let tot = 0;
  const cum: number[] = [];
  for (const wc of combos) {
    tot += wc.weight;
    cum.push(tot);
  }

  const need = 5 - board.length;

  // River: exact.
  if (need === 0) {
    const hScore = evalCards([hero[0], hero[1], ...board]);
    let wsum = 0,
      tsum = 0,
      tw = 0;
    for (const wc of combos) {
      const vScore = evalCards([wc.cards[0], wc.cards[1], ...board]);
      if (hScore > vScore) wsum += wc.weight;
      else if (hScore === vScore) tsum += wc.weight;
      tw += wc.weight;
    }
    return tw > 0 ? (wsum + tsum / 2) / tw : 0.5;
  }

  // Pre-river: Monte Carlo.
  const heroDead = new Set<Card>([hero[0], hero[1], ...board]);
  const runoutScratch: Card[] = new Array(need);
  let win = 0,
    tie = 0,
    n = 0;

  for (let it = 0; it < iters; it++) {
    const x = rng() * tot;
    const vc = combos[lowerBound(cum, x)].cards;
    if (heroDead.has(vc[0]) || heroDead.has(vc[1])) continue;

    // pool = full deck minus hero, board, villain combo
    const pool = deckWithout([hero[0], hero[1], ...board, vc[0], vc[1]]);
    drawInto(pool, need, rng, runoutScratch);

    const full = [...board, ...runoutScratch];
    const hScore = evalCards([hero[0], hero[1], ...full]);
    const vScore = evalCards([vc[0], vc[1], ...full]);
    if (hScore > vScore) win++;
    else if (hScore === vScore) tie++;
    n++;
  }
  return n > 0 ? (win + tie / 2) / n : 0.5;
}

export function equityVsRange(
  hero: Combo,
  range: Range,
  board: Card[],
  iters = 2500,
  rng: () => number = Math.random
): number {
  const combos = rangeCombos(range, [hero[0], hero[1], ...board]);
  return equityVsCombos(hero, combos, board, iters, rng);
}

// Current made-hand strength of a villain combo on a board (for ranking / narrowing).
// Pre-flop uses a heuristic; once there's a board we use the real evaluator.
export function comboStrength(combo: Combo, board: Card[]): number {
  if (board.length >= 3) return evalCards([combo[0], combo[1], ...board]);
  return classStrengthHeuristic(comboClass(combo));
}

function comboClass(c: Combo): HandClass {
  // reconstruct the class label from two concrete cards
  const r1 = (c[0] >> 2) + 2;
  const r2 = (c[1] >> 2) + 2;
  const s1 = c[0] & 3;
  const s2 = c[1] & 3;
  const RC = "23456789TJQKA";
  if (r1 === r2) return RC[r1 - 2] + RC[r1 - 2];
  const hi = Math.max(r1, r2),
    lo = Math.min(r1, r2);
  return RC[hi - 2] + RC[lo - 2] + (s1 === s2 ? "s" : "o");
}

// Rough preflop strength ordering of the 169 classes (good enough for villain logic).
export function classStrengthHeuristic(cls: HandClass): number {
  const { hi, lo, type } = parseClass(cls);
  if (type === "pair") return 1000 + hi * 20; // pairs dominate
  const suitedBonus = type === "suited" ? 18 : 0;
  const gap = hi - lo;
  const connectBonus = Math.max(0, 8 - gap) * 3;
  const broadway = (hi >= 12 ? 12 : 0) + (lo >= 10 ? 6 : 0);
  return hi * 14 + lo * 6 + suitedBonus + connectBonus + broadway;
}
