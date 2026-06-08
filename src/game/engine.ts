// Hand engine: deals, runs the villain, advances streets, and exposes hero decision points.
// Single villain for v1; seat handling is structured so more seats can be added later.
import { Card, deckWithout, shuffle } from "../engine/cards";
import { evalCards, describeHand } from "../engine/evaluator";
import { Combo, countCombos } from "../engine/combos";
import { cloneRange, BB_DEFEND, BB_VS_LIMP } from "../engine/ranges";
import { evaluateActions, betCandidates, evLoss, Candidate, EVResult } from "../engine/ev";
import { topFractionRange } from "../engine/narrow";
import { mdf } from "../engine/theory";
import { toneFromEvLoss } from "../engine/coach";
import {
  villainPreflopContinue,
  villainFirstAction,
  villainFacingBet,
  villainBetRange,
} from "../engine/villain";
import { HandState, DecisionView, DecisionRecord, HandResult, Street } from "./types";

const SB = 0.5;
const BB = 1;
const START_STACK = 100;
const PREFLOP_OPENS = [2, 2.5, 3];

let handCounter = 0;

export function newHand(rng: () => number = Math.random): HandState {
  const deck = shuffle(
    Array.from({ length: 52 }, (_, i) => i),
    rng
  );
  const hero: Combo = [deck[0], deck[1]];
  const villain: Combo = [deck[2], deck[3]];

  handCounter++;
  return {
    id: `h${handCounter}_${Date.now()}`,
    street: "preflop",
    board: [],
    pot: SB + BB, // dead SB + villain's BB
    heroStack: START_STACK,
    villainStack: START_STACK - BB,
    hero,
    villain,
    villainRange: cloneRange(BB_DEFEND),
    toCall: BB,
    heroInPosition: true,
    villainChecked: false,
    awaiting: "hero",
    log: ["Folded to you on the button."],
  };
}

function clone(s: HandState): HandState {
  return { ...s, board: [...s.board], log: [...s.log], villainRange: { ...s.villainRange } };
}

// ---- Hero decision view (what the UI renders + what's scored) ----

export function heroDecision(s: HandState, iters = 2000): DecisionView {
  const dead: Card[] = [s.hero[0], s.hero[1], ...s.board];
  const combos = countCombos(s.villainRange, dead);
  const facingBet = s.toCall > 0 && s.street !== "preflop";

  let candidates: Candidate[];
  if (s.street === "preflop") {
    candidates = [
      { kind: "fold", amount: 0, label: "Fold" },
      { kind: "call", amount: BB, label: `Call ${BB}bb` }, // limp
    ];
    for (const r of PREFLOP_OPENS) {
      if (r < s.heroStack) candidates.push({ kind: "bet", amount: r, label: `Raise ${r}bb` });
    }
  } else if (facingBet) {
    candidates = [
      { kind: "fold", amount: 0, label: "Fold" },
      { kind: "call", amount: s.toCall, label: `Call ${s.toCall}bb` },
    ];
    for (const c of betCandidates(s.pot, s.heroStack, true)) {
      if (c.amount > s.toCall) candidates.push(c);
    }
  } else {
    candidates = [{ kind: "check", amount: 0, label: "Check" }];
    candidates.push(...betCandidates(s.pot, s.heroStack, false));
  }

  const evResult = evaluateActions({
    hero: s.hero,
    villainRange: s.villainRange,
    board: s.board,
    pot: s.pot,
    toCall: s.street === "preflop" ? BB : s.toCall,
    candidates,
    iters,
  });

  return {
    candidates,
    evResult,
    equity: evResult.equity,
    combos,
    facingBet,
    coachCtx: {
      street: s.street,
      equity: evResult.equity,
      pot: s.pot,
      toCall: s.toCall,
      combos,
      heroInPosition: s.heroInPosition,
      evResult,
    },
    quizCtx: {
      villainRange: s.villainRange,
      board: s.board,
      hero: s.hero,
      combos,
      equity: evResult.equity,
      pot: s.pot,
      toCall: s.toCall,
      betInPlay: s.betInPlay,
      potBeforeBet: s.potBeforeBet,
    },
  };
}

