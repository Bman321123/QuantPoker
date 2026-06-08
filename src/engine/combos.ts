// Combinatorics over the 169 starting-hand classes.
// Powers the range grid and the quiz (suited/pair/offsuit combo counts, blockers).
import { Card, makeCard, rankOf, suitOf, RANK_CHARS } from "./cards";

export type ComboType = "pair" | "suited" | "offsuit";
export type HandClass = string; // "AA", "AKs", "AKo"
export type Combo = [Card, Card];

// A weighted range: class -> weight in [0,1].
export type Range = Record<HandClass, number>;

export function rankChar(r: number): string {
  return RANK_CHARS[r - 2];
}
export function charRank(ch: string): number {
  return RANK_CHARS.indexOf(ch.toUpperCase()) + 2;
}

// Canonical class label for two ranks + a suited flag.
export function classLabel(hi: number, lo: number, suited: boolean): HandClass {
  if (hi === lo) return rankChar(hi) + rankChar(hi);
  const h = Math.max(hi, lo);
  const l = Math.min(hi, lo);
  return rankChar(h) + rankChar(l) + (suited ? "s" : "o");
}

export function parseClass(cls: HandClass): { hi: number; lo: number; type: ComboType } {
  const a = charRank(cls[0]);
  const b = charRank(cls[1]);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const type: ComboType = cls.length === 2 ? "pair" : cls[2] === "s" ? "suited" : "offsuit";
  return { hi, lo, type };
}

export function comboType(cls: HandClass): ComboType {
  return parseClass(cls).type;
}

// Recover the canonical class label from two concrete cards.
export function classOfCombo(c: Combo): HandClass {
  const r1 = rankOf(c[0]);
  const r2 = rankOf(c[1]);
  if (r1 === r2) return rankChar(r1) + rankChar(r1);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const suited = suitOf(c[0]) === suitOf(c[1]);
  return rankChar(hi) + rankChar(lo) + (suited ? "s" : "o");
}

// All 169 classes, ordered by the standard grid (A..2 rows, A..2 cols).
export const ALL_CLASSES: HandClass[] = (() => {
  const out: HandClass[] = [];
  const order = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const i of order) {
    for (const j of order) {
      if (i === j) out.push(rankChar(i) + rankChar(i));
      else if (i > j) out.push(rankChar(i) + rankChar(j) + "s"); // upper-right suited
      else out.push(rankChar(j) + rankChar(i) + "o"); // lower-left offsuit
    }
  }
  return out;
})();

// Grid position (row,col) 0..12 for a class. row/col indexed A=0 .. 2=12.
export function gridPos(cls: HandClass): { row: number; col: number } {
  const { hi, lo, type } = parseClass(cls);
  const idx = (r: number) => 14 - r;
  if (type === "pair") return { row: idx(hi), col: idx(hi) };
  if (type === "suited") return { row: idx(hi), col: idx(lo) };
  return { row: idx(lo), col: idx(hi) };
}

// All concrete 2-card combos for a class (ignoring blockers).
export function classCombos(cls: HandClass): Combo[] {
  const { hi, lo, type } = parseClass(cls);
  const out: Combo[] = [];
  if (type === "pair") {
    for (let s1 = 0; s1 < 4; s1++)
      for (let s2 = s1 + 1; s2 < 4; s2++) out.push([makeCard(hi, s1), makeCard(hi, s2)]);
  } else if (type === "suited") {
    for (let s = 0; s < 4; s++) out.push([makeCard(hi, s), makeCard(lo, s)]);
  } else {
    for (let s1 = 0; s1 < 4; s1++)
      for (let s2 = 0; s2 < 4; s2++)
        if (s1 !== s2) out.push([makeCard(hi, s1), makeCard(lo, s2)]);
  }
  return out;
}

// Max combos per class type, before blockers.
export function maxCombos(type: ComboType): number {
  return type === "pair" ? 6 : type === "suited" ? 4 : 12;
}

// Concrete combos of a class that don't collide with dead cards.
export function liveClassCombos(cls: HandClass, dead: Set<Card>): Combo[] {
  return classCombos(cls).filter((c) => !dead.has(c[0]) && !dead.has(c[1]));
}

export interface WeightedCombo {
  cards: Combo;
  cls: HandClass;
  type: ComboType;
  weight: number;
}

// Expand a range to its live weighted combos given dead cards (board + hero).
export function rangeCombos(range: Range, dead: Iterable<Card>): WeightedCombo[] {
  const deadSet = dead instanceof Set ? dead : new Set(dead);
  const out: WeightedCombo[] = [];
  for (const cls in range) {
    const w = range[cls];
    if (w <= 0) continue;
    const type = comboType(cls);
    for (const cards of liveClassCombos(cls, deadSet)) out.push({ cards, cls, type, weight: w });
  }
  return out;
}

export interface ComboCounts {
  total: number;
  pairs: number;
  suited: number;
  offsuit: number;
  byType: Record<ComboType, number>;
}

// Count live combos in a range by type (each concrete combo counted once; weights ignored
// for "how many combos" — that's the standard combinatorial question players are quizzed on).
export function countCombos(range: Range, dead: Iterable<Card>): ComboCounts {
  const deadSet = dead instanceof Set ? dead : new Set(dead);
  let pairs = 0,
    suited = 0,
    offsuit = 0;
  for (const cls in range) {
    if (range[cls] <= 0) continue;
    const type = comboType(cls);
    const n = liveClassCombos(cls, deadSet).length;
    if (type === "pair") pairs += n;
    else if (type === "suited") suited += n;
    else offsuit += n;
  }
  return {
    total: pairs + suited + offsuit,
    pairs,
    suited,
    offsuit,
    byType: { pair: pairs, suited, offsuit },
  };
}

// Count combos within the range that contain a specific rank (e.g. "combos with an Ace").
export function countCombosWithRank(range: Range, rank: number, dead: Iterable<Card>): number {
  const deadSet = dead instanceof Set ? dead : new Set(dead);
  let n = 0;
  for (const cls in range) {
    if (range[cls] <= 0) continue;
    for (const c of liveClassCombos(cls, deadSet))
      if (rankOf(c[0]) === rank || rankOf(c[1]) === rank) n++;
  }
  return n;
}

// Helpers for blocker reasoning in quizzes.
export { rankOf, suitOf };
