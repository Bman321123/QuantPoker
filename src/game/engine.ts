// Hand engine for heads-up no-limit. The hero is randomly seated on the button or in the
// big blind each hand, with correct turn order (button/SB acts first preflop, BB acts first
// postflop). The villain plays both seats via the policy in ../engine/villain. We also track
// the range the villain believes the hero represents, so the villain can bluff-catch and
// raise against a realistic model of the hero rather than against itself.
import { Card, deckWithout, shuffle } from "../engine/cards";
import { evalCards, describeHand } from "../engine/evaluator";
import { Combo, Range, countCombos } from "../engine/combos";
import { cloneRange, BB_VS_LIMP, HU_SB_OPEN, HU_BB_CALL, HU_BB_3BET, HU_VS_3BET_CALL, HU_4BET } from "../engine/ranges";
import { evaluateActions, betCandidates, evLoss, Candidate, EVResult } from "../engine/ev";
import { topFractionRange } from "../engine/narrow";
import { toneFromEvLoss } from "../engine/coach";
import {
  VillainAction,
  villainOpen,
  villainVsLimp,
  villainVsOpen,
  villainVs3bet,
  villainVs4bet,
  villainBetOrCheck,
  villainFacingBet,
  villainBetRange,
  callDefendFrac,
  bbCallRange,
  topPreflopRange,
} from "../engine/villain";
import { HandState, DecisionView, DecisionRecord, HandResult, Street } from "./types";

const SB = 0.5;
const BB = 1;
const START_STACK = 100;
const PREFLOP_OPENS = [2, 2.5, 3];
const PREFLOP_RAISE_CAP = 3; // open, 3-bet, 4-bet — beyond this only call/fold/jam
const EPS = 1e-6;

let handCounter = 0;

export function newHand(rng: () => number = Math.random): HandState {
  const deck = shuffle(
    Array.from({ length: 52 }, (_, i) => i),
    rng
  );
  const hero: Combo = [deck[0], deck[1]];
  const villain: Combo = [deck[2], deck[3]];
  const heroIsButton = rng() < 0.5;

  handCounter++;
  const s: HandState = {
    id: `h${handCounter}_${Date.now()}`,
    street: "preflop",
    board: [],
    pot: SB + BB,
    heroStack: START_STACK - (heroIsButton ? SB : BB),
    villainStack: START_STACK - (heroIsButton ? BB : SB),
    hero,
    villain,
    // wide priors before anyone acts; refined as preflop action unfolds
    villainRange: heroIsButton ? topPreflopRange(0.9) : cloneRange(HU_SB_OPEN),
    heroRange: heroIsButton ? cloneRange(HU_SB_OPEN) : topPreflopRange(0.9),
    heroIsButton,
    heroInPosition: heroIsButton,
    betToMatch: BB,
    heroStreetInvested: heroIsButton ? SB : BB,
    villainStreetInvested: heroIsButton ? BB : SB,
    streetAgg: 0,
    toCall: 0,
    villainChecked: false,
    awaiting: "hero",
    log: [],
  };

  s.log.push(
    heroIsButton
      ? "You're on the button (small blind). Action to you."
      : "You're in the big blind. Villain is on the button."
  );

  if (heroIsButton) {
    setHeroToAct(s);
  } else {
    // villain (button) acts first preflop
    villainActPreflop(s, rng);
  }
  return s;
}

function clone(s: HandState): HandState {
  return {
    ...s,
    board: [...s.board],
    log: [...s.log],
    villainRange: { ...s.villainRange },
    heroRange: { ...s.heroRange },
  };
}

// Set the hero to act and recompute what they're facing.
function setHeroToAct(s: HandState): void {
  s.awaiting = "hero";
  s.toCall = Math.max(0, round1(s.betToMatch - s.heroStreetInvested));
}

function round1(x: number): number {
  return Math.round(x * 2) / 2;
}

// ---- Hero decision view (what the UI renders + what's scored) ----

