// Card primitives. A card is encoded as an integer 0..51 for fast evaluation.
//   id = (rank - 2) * 4 + suit
//   rank: 2..14  (11=J, 12=Q, 13=K, 14=A)
//   suit: 0=spades, 1=hearts, 2=diamonds, 3=clubs

export type Card = number; // 0..51

export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export const SUITS = [0, 1, 2, 3] as const;

export const RANK_CHARS = "23456789TJQKA";
export const SUIT_CHARS = "shdc"; // spades, hearts, diamonds, clubs
export const SUIT_SYMBOLS = ["♠", "♥", "♦", "♣"];
export const SUIT_COLORS = ["#E7ECF3", "#FF5C7A", "#3FC8FF", "#3BE37A"]; // vivid 4-color deck

export function rankOf(c: Card): number {
  return (c >> 2) + 2;
}
export function suitOf(c: Card): number {
  return c & 3;
}
export function makeCard(rank: number, suit: number): Card {
  return (rank - 2) * 4 + suit;
}

export function cardStr(c: Card): string {
  return RANK_CHARS[rankOf(c) - 2] + SUIT_CHARS[suitOf(c)];
}
export function parseCard(s: string): Card {
  const r = RANK_CHARS.indexOf(s[0].toUpperCase()) + 2;
  const su = SUIT_CHARS.indexOf(s[1].toLowerCase());
  return makeCard(r, su);
}

export function fullDeck(): Card[] {
  const d: Card[] = [];
  for (let i = 0; i < 52; i++) d.push(i);
  return d;
}

// Deterministic RNG (mulberry32) so hands/equity can be reproduced when needed.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A deck excluding a set of dead cards, optionally shuffled.
export function deckWithout(dead: Iterable<Card>, rng?: () => number): Card[] {
  const used = new Set(dead);
  const out: Card[] = [];
  for (let i = 0; i < 52; i++) if (!used.has(i)) out.push(i);
  return rng ? shuffle(out, rng) : out;
}
