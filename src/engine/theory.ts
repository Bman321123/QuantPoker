// Exact quantitative-poker primitives. These are the formulas the quiz tests you on,
// and the ones the coach cites. All inputs/outputs in consistent chip units.

// Break-even equity needed to call: toCall / (pot_after_call).
export function potOdds(toCall: number, pot: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}

// Minimum Defense Frequency vs a bet: pot / (pot + bet). The fraction of your range
// you must continue with to stop a bluff from being automatically profitable.
export function mdf(bet: number, pot: number): number {
  if (bet <= 0) return 1;
  return pot / (pot + bet);
}

// Alpha = required fold equity for a bluff to break even = bet / (pot + bet).
// Also equals the fraction of range the defender may fold (1 - MDF).
export function alpha(bet: number, pot: number): number {
  if (bet <= 0) return 0;
  return bet / (pot + bet);
}

// Rule of 2 and 4: quick equity estimate from outs.
//   flop with two cards to come ~ outs * 4 ; turn with one to come ~ outs * 2  (percent)
export function outsEquity(outs: number, cardsToCome: 1 | 2): number {
  return cardsToCome === 2 ? Math.min(0.92, outs * 0.04) : Math.min(0.92, outs * 0.02);
}

// Required fold equity for a pure bluff of `risk` into a `pot` (= alpha).
export function requiredFoldEquity(risk: number, pot: number): number {
  return alpha(risk, pot);
}

export function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function bb(x: number, digits = 2): string {
  return `${x.toFixed(digits)}bb`;
}