export function heroDecision(s: HandState, iters = 2000): DecisionView {
  const dead: Card[] = [s.hero[0], s.hero[1], ...s.board];
  const combos = countCombos(s.villainRange, dead);
  const toCall = s.toCall;
  const facingBet = toCall > 0 && s.street !== "preflop";
  const candidates = heroCandidates(s);

  const evResult = evaluateActions({
    hero: s.hero,
    villainRange: s.villainRange,
    board: s.board,
    pot: s.pot,
    toCall: toCall > 0 ? toCall : 0,
    candidates,
    iters,
  });

  const betInPlay = toCall > 0 ? toCall : undefined;
  const potBeforeBet = toCall > 0 ? s.pot - toCall : undefined;

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
      toCall,
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
      toCall,
      betInPlay,
      potBeforeBet,
    },
  };
}

// Build the legal hero actions for the current spot.
function heroCandidates(s: HandState): Candidate[] {
  const toCall = s.toCall;
  const stack = s.heroStack;
  const out: Candidate[] = [];

  if (s.street === "preflop") {
    if (toCall > 0) {
      out.push({ kind: "fold", amount: 0, label: "Fold" });
      out.push(callCandidate(s, s.streetAgg === 0 ? "Limp" : "Call"));
      if (s.streetAgg === 0) {
        // opening (hero is the button)
        for (const r of PREFLOP_OPENS) addRaise(out, s, r, `Raise to ${r}bb`);
      } else if (s.streetAgg < PREFLOP_RAISE_CAP) {
        // facing a raise: 3-bet / 4-bet
        const word = s.streetAgg === 1 ? "3-bet" : "4-bet";
        addRaise(out, s, round1(s.betToMatch * 3), `${word} to ${round1(s.betToMatch * 3)}bb`);
        addAllIn(out, s);
      } else {
        addAllIn(out, s);
      }
    } else {
      // big blind option after a limp
      out.push({ kind: "check", amount: 0, label: "Check" });
      addRaise(out, s, 3.5, "Raise to 3.5bb");
      addRaise(out, s, 5, "Raise to 5bb");
    }
    return out;
  }

  // postflop
  if (toCall > 0) {
    out.push({ kind: "fold", amount: 0, label: "Fold" });
    out.push(callCandidate(s, `Call ${round1(toCall)}bb`));
    if (s.streetAgg === 1 && stack > toCall + EPS) {
      // hero may raise the first bet of the street (we cap at one raise per street)
      for (const c of betCandidates(s.pot, stack, true)) {
        if (c.amount > s.betToMatch + EPS) {
          out.push({ ...c, amount: round1(c.amount - s.heroStreetInvested), label: raiseLabel(c) });
        }
      }
    }
  } else {
    out.push({ kind: "check", amount: 0, label: "Check" });
    out.push(...betCandidates(s.pot, stack, false));
  }
  return out;
}

function callCandidate(s: HandState, label: string): Candidate {
  const amt = Math.min(s.heroStack, round1(s.toCall));
  return { kind: "call", amount: amt, label };
}

function raiseLabel(c: Candidate): string {
  return c.label === "All-in" ? "All-in" : `Raise ${c.label}`;
}

// Add a preflop raise/open to total `toAmount`, computing the incremental commitment.
function addRaise(out: Candidate[], s: HandState, toAmount: number, label: string): void {
  if (toAmount <= s.betToMatch + EPS) return;
  const add = round1(toAmount - s.heroStreetInvested);
  if (add >= s.heroStack - EPS) return; // would be all-in; offered separately
  out.push({ kind: s.streetAgg === 0 && s.street === "preflop" ? "bet" : "raise", amount: add, label });
}

function addAllIn(out: Candidate[], s: HandState): void {
  if (s.heroStack <= EPS) return;
  out.push({ kind: s.streetAgg === 0 ? "bet" : "raise", amount: round1(s.heroStack), label: "All-in" });
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

  if (s.street === "preflop") applyHeroPreflop(s, chosen, rng);
  else applyHeroPostflop(s, chosen, rng);

  return { state: s, record };
}

// ---- preflop ----