function makeRecord(s: HandState, ev: EVResult, idx: number): DecisionRecord {
  const loss = evLoss(ev, idx);
  return {
    handId: s.id,
    street: s.street,
    actionLabel: ev.actions[idx].label,
    bestLabel: ev.actions[ev.bestIndex].label,
    evLoss: loss,
    equity: ev.equity,
    tone: toneFromEvLoss(loss),
    matchedBest: idx === ev.bestIndex,
  };
}

// ---- Apply a hero action; advances the hand until the next hero decision or hand end ----

export function applyHeroAction(
  state: HandState,
  decision: DecisionView,
  idx: number,
  rng: () => number = Math.random
): { state: HandState; record: DecisionRecord } {
  const s = clone(state);
  const chosen = decision.candidates[idx];
  const record = makeRecord(state, decision.evResult, idx);

  if (s.street === "preflop") {
    if (chosen.kind === "fold") {
      finishFold(s, false, "You folded the button.", rng);
      return { state: s, record };
    }
    if (chosen.kind === "call") {
      // limp: complete the BB, villain checks its option, see a flop vs a wide range
      s.heroStack -= BB;
      s.pot += BB;
      s.log.push("You limp.");
      s.villainRange = cloneRange(BB_VS_LIMP);
      s.toCall = 0;
      startStreet(s, "flop", rng);
      return { state: s, record };
    }
    const r = chosen.amount;
    s.heroStack -= r;
    s.pot += r - 0; // pot was 1.5; hero adds r
    s.log.push(`You raise to ${r}bb.`);
    if (villainPreflopContinue(s.villain)) {
      s.villainStack -= r - BB; // already posted BB
      s.pot += r - BB;
      s.log.push("Villain calls.");
      s.toCall = 0;
      startStreet(s, "flop", rng);
    } else {
      s.heroStack += s.pot; // win the blinds
      finishFold(s, true, "Villain folds. You take the blinds.", rng);
    }
    return { state: s, record };
  }

  // postflop
  const dead: Card[] = [s.hero[0], s.hero[1], ...s.board];

  if (decision.facingBet) {
    if (chosen.kind === "fold") {
      s.villainStack += s.pot;
      finishFold(s, false, "You fold.", rng);
      return { state: s, record };
    }
    if (chosen.kind === "call") {
      s.heroStack -= s.toCall;
      s.pot += s.toCall;
      s.log.push(`You call ${s.toCall}bb.`);
      clearBet(s);
      completeStreet(s, rng);
      return { state: s, record };
    }
    // raise
    const R = chosen.amount;
    const potBefore = s.pot;
    const betFaced = s.betInPlay ?? 0;
    s.heroStack -= R;
    s.pot += R;
    s.log.push(`You raise to ${R}bb.`);
    if (villainFacingBet(s.villain, s.villainRange, s.board, R, potBefore) === "fold") {
      s.heroStack += s.pot;
      finishFold(s, true, "Villain folds to your raise.", rng);
    } else {
      const add = Math.min(s.villainStack, R - betFaced);
      s.villainStack -= add;
      s.pot += add;
      s.villainRange = topFractionRange(s.villainRange, s.board, dead, mdf(R, potBefore));
      s.log.push("Villain calls.");
      clearBet(s);
      completeStreet(s, rng);
    }
    return { state: s, record };
  }

  // not facing a bet: check or bet
  if (chosen.kind === "check") {
    s.log.push("You check back.");
    completeStreet(s, rng);
    return { state: s, record };
  }
  // bet
  const b = chosen.amount;
  const potBefore = s.pot;
  s.heroStack -= b;
  s.pot += b;
  s.log.push(`You bet ${b}bb.`);
  if (villainFacingBet(s.villain, s.villainRange, s.board, b, potBefore) === "fold") {
    s.heroStack += s.pot;
    finishFold(s, true, "Villain folds to your bet.", rng);
  } else {
    const add = Math.min(s.villainStack, b);
    s.villainStack -= add;
    s.pot += add;
    s.villainRange = topFractionRange(s.villainRange, s.board, dead, mdf(b, potBefore));
    s.log.push("Villain calls.");
    completeStreet(s, rng);
  }
  return { state: s, record };
}

