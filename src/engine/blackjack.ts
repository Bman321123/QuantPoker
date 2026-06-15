// Blackjack + card-counting engine. Pure logic only (no React).
//
// Rules: 6-deck shoe, dealer STANDS on soft 17 (S17), double on any first two cards,
// double-after-split allowed (DAS), split up to 4 hands, split aces get one card each and
// no re-split, blackjack pays 3:2, no surrender. These are the rules the bundled
// basic-strategy chart below is correct for.
//
// Counting: Hi-Lo (2–6 = +1, 7–9 = 0, 10–A = −1). Running count is tracked over every card
// that comes out of the shoe; true count = running count ÷ decks remaining.
import { Card, rankOf, shuffle } from "./cards";

export const DECKS = 6;
export const PENETRATION = 0.75; // reshuffle once ~75% of the shoe has been dealt

// Blackjack value of a card (Ace = 11 here; reduced to 1 by handTotal when needed).
export function cardValue(card: Card): number {
  const r = rankOf(card); // 2..14 (14 = Ace)
  if (r === 14) return 11;
  if (r >= 11) return 10; // J, Q, K
  return r; // 2..10
}

// Hi-Lo running-count contribution of a card.
export function hiLo(card: Card): number {
  const r = rankOf(card);
  if (r >= 2 && r <= 6) return 1;
  if (r >= 7 && r <= 9) return 0;
  return -1; // 10, J, Q, K, A
}

export interface HandValue {
  total: number;
  soft: boolean; // an ace is still counted as 11
}

export function handTotal(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    total += v;
    if (v === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBust(cards: Card[]): boolean {
  return handTotal(cards).total > 21;
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

export function isPair(cards: Card[]): boolean {
  return cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
}

// ---- Shoe -----------------------------------------------------------------------------
export interface Shoe {
  cards: Card[];
  idx: number;
  running: number; // Hi-Lo running count over dealt cards
  decks: number;
}

export function newShoe(decks = DECKS, rng: () => number = Math.random): Shoe {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) cards.push(c);
  return { cards: shuffle(cards, rng), idx: 0, running: 0, decks };
}

// Cards (counting one deck = 52) left before the shuffle marker.
export function cardsRemaining(shoe: Shoe): number {
  return shoe.cards.length - shoe.idx;
}

export function decksRemaining(shoe: Shoe): number {
  return Math.max(0.25, cardsRemaining(shoe) / 52);
}

export function needsShuffle(shoe: Shoe): boolean {
  return shoe.idx >= shoe.cards.length * PENETRATION;
}

// Draw a card, advancing the shoe and updating the running count.
export function draw(shoe: Shoe): Card {
  const card = shoe.cards[shoe.idx];
  shoe.idx++;
  shoe.running += hiLo(card);
  return card;
}

export function trueCount(shoe: Shoe): number {
  return shoe.running / decksRemaining(shoe);
}

// ---- Basic strategy (6-deck, S17, DAS, no surrender) ----------------------------------
export type Move = "H" | "S" | "D" | "P"; // hit, stand, double, split

// Dealer upcard value for the chart: Ace = 11, faces = 10.
function upValue(card: Card): number {
  return cardValue(card);
}

function shouldSplit(pairValue: number, up: number): boolean {
  switch (pairValue) {
    case 11: // A,A
    case 8: // 8,8
      return true;
    case 9: // split vs 2-6, 8-9 (not 7, 10, A)
      return up <= 6 || up === 8 || up === 9;
    case 7: // split vs 2-7
      return up <= 7;
    case 6: // split vs 2-6 (DAS)
      return up <= 6;
    case 4: // split vs 5-6 (DAS)
      return up === 5 || up === 6;
    case 3: // split vs 2-7
      return up <= 7;
    case 2: // split vs 2-7
      return up <= 7;
    default: // 5,5 and 10,10 are never split
      return false;
  }
}

// Hard totals. "Dh" = double else hit.
function hardMove(total: number, up: number, canDouble: boolean): Move {
  const dh = (): Move => (canDouble ? "D" : "H");
  if (total >= 17) return "S";
  if (total >= 13) return up <= 6 ? "S" : "H"; // 13-16
  if (total === 12) return up >= 4 && up <= 6 ? "S" : "H";
  if (total === 11) return dh(); // S17: double vs everything
  if (total === 10) return up <= 9 ? dh() : "H";
  if (total === 9) return up >= 3 && up <= 6 ? dh() : "H";
  return "H"; // 5-8
}

// Soft totals. "Ds" = double else stand.
function softMove(total: number, up: number, canDouble: boolean): Move {
  const dh = (): Move => (canDouble ? "D" : "H");
  const ds = (): Move => (canDouble ? "D" : "S");
  switch (total) {
    case 20: // A,9
    case 19: // A,8
      return "S";
    case 18: // A,7
      if (up <= 6) return ds();
      if (up === 7 || up === 8) return "S";
      return "H";
    case 17: // A,6
      return up >= 3 && up <= 6 ? dh() : "H";
    case 16: // A,5
    case 15: // A,4
      return up >= 4 && up <= 6 ? dh() : "H";
    case 14: // A,3
    case 13: // A,2
      return up >= 5 && up <= 6 ? dh() : "H";
    default:
      return "S"; // soft 21
  }
}

// The single correct basic-strategy move for a spot.
export function basicStrategy(
  player: Card[],
  dealerUp: Card,
  opts: { canDouble: boolean; canSplit: boolean }
): Move {
  const up = upValue(dealerUp);
  if (opts.canSplit && isPair(player) && shouldSplit(cardValue(player[0]), up)) return "P";
  const { total, soft } = handTotal(player);
  return soft ? softMove(total, up, opts.canDouble) : hardMove(total, up, opts.canDouble);
}

export const MOVE_LABEL: Record<Move, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
};

// Dealer draws to 17+, standing on soft 17 (S17).
export function dealerShouldHit(cards: Card[]): boolean {
  const { total } = handTotal(cards);
  return total < 17; // stands on all 17, soft or hard
}

// ---- Settlement -----------------------------------------------------------------------
export type Outcome = "win" | "lose" | "push" | "blackjack";

// Net chips returned for one player hand vs the dealer (excludes the original stake unless
// you add it back; here we return the NET profit: +bet on win, -bet on loss, 0 push).
export function settleHand(
  player: Card[],
  dealer: Card[],
  bet: number,
  playerHasBlackjack: boolean,
  dealerHasBlackjack: boolean
): { outcome: Outcome; net: number } {
  if (playerHasBlackjack && dealerHasBlackjack) return { outcome: "push", net: 0 };
  if (playerHasBlackjack) return { outcome: "blackjack", net: bet * 1.5 };
  if (dealerHasBlackjack) return { outcome: "lose", net: -bet };

  const p = handTotal(player).total;
  if (p > 21) return { outcome: "lose", net: -bet };
  const d = handTotal(dealer).total;
  if (d > 21) return { outcome: "win", net: bet };
  if (p > d) return { outcome: "win", net: bet };
  if (p < d) return { outcome: "lose", net: -bet };
  return { outcome: "push", net: 0 };
}

// ---- Bet ramp (teach bet-by-count) ----------------------------------------------------
// A simple, teachable spread: flat-bet 1 unit at or below true count +1, then ramp up.
export function recommendedUnits(tc: number): number {
  const t = Math.floor(tc);
  if (t <= 1) return 1;
  return Math.min(12, (t - 1) * 2); // TC2→2, TC3→4, TC4→6, TC5→8, …capped at 12
}