function applyHeroPreflop(s: HandState, chosen: Candidate, rng: () => number): void {
  if (chosen.kind === "fold") {
    s.villainStack += s.pot;
    return finishFold(s, false, "You fold preflop.", rng);
  }

  if (chosen.kind === "check") {
    // BB checks its option behind a limp — see a flop
    s.log.push("You check your option.");
    s.heroRange = cloneRange(BB_VS_LIMP);
    return goToFlop(s, rng);
  }

  if (chosen.kind === "call") {
    commit(s, "hero", chosen.amount);
    if (s.streetAgg === 0) {
      // hero (button) limps — BB still has the option
      s.log.push("You limp.");
      s.heroRange = cloneRange(BB_VS_LIMP);
      return villainActPreflop(s, rng);
    }
    // hero calls a raise — preflop betting closes
    s.log.push(`You call ${round1(chosen.amount)}bb.`);
    s.heroRange = heroPreflopRangeOnCall(s);
    return goToFlop(s, rng);
  }

  // raise / open / 3-bet / 4-bet / jam
  commit(s, "hero", chosen.amount);
  s.betToMatch = s.heroStreetInvested;
  s.streetAgg += 1;
  s.lastAggressor = "hero";
  s.heroRange = heroPreflopRangeOnRaise(s);
  s.log.push(`You ${heroRaiseWord(s)} to ${round1(s.heroStreetInvested)}bb.`);
  villainActPreflop(s, rng);
}

function heroRaiseWord(s: HandState): string {
  if (s.streetAgg === 1) return s.heroIsButton ? "open" : "raise";
  if (s.streetAgg === 2) return "3-bet";
  return "4-bet";
}

function heroPreflopRangeOnRaise(s: HandState): Range {
  if (s.streetAgg === 1) return s.heroIsButton ? cloneRange(HU_SB_OPEN) : cloneRange(HU_BB_3BET);
  if (s.streetAgg === 2) return cloneRange(HU_BB_3BET);
  return cloneRange(HU_4BET);
}

function heroPreflopRangeOnCall(s: HandState): Range {
  if (s.streetAgg === 1) return cloneRange(HU_BB_CALL); // called an open
  if (s.streetAgg === 2) return cloneRange(HU_VS_3BET_CALL); // called a 3-bet
  return cloneRange(HU_4BET); // called a 4-bet+
}

// Villain takes its preflop turn(s), then either ends the hand, advances to the flop, or
// hands the action back to the hero.
function villainActPreflop(s: HandState, rng: () => number): void {
  const toCall = round1(s.betToMatch - s.villainStreetInvested);
  let act: VillainAction;

  if (s.streetAgg === 0 && !s.heroIsButton) {
    // villain is the button, first in — open the pot
    act = villainOpen(s.villain, rng);
  } else if (toCall <= 0) {
    // villain is the BB with the option behind a hero limp
    act = villainVsLimp(s.villain, rng);
  } else if (s.streetAgg === 1) {
    act = villainVsOpen(s.villain, s.betToMatch, rng);
  } else if (s.streetAgg === 2) {
    act = villainVs3bet(s.villain, s.betToMatch, rng);
  } else {
    act = villainVs4bet(s.villain);
  }

  switch (act.kind) {
    case "fold":
      s.heroStack += s.pot;
      return finishFold(s, true, "Villain folds preflop. You take the blinds.", rng);

    case "check":
      // BB checks behind a limp — flop
      s.log.push("Villain checks.");
      s.heroRange = cloneRange(BB_VS_LIMP);
      s.villainRange = cloneRange(BB_VS_LIMP);
      return goToFlop(s, rng);

    case "call": {
      const add = Math.min(s.villainStack, round1(s.betToMatch - s.villainStreetInvested));
      commit(s, "villain", add);
      if (s.streetAgg === 0) {
        // villain limps the button — hero (BB) gets the option
        s.log.push("Villain limps.");
        s.villainRange = cloneRange(BB_VS_LIMP);
        return setHeroToAct(s);
      }
      // villain calls the hero's raise — flop
      s.log.push("Villain calls.");
      s.villainRange = villainPreflopRangeOnCall(s);
      return goToFlop(s, rng);
    }

    case "raise": {
      const to = Math.min(s.villainStreetInvested + s.villainStack, act.to);
      commit(s, "villain", round1(to - s.villainStreetInvested));
      s.betToMatch = s.villainStreetInvested;
      s.streetAgg += 1;
      s.lastAggressor = "villain";
      s.villainRange = villainPreflopRangeOnRaise(s);
      s.log.push(`Villain ${villainRaiseWord(s)} to ${round1(s.villainStreetInvested)}bb.`);
      return setHeroToAct(s);
    }
  }
}

