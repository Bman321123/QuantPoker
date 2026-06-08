// Range narrowing by hand strength. When the villain continues vs a bet, it keeps the
// strongest MDF-fraction of its range and folds the rest. This keeps the displayed combo
// counts honest: the villain genuinely plays the range we show.
import { Card } from "./cards";
import { Range, rangeCombos, Combo } from "./combos";
import { comboStrength } from "./equity";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// Keep the top `fraction` of a range by current made-hand strength on `board`.
// Returns a new Range whose per-class weights reflect the fraction of that class's
// combos that survive (so the grid can show partially-continued classes).
export function topFractionRange(
  range: Range,
  board: Card[],
  dead: Iterable<Card>,
  fraction: number
): Range {
  const combos = rangeCombos(range, dead);
  if (combos.length === 0) return {};

  const scored = combos.map((wc) => ({ wc, s: comboStrength(wc.cards, board) }));
  scored.sort((a, b) => b.s - a.s);

  const totalW = scored.reduce((a, c) => a + c.wc.weight, 0);
  const keepW = totalW * clamp(fraction, 0, 1);

  let acc = 0;
  let thr = scored[scored.length - 1].s;
  for (const x of scored) {
    acc += x.wc.weight;
    if (acc >= keepW) {
      thr = x.s;
      break;
    }
  }

  const byClass: Record<string, { kept: number; total: number }> = {};
  for (const x of scored) {
    const e = byClass[x.wc.cls] || (byClass[x.wc.cls] = { kept: 0, total: 0 });
    e.total++;
    if (x.s >= thr) e.kept++;
  }

  const out: Range = {};
  for (const cls in byClass) {
    const { kept, total } = byClass[cls];
    const w = (kept / total) * (range[cls] ?? 1);
    if (w > 0) out[cls] = w;
  }
  return out;
}

// Bottom (1 - fraction): the folded portion. Useful for "what did villain give up".
export function bottomFractionRange(
  range: Range,
  board: Card[],
  dead: Iterable<Card>,
  foldFraction: number
): Range {
  return topFractionRange(range, board, dead, 1 - foldFraction);
}
