// Data-driven ranges. Ranges are authored in standard poker notation, which is also
// the format the user can edit later to transcribe their own charts (e.g. from MPT).
//
// Supported notation (comma/space separated):
//   "JJ+"        pairs from JJ up to AA
//   "77"         single pair
//   "A2s+"       suited, fixed high card, kicker raised up to (high-1): A2s..AKs
//   "KTo+"       offsuit, same rule: KTo..KQo
//   "T9s"        single suited/offsuit class
// For gapped connector runs, list them explicitly (e.g. "54s,65s,76s").
import { Range, classLabel, charRank, ALL_CLASSES, comboType } from "./combos";

export function parseRange(notation: string): Range {
  const range: Range = {};
  const tokens = notation
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const tok of tokens) {
    const pair = tok.match(/^([2-9TJQKA])\1(\+)?$/i);
    if (pair) {
      const r = charRank(pair[1]);
      if (pair[2]) for (let x = r; x <= 14; x++) range[classLabel(x, x, false)] = 1;
      else range[classLabel(r, r, false)] = 1;
      continue;
    }
    const m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])(\+)?$/i);
    if (m) {
      let a = charRank(m[1]);
      let b = charRank(m[2]);
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      const suited = m[3].toLowerCase() === "s";
      if (m[4]) {
        for (let k = lo; k <= hi - 1; k++) range[classLabel(hi, k, suited)] = 1;
      } else {
        range[classLabel(hi, lo, suited)] = 1;
      }
      continue;
    }
    // ignore unrecognized tokens silently (forgiving editor input)
  }
  return range;
}

export function cloneRange(r: Range): Range {
  return { ...r };
}

export function rangePercent(r: Range): number {
  // weighted combos / 1326
  let combos = 0;
  for (const cls in r) {
    if (r[cls] <= 0) continue;
    const t = comboType(cls);
    combos += (t === "pair" ? 6 : t === "suited" ? 4 : 12) * r[cls];
  }
  return (combos / 1326) * 100;
}

export function classesOf(r: Range): string[] {
  return ALL_CLASSES.filter((c) => (r[c] ?? 0) > 0);
}

// ---- Default GTO-style ranges (single-raised pot, 100bb, BTN vs BB) ----
// These are reasonable modern defaults, not a copy of any proprietary chart, and are
// fully editable. The math the app teaches is exact for whatever range is loaded.

export const BTN_RFI = parseRange(
  "22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 86s+, 75s+, 64s+, 54s, 43s, " +
    "A2o+, K8o+, Q9o+, J9o+, T9o, 98o, 87o"
);

// BB's continuing (calling) range vs a BTN open — the villain's postflop starting range.
export const BB_DEFEND = parseRange(
  "22+, A2s+, K4s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, " +
    "A2o+, K9o+, Q9o+, JTo, T9o, 98o"
);

// BB's 3-bet range (used occasionally by the villain policy preflop).
export const BB_3BET = parseRange("QQ+, AKs, AKo, A5s, A4s, KQs");

// When the hero limps the button, the BB checks its option with a very wide range.
export const BB_VS_LIMP = parseRange(
  "22+, A2s+, K2s+, Q2s+, J4s+, T5s+, 95s+, 84s+, 74s+, 63s+, 53s+, 43s, " +
    "A2o+, K4o+, Q6o+, J7o+, T7o+, 96o+, 86o+, 75o+, 64o+, 54o"
);

export interface NamedRange {
  id: string;
  label: string;
  notation: string;
}

// Editable presets surfaced in the UI (the seed of the "transcribe your charts" feature).
export const DEFAULT_PRESETS: NamedRange[] = [
  { id: "btn_rfi", label: "BTN open (RFI)", notation: "22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 86s+, 75s+, 64s+, 54s, 43s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o, 87o" },
  { id: "bb_defend", label: "BB defend vs BTN", notation: "22+, A2s+, K4s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, A2o+, K9o+, Q9o+, JTo, T9o, 98o" },
  { id: "bb_3bet", label: "BB 3-bet vs BTN", notation: "QQ+, AKs, AKo, A5s, A4s, KQs" },
];