function villainRaiseWord(s: HandState): string {
  if (s.streetAgg === 1) return s.heroIsButton ? "raises" : "opens";
  if (s.streetAgg === 2) return "3-bets";
  return "4-bets";
}

function villainPreflopRangeOnRaise(s: HandState): Range {
  if (s.streetAgg === 1) return s.heroIsButton ? cloneRange(HU_BB_3BET) : cloneRange(HU_SB_OPEN);
  if (s.streetAgg === 2) return cloneRange(HU_BB_3BET);
  return cloneRange(HU_4BET);
}

function villainPreflopRangeOnCall(s: HandState): Range {
  // streetAgg===1: villain called the hero's open (as the BB) or limp-called (as the button).
  // Either way its policy is the price-based defend + mandatory-defend guard, so the
  // displayed range must be the same — bbCallRange keeps the combo counts honest.
  if (s.streetAgg === 1) return bbCallRange(s.betToMatch);
  if (s.streetAgg === 2) return cloneRange(HU_VS_3BET_CALL);
  return cloneRange(HU_4BET);
}

function goToFlop(s: HandState, rng: () => number): void {
  startStreet(s, "flop", rng);
}

// ---- postflop ----

function applyHeroPostflop(s: HandState, chosen: Candidate, rng: () => number): void {
  const dead: Card[] = [s.hero[0], s.hero[1], ...s.board];

  if (chosen.kind === "fold") {
    s.villainStack += s.pot;
    return finishFold(s, false, "You fold.", rng);
  }

  if (chosen.kind === "call") {
    commit(s, "hero", chosen.amount);
    s.log.push(`You call ${round1(chosen.amount)}bb.`);
    clearBet(s);
    return completeStreet(s, rng);
  }

  if (chosen.kind === "check") {
    s.log.push("You check.");
    if (s.villainChecked) {
      // hero is in position and villain already checked → close the street
      return completeStreet(s, rng);
    }
    // hero is out of position, first to act → villain now responds to the check
    return villainAfterHeroCheck(s, rng);
  }

  // bet or raise
  const potBefore = s.pot;
  commit(s, "hero", chosen.amount);
  s.betToMatch = s.heroStreetInvested;
  s.streetAgg += 1;
  s.lastAggressor = "hero";
  s.potBeforeBet = potBefore;
  s.betInPlay = s.betToMatch;
  s.log.push(chosen.kind === "raise" ? `You raise to ${round1(s.betToMatch)}bb.` : `You bet ${round1(s.betToMatch)}bb.`);
  villainRespondToHeroBet(s, potBefore, dead, rng);
}

// Villain is first to act on a street (it is out of position) — lead or check.
function villainLeadOrCheck(s: HandState, rng: () => number): void {
  const act = villainBetOrCheck(s.villain, s.villainRange, s.board, s.pot, s.villainStack, rng);
  if (act.kind === "bet") return villainOpensBetting(s, act.to, rng);
  s.villainChecked = true;
  s.log.push("Villain checks.");
  setHeroToAct(s);
}

// Villain acts after the hero (OOP) checks — bet or check behind.
function villainAfterHeroCheck(s: HandState, rng: () => number): void {
  const act = villainBetOrCheck(s.villain, s.villainRange, s.board, s.pot, s.villainStack, rng);
  if (act.kind === "bet") return villainOpensBetting(s, act.to, rng);
  s.log.push("Villain checks back.");
  return completeStreet(s, rng);
}

// Villain puts in the first bet of the street; hand the action to the hero.
function villainOpensBetting(s: HandState, to: number, rng: () => number): void {
  const potBefore = s.pot;
  const amt = Math.min(s.villainStack, round1(to));
  commit(s, "villain", amt);
  s.betToMatch = s.villainStreetInvested;
  s.streetAgg += 1;
  s.lastAggressor = "villain";
  s.villainRange = villainBetRange(s.villainRange, s.board);
  s.potBeforeBet = potBefore;
  s.betInPlay = amt;
  s.log.push(`Villain bets ${round1(amt)}bb.`);
  setHeroToAct(s);
}

