// Fast, exact 7-card hand evaluator.
// Returns a single comparable integer: higher = stronger.
// Encoding: category in the high digit, then up to 5 rank tiebreakers (base-16).
import { Card, rankOf, suitOf } from "./cards";

export const CATEGORY_NAMES = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

function encode(cat: number, tiebreaks: number[]): number {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 16 + (tiebreaks[i] || 0);
  return s;
}

// Highest card of the best straight contained in a rank bitmask (bits at rank index).
// Adds an ace-low bit so A-2-3-4-5 (wheel) is detected.
function straightHigh(rankMask: number): number {
  let m = rankMask;
  if (m & (1 << 14)) m |= 1 << 1; // ace plays low
  for (let hi = 14; hi >= 5; hi--) {
    const need =
      (1 << hi) | (1 << (hi - 1)) | (1 << (hi - 2)) | (1 << (hi - 3)) | (1 << (hi - 4));
    if ((m & need) === need) return hi;
  }
  return 0;
}

// Evaluate 5..7 cards. Returns comparable strength score.
export function evalCards(cards: Card[]): number {
  const rankCount = new Array(15).fill(0);
  const suitCount = [0, 0, 0, 0];
  const suitRankMask = [0, 0, 0, 0];
  let rankMask = 0;

  for (const c of cards) {
    const r = rankOf(c);
    const s = suitOf(c);
    rankCount[r]++;
    suitCount[s]++;
    suitRankMask[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  // Straight flush
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sfHigh = straightHigh(suitRankMask[flushSuit]);
    if (sfHigh) return encode(8, [sfHigh]);
  }

  let quad = 0;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (rankCount[r] === 4) quad = r;
    else if (rankCount[r] === 3) trips.push(r);
    else if (rankCount[r] === 2) pairs.push(r);
  }

  // Four of a kind
  if (quad) {
    let k = 0;
    for (let r = 14; r >= 2; r--)
      if (r !== quad && rankCount[r] > 0) {
        k = r;
        break;
      }
    return encode(7, [quad, k]);
  }

  // Full house (best trip + best remaining pair; a second trip counts as a pair)
  if (trips.length > 0) {
    const t = trips[0];
    let p = trips.length > 1 ? trips[1] : 0;
    if (pairs.length > 0) p = Math.max(p, pairs[0]);
    if (p) return encode(6, [t, p]);
  }

  // Flush
  if (flushSuit >= 0) {
    const ranks: number[] = [];
    for (let r = 14; r >= 2 && ranks.length < 5; r--)
      if (suitRankMask[flushSuit] & (1 << r)) ranks.push(r);
    return encode(5, ranks);
  }

  // Straight
  const sh = straightHigh(rankMask);
  if (sh) return encode(4, [sh]);

  // Three of a kind
  if (trips.length > 0) {
    const t = trips[0];
    const ks: number[] = [];
    for (let r = 14; r >= 2 && ks.length < 2; r--)
      if (r !== t && rankCount[r] > 0) ks.push(r);
    return encode(3, [t, ...ks]);
  }

  // Two pair
  if (pairs.length >= 2) {
    const p1 = pairs[0];
    const p2 = pairs[1];
    let k = 0;
    for (let r = 14; r >= 2; r--)
      if (r !== p1 && r !== p2 && rankCount[r] > 0) {
        k = r;
        break;
      }
    return encode(2, [p1, p2, k]);
  }

  // One pair
  if (pairs.length === 1) {
    const p = pairs[0];
    const ks: number[] = [];
    for (let r = 14; r >= 2 && ks.length < 3; r--)
      if (r !== p && rankCount[r] > 0) ks.push(r);
    return encode(1, [p, ...ks]);
  }

  // High card
  const hk: number[] = [];
  for (let r = 14; r >= 2 && hk.length < 5; r--) if (rankCount[r] > 0) hk.push(r);
  return encode(0, hk);
}

export function categoryOf(score: number): number {
  return Math.floor(score / 16 ** 5);
}

const RANK_NAMES_SINGULAR = [
  "", "", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Jack", "Queen", "King", "Ace",
];
const RANK_NAMES_PLURAL = [
  "", "", "Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines",
  "Tens", "Jacks", "Queens", "Kings", "Aces",
];

// Human-readable label for the best 5-card hand made from the given cards.
export function describeHand(cards: Card[]): { cat: number; label: string } {
  const score = evalCards(cards);
  const tb: number[] = [];
  let x = score;
  for (let i = 0; i < 5; i++) {
    tb.unshift(x % 16);
    x = Math.floor(x / 16);
  }
  // tb[0] is the most-significant tiebreak (the defining rank of the hand).
  const cat = x;
  switch (cat) {
    case 8:
      return { cat, label: tb[0] === 14 ? "Royal flush" : `${RANK_NAMES_SINGULAR[tb[0]]}-high straight flush` };
    case 7:
      return { cat, label: `Quad ${RANK_NAMES_PLURAL[tb[0]]}` };
    case 6:
      return { cat, label: `Full house, ${RANK_NAMES_PLURAL[tb[0]]} full of ${RANK_NAMES_PLURAL[tb[1]]}` };
    case 5:
      return { cat, label: `${RANK_NAMES_SINGULAR[tb[0]]}-high flush` };
    case 4:
      return { cat, label: `${RANK_NAMES_SINGULAR[tb[0]]}-high straight` };
    case 3:
      return { cat, label: `Trip ${RANK_NAMES_PLURAL[tb[0]]}` };
    case 2:
      return { cat, label: `Two pair, ${RANK_NAMES_PLURAL[tb[0]]} & ${RANK_NAMES_PLURAL[tb[1]]}` };
    case 1:
      return { cat, label: `Pair of ${RANK_NAMES_PLURAL[tb[0]]}` };
    default:
      return { cat, label: `${RANK_NAMES_SINGULAR[tb[0]]}-high` };
  }
}