// ---- internal flow ----

function clearBet(s: HandState): void {
  s.toCall = 0;
  s.betInPlay = undefined;
  s.potBeforeBet = undefined;
}

function dealCards(s: HandState, n: number, rng: () => number): void {
  const used = new Set<Card>([s.hero[0], s.hero[1], s.villain[0], s.villain[1], ...s.board]);
  const avail = deckWithout(used, rng);
  for (let i = 0; i < n; i++) s.board.push(avail[i]);
}

const NEXT: Record<Street, Street | null> = { preflop: "flop", flop: "turn", turn: "river", river: null };

function completeStreet(s: HandState, rng: () => number): void {
  const next = NEXT[s.street];
  if (!next) return finishShowdown(s, "Checked down to showdown.", rng);
  startStreet(s, next, rng);
}

function startStreet(s: HandState, street: Street, rng: () => number): void {
  s.street = street;
  if (street === "flop") dealCards(s, 3, rng);
  else dealCards(s, 1, rng);
  clearBet(s);
  s.villainChecked = false;

  if (s.heroStack <= 1e-6 || s.villainStack <= 1e-6) {
    runoutAndShowdown(s, rng);
    return;
  }

  const va = villainFirstAction(s.villain, s.villainRange, s.board, s.pot, s.villainStack, rng);
  if (va.kind === "check") {
    s.villainChecked = true;
    s.awaiting = "hero";
    s.log.push(`Villain checks.`);
  } else {
    const b = Math.min(va.amount, s.villainStack);
    s.potBeforeBet = s.pot;
    s.villainRange = villainBetRange(s.villainRange, s.board);
    s.pot += b;
    s.villainStack -= b;
    s.toCall = b;
    s.betInPlay = b;
    s.awaiting = "hero";
    s.log.push(`Villain leads ${b}bb.`);
  }
}

function runoutAndShowdown(s: HandState, rng: () => number): void {
  finishShowdown(s, "All-in runout.", rng);
}

function runOutBoard(s: HandState, rng: () => number): void {
  while (s.board.length < 5) dealCards(s, 1, rng);
}

// Evaluate both hands on the (completed) board and label them.
function evaluateRunout(s: HandState): {
  showdownWinner: "hero" | "villain" | "split";
  heroHandLabel: string;
  villainHandLabel: string;
} {
  const heroCards = [s.hero[0], s.hero[1], ...s.board];
  const villainCards = [s.villain[0], s.villain[1], ...s.board];
  const hScore = evalCards(heroCards);
  const vScore = evalCards(villainCards);
  return {
    showdownWinner: hScore > vScore ? "hero" : hScore < vScore ? "villain" : "split",
    heroHandLabel: describeHand(heroCards).label,
    villainHandLabel: describeHand(villainCards).label,
  };
}

// Hand ended by a fold. The pot is already awarded by the caller; we still run the board
// out and reveal so the player sees the realistic result (and what would've happened).
function finishFold(s: HandState, heroWon: boolean, reason: string, rng: () => number): void {
  runOutBoard(s, rng);
  const r = evaluateRunout(s);
  s.result = {
    heroDelta: s.heroStack - START_STACK,
    showdown: false,
    wonByFold: true,
    heroWon,
    reason,
    villainCombo: s.villain,
    board: [...s.board],
    ...r,
  };
  s.awaiting = "done";
}

function finishShowdown(s: HandState, reason: string, rng: () => number): void {
  runOutBoard(s, rng);
  const r = evaluateRunout(s);
  let heroWon: boolean | "split";
  if (r.showdownWinner === "hero") {
    s.heroStack += s.pot;
    heroWon = true;
  } else if (r.showdownWinner === "villain") {
    s.villainStack += s.pot;
    heroWon = false;
  } else {
    s.heroStack += s.pot / 2;
    s.villainStack += s.pot / 2;
    heroWon = "split";
  }
  s.result = {
    heroDelta: s.heroStack - START_STACK,
    showdown: true,
    wonByFold: false,
    heroWon,
    reason,
    villainCombo: s.villain,
    board: [...s.board],
    ...r,
  };
  s.awaiting = "done";
}