// Villain responds to a hero bet or raise: fold / call / (raise, only if action is still open).
function villainRespondToHeroBet(s: HandState, potBefore: number, dead: Card[], rng: () => number): void {
  const res = villainFacingBet(
    s.villain,
    s.heroRange,
    s.board,
    s.betToMatch,
    s.villainStreetInvested,
    potBefore,
    s.villainStack,
    rng
  );
  let act = res.action;
  // Cap postflop at one raise per street: if the hero already raised (streetAgg ≥ 2), the
  // villain can only call or fold.
  if (act.kind === "raise" && s.streetAgg >= 2) act = { kind: "call" };

  if (act.kind === "fold") {
    s.heroStack += s.pot;
    return finishFold(s, true, "Villain folds.", rng);
  }

  if (act.kind === "raise") {
    const to = Math.min(s.villainStreetInvested + s.villainStack, act.to);
    commit(s, "villain", round1(to - s.villainStreetInvested));
    s.betToMatch = s.villainStreetInvested;
    s.streetAgg += 1;
    s.lastAggressor = "villain";
    s.villainRange = villainBetRange(s.villainRange, s.board);
    s.potBeforeBet = potBefore;
    s.betInPlay = round1(s.betToMatch - s.heroStreetInvested);
    s.log.push(`Villain raises to ${round1(s.betToMatch)}bb.`);
    return setHeroToAct(s);
  }

  // call
  const add = Math.min(s.villainStack, round1(s.betToMatch - s.villainStreetInvested));
  commit(s, "villain", add);
  // narrow the villain's displayed range to the portion that continues
  s.villainRange = topFractionRange(s.villainRange, s.board, dead, callDefendFrac(s.betInPlay ?? add, potBefore));
  s.log.push("Villain calls.");
  clearBet(s);
  completeStreet(s, rng);
}

// ---- money & flow helpers ----

function commit(s: HandState, who: "hero" | "villain", add: number): void {
  const amt = round1(Math.max(0, add));
  if (who === "hero") {
    s.heroStack = round1(s.heroStack - amt);
    s.heroStreetInvested = round1(s.heroStreetInvested + amt);
  } else {
    s.villainStack = round1(s.villainStack - amt);
    s.villainStreetInvested = round1(s.villainStreetInvested + amt);
  }
  s.pot = round1(s.pot + amt);
}

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
  if (!next) return finishShowdown(s, "Showdown.", rng);
  startStreet(s, next, rng);
}

function startStreet(s: HandState, street: Street, rng: () => number): void {
  s.street = street;
  if (street === "flop") dealCards(s, 3, rng);
  else dealCards(s, 1, rng);

  s.betToMatch = 0;
  s.heroStreetInvested = 0;
  s.villainStreetInvested = 0;
  s.streetAgg = 0;
  s.lastAggressor = undefined;
  s.villainChecked = false;
  clearBet(s);

  if (s.heroStack <= EPS || s.villainStack <= EPS) {
    return finishShowdown(s, "All-in runout.", rng);
  }

  if (s.heroIsButton) {
    // villain is the big blind → out of position → acts first
    villainLeadOrCheck(s, rng);
  } else {
    // hero is the big blind → out of position → acts first
    setHeroToAct(s);
  }
}

function runOutBoard(s: HandState, rng: () => number): void {
  while (s.board.length < 5) dealCards(s, 1, rng);
}

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

function finishFold(s: HandState, heroWon: boolean, reason: string, rng: () => number): void {
  clearBet(s); // nothing left to call once the hand is over
  runOutBoard(s, rng);
  const r = evaluateRunout(s);
  s.result = {
    heroDelta: round1(s.heroStack - START_STACK),
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
  clearBet(s);
  runOutBoard(s, rng);
  const r = evaluateRunout(s);
  let heroWon: boolean | "split";
  if (r.showdownWinner === "hero") {
    s.heroStack = round1(s.heroStack + s.pot);
    heroWon = true;
  } else if (r.showdownWinner === "villain") {
    s.villainStack = round1(s.villainStack + s.pot);
    heroWon = false;
  } else {
    s.heroStack = round1(s.heroStack + s.pot / 2);
    s.villainStack = round1(s.villainStack + s.pot / 2);
    heroWon = "split";
  }
  s.result = {
    heroDelta: round1(s.heroStack - START_STACK),
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
